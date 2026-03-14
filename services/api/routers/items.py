import uuid
import os
import boto3
from botocore.exceptions import ClientError
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select, delete
from database import get_session
from ar_pipeline import (
    AR_PROVIDER_KIRI,
    AR_CAPTURE_MODE_PHOTO_SCAN,
    kiri_enabled,
    queue_conversion_from_existing_usdz,
    queue_kiri_generation,
    select_generation_input,
    validate_capture_mode,
)
from models import (
    ArCaptureAsset,
    Item,
    Category,
    Menu,
    ItemPhoto,
    Organization,
    ItemCreate,
    ItemUpdate,
    ItemRead,
    DietaryTag,
    Allergen,
    ItemOption,
    ItemOptionGroup,
    VisibilityRule,
)
from dependencies import get_current_user
from pathlib import Path
from permissions import get_org_permissions
from url_utils import forwarded_prefix
from sqlalchemy.orm import selectinload
from url_utils import normalize_upload_url
from storage_utils import (
    create_upload_target,
    delete_storage_key_best_effort as storage_delete_storage_key_best_effort,
    local_upload_dir as storage_local_upload_dir,
    local_uploads_enabled as storage_local_uploads_enabled,
    safe_local_path as storage_safe_local_path,
)

router = APIRouter(prefix="/items", tags=["items"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

ALLOWED_SELECTION_MODES = {"single", "multiple"}
ALLOWED_DISPLAY_STYLES = {"chips", "list", "cards"}
ALLOWED_VISIBILITY_KINDS = {"include", "exclude"}

class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str

class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    public_url: str


class ArCaptureAssetRead(BaseModel):
    id: uuid.UUID
    kind: str
    position: int
    url: str
    metadata_json: Optional[dict] = None
    created_at: datetime


class ItemArCapturesResponse(BaseModel):
    capture_mode: Optional[str] = None
    captures: List[ArCaptureAssetRead]


class ArDebugFrameRead(BaseModel):
    index: int
    filename: Optional[str] = None
    s3_key: str
    url: str
    timestamp_seconds: Optional[float] = None
    sharpness_score: Optional[float] = None
    selected_for_submission: Optional[bool] = None
    rejection_reason: Optional[str] = None
    hash_distance_from_previous_kept: Optional[int] = None


class ItemArDebugFramesResponse(BaseModel):
    storage_prefix: Optional[str] = None
    source_duration_seconds: Optional[float] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    requested_frame_count: Optional[int] = None
    submitted_frame_count: Optional[int] = None
    used_normalized_video: Optional[bool] = None
    frames: List[ArDebugFrameRead]


class AttachArCaptureRequest(BaseModel):
    s3_key: str
    url: str
    content_type: str
    filename: Optional[str] = None
    position: Optional[int] = None


class GenerateArRequest(BaseModel):
    capture_mode: str = AR_CAPTURE_MODE_PHOTO_SCAN

def _local_uploads_enabled() -> bool:
    return storage_local_uploads_enabled()

def _local_upload_dir() -> Path:
    return storage_local_upload_dir()

def _safe_local_path(key: str) -> Path:
    return storage_safe_local_path(key)


def _delete_storage_key_best_effort(s3_key: Optional[str]) -> None:
    storage_delete_storage_key_best_effort(s3_key)

def _item_org_permissions(session: Session, item: Item, user: dict):
    category = session.get(Category, item.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    menu = session.get(Menu, category.menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    perms = get_org_permissions(session, menu.org_id, user)
    return perms


def _normalize_item_media_urls(item: Item, request: Request) -> None:
    for photo in item.photos or []:
        photo.url = normalize_upload_url(photo.url, request)
    for group in item.option_groups or []:
        for option in group.options or []:
            option.image_url = normalize_upload_url(option.image_url, request)
    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)


def _validate_visibility_rules(rules: list, *, context: str) -> None:
    for idx, rule in enumerate(rules):
        if rule.kind not in ALLOWED_VISIBILITY_KINDS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid visibility rule kind at {context}[{idx}]",
            )
        if rule.start_date and rule.end_date and rule.start_date > rule.end_date:
            raise HTTPException(
                status_code=400,
                detail=f"Visibility rule start_date must be <= end_date at {context}[{idx}]",
            )
        bad_days = [
            day
            for day in (rule.days_of_week or [])
            if not isinstance(day, int) or day < 0 or day > 6
        ]
        if bad_days:
            raise HTTPException(
                status_code=400,
                detail=f"days_of_week must contain integers 0-6 at {context}[{idx}]",
            )


def _validate_option_groups(groups: list) -> None:
    for g_idx, group in enumerate(groups):
        if group.selection_mode not in ALLOWED_SELECTION_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid selection_mode at option_groups[{g_idx}]",
            )
        if group.display_style not in ALLOWED_DISPLAY_STYLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid display_style at option_groups[{g_idx}]",
            )
        if group.min_select < 0:
            raise HTTPException(
                status_code=400,
                detail=f"min_select must be >= 0 at option_groups[{g_idx}]",
            )
        if group.max_select is not None and group.max_select < 0:
            raise HTTPException(
                status_code=400,
                detail=f"max_select must be >= 0 at option_groups[{g_idx}]",
            )
        if group.max_select is not None and group.max_select < group.min_select:
            raise HTTPException(
                status_code=400,
                detail=f"max_select must be >= min_select at option_groups[{g_idx}]",
            )
        if group.selection_mode == "single":
            if group.max_select not in (None, 1):
                raise HTTPException(
                    status_code=400,
                    detail=f"single-select groups only support max_select=1 at option_groups[{g_idx}]",
                )
            if group.min_select > 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"single-select groups only support min_select<=1 at option_groups[{g_idx}]",
                )
        if group.options and group.min_select > len(group.options):
            raise HTTPException(
                status_code=400,
                detail=f"min_select exceeds options count at option_groups[{g_idx}]",
            )

        default_count = sum(1 for opt in group.options if opt.is_default)
        if group.selection_mode == "single" and default_count > 1:
            raise HTTPException(
                status_code=400,
                detail=f"single-select groups can only have one default option at option_groups[{g_idx}]",
            )

        for o_idx, option in enumerate(group.options):
            _validate_visibility_rules(
                option.visibility_rules or [],
                context=f"option_groups[{g_idx}].options[{o_idx}].visibility_rules",
            )


def _replace_item_options_and_visibility(
    *,
    session: Session,
    item: Item,
    option_groups: Optional[list],
    visibility_rules: Optional[list],
) -> None:
    if option_groups is not None:
        _validate_option_groups(option_groups)
    if visibility_rules is not None:
        _validate_visibility_rules(visibility_rules, context="visibility_rules")

    existing_groups = session.exec(
        select(ItemOptionGroup).where(ItemOptionGroup.item_id == item.id)
    ).all()
    existing_group_ids = [group.id for group in existing_groups]
    existing_option_ids: list[uuid.UUID] = []
    if existing_group_ids:
        existing_options = session.exec(
            select(ItemOption.id).where(ItemOption.group_id.in_(existing_group_ids))
        ).all()
        existing_option_ids = [row[0] if isinstance(row, tuple) else row for row in existing_options]

    if option_groups is not None and existing_option_ids:
        session.exec(
            delete(VisibilityRule).where(VisibilityRule.option_id.in_(existing_option_ids))
        )
    if option_groups is not None and existing_group_ids:
        session.exec(delete(ItemOption).where(ItemOption.group_id.in_(existing_group_ids)))
        session.exec(delete(ItemOptionGroup).where(ItemOptionGroup.id.in_(existing_group_ids)))

    if visibility_rules is not None:
        session.exec(delete(VisibilityRule).where(VisibilityRule.item_id == item.id))
        for rule in visibility_rules:
            session.add(
                VisibilityRule(
                    item_id=item.id,
                    kind=rule.kind,
                    days_of_week=rule.days_of_week,
                    start_time_local=rule.start_time_local,
                    end_time_local=rule.end_time_local,
                    start_date=rule.start_date,
                    end_date=rule.end_date,
                    is_active=rule.is_active,
                )
            )

    if option_groups is None:
        return

    for group in option_groups:
        db_group = ItemOptionGroup(
            item_id=item.id,
            name=group.name,
            description=group.description,
            selection_mode=group.selection_mode,
            min_select=group.min_select,
            max_select=group.max_select,
            display_style=group.display_style,
            position=group.position,
            is_active=group.is_active,
        )
        session.add(db_group)
        session.flush()

        for option in group.options or []:
            db_option = ItemOption(
                group_id=db_group.id,
                name=option.name,
                description=option.description,
                image_url=option.image_url,
                badge=option.badge,
                position=option.position,
                is_default=option.is_default,
                is_active=option.is_active,
            )
            session.add(db_option)
            session.flush()

            for rule in option.visibility_rules or []:
                session.add(
                    VisibilityRule(
                        option_id=db_option.id,
                        kind=rule.kind,
                        days_of_week=rule.days_of_week,
                        start_time_local=rule.start_time_local,
                        end_time_local=rule.end_time_local,
                        start_date=rule.start_date,
                        end_date=rule.end_date,
                        is_active=rule.is_active,
                    )
                )


def _load_item_with_relations(session: Session, item_id: uuid.UUID) -> Optional[Item]:
    item = session.exec(
        select(Item)
        .where(Item.id == item_id)
        .options(
            selectinload(Item.photos),
            selectinload(Item.dietary_tags),
            selectinload(Item.allergens),
            selectinload(Item.visibility_rules),
            selectinload(Item.option_groups)
            .selectinload(ItemOptionGroup.options)
            .selectinload(ItemOption.visibility_rules),
        )
    ).first()
    if not item:
        return None
    item.option_groups = sorted(item.option_groups or [], key=lambda g: g.position)
    for group in item.option_groups or []:
        group.options = sorted(group.options or [], key=lambda o: o.position)
    return item


def _load_ar_captures(session: Session, item_id: uuid.UUID) -> list[ArCaptureAsset]:
    return session.exec(
        select(ArCaptureAsset)
        .where(ArCaptureAsset.item_id == item_id)
        .order_by(ArCaptureAsset.position, ArCaptureAsset.created_at, ArCaptureAsset.id)
    ).all()


def _serialize_ar_capture_assets(captures: list[ArCaptureAsset], request: Request) -> list[ArCaptureAssetRead]:
    serialized: list[ArCaptureAssetRead] = []
    for capture in captures:
        serialized.append(
            ArCaptureAssetRead(
                id=capture.id,
                kind=capture.kind,
                position=capture.position,
                url=normalize_upload_url(capture.url, request) or capture.url,
                metadata_json=capture.metadata_json,
                created_at=capture.created_at,
            )
        )
    return serialized


def _serialize_debug_frames(raw_frames: list[dict], request: Request) -> list[ArDebugFrameRead]:
    serialized: list[ArDebugFrameRead] = []
    for index, frame in enumerate(raw_frames, start=1):
        if not isinstance(frame, dict):
            continue
        s3_key = frame.get("s3_key")
        url = frame.get("url")
        if not isinstance(s3_key, str) or not isinstance(url, str):
            continue
        serialized.append(
            ArDebugFrameRead(
                index=int(frame.get("index") or index),
                filename=frame.get("filename") if isinstance(frame.get("filename"), str) else None,
                s3_key=s3_key,
                url=normalize_upload_url(url, request) or url,
                timestamp_seconds=float(frame.get("timestamp_seconds"))
                if isinstance(frame.get("timestamp_seconds"), (float, int))
                else None,
                sharpness_score=float(frame.get("sharpness_score"))
                if isinstance(frame.get("sharpness_score"), (float, int))
                else None,
                selected_for_submission=frame.get("selected_for_submission")
                if isinstance(frame.get("selected_for_submission"), bool)
                else None,
                rejection_reason=frame.get("rejection_reason")
                if isinstance(frame.get("rejection_reason"), str)
                else None,
                hash_distance_from_previous_kept=frame.get("hash_distance_from_previous_kept")
                if isinstance(frame.get("hash_distance_from_previous_kept"), int)
                else None,
            )
        )
    return serialized

@router.get("/{item_id}", response_model=ItemRead)
def get_item(item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep):
    item = _load_item_with_relations(session, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_view:
        raise HTTPException(status_code=403, detail="Not authorized")

    _normalize_item_media_urls(item, request)
    return ItemRead.model_validate(item)

@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, request: Request, user: dict = UserDep):
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        if _local_uploads_enabled():
            key = f"items/{uuid.uuid4()}-{os.path.basename(req.filename)}"
            prefix = forwarded_prefix(request)
            base = prefix or ""
            return {
                "upload_url": f"{base}/items/local-upload/{key}",
                "s3_key": key,
                "public_url": f"{base}/uploads/{key}",
            }
        raise HTTPException(status_code=500, detail="S3 configuration missing")

    s3_client = boto3.client('s3')
    
    # Generate unique key: org_id/items/uuid-filename ?? 
    # specific structure: items/{uuid}-{filename}
    key = f"items/{uuid.uuid4()}-{req.filename}"
    
    try:
        response = s3_client.generate_presigned_url('put_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': key,
                                                            'ContentType': req.content_type},
                                                    ExpiresIn=3600)
    except ClientError as e:
        print(e)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return {
        "upload_url": response,
        "s3_key": key,
        "public_url": f"https://{bucket_name}.s3.amazonaws.com/{key}"
    }


@router.get("/{item_id}/ar/captures", response_model=ItemArCapturesResponse)
def list_ar_captures(
    item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_view:
        raise HTTPException(status_code=403, detail="Not authorized")

    captures = _load_ar_captures(session, item_id)
    return ItemArCapturesResponse(
        capture_mode=item.ar_capture_mode or AR_CAPTURE_MODE_PHOTO_SCAN,
        captures=_serialize_ar_capture_assets(captures, request),
    )


@router.get("/{item_id}/ar/debug-frames", response_model=ItemArDebugFramesResponse)
def list_ar_debug_frames(
    item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    extraction = {}
    if isinstance(item.ar_metadata_json, dict):
        raw_extraction = item.ar_metadata_json.get("video_frame_extraction")
        if isinstance(raw_extraction, dict):
            extraction = raw_extraction

    raw_frames = extraction.get("persisted_frames")
    return ItemArDebugFramesResponse(
        storage_prefix=extraction.get("storage_prefix")
        if isinstance(extraction.get("storage_prefix"), str)
        else None,
        source_duration_seconds=extraction.get("source_duration_seconds")
        if isinstance(extraction.get("source_duration_seconds"), (float, int))
        else None,
        source_width=extraction.get("source_width")
        if isinstance(extraction.get("source_width"), int)
        else None,
        source_height=extraction.get("source_height")
        if isinstance(extraction.get("source_height"), int)
        else None,
        requested_frame_count=extraction.get("requested_frame_count")
        if isinstance(extraction.get("requested_frame_count"), int)
        else None,
        submitted_frame_count=extraction.get("submitted_frame_count")
        if isinstance(extraction.get("submitted_frame_count"), int)
        else None,
        used_normalized_video=extraction.get("used_normalized_video")
        if isinstance(extraction.get("used_normalized_video"), bool)
        else None,
        frames=_serialize_debug_frames(raw_frames if isinstance(raw_frames, list) else [], request),
    )


@router.post("/{item_id}/ar/capture-upload-url", response_model=PresignedUrlResponse)
def generate_ar_capture_upload_url(
    item_id: uuid.UUID,
    req: PresignedUrlRequest,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not (req.content_type.startswith("image/") or req.content_type.startswith("video/")):
        raise HTTPException(status_code=400, detail="AR captures must be image/* or video/*")

    filename = os.path.basename(req.filename)
    key = f"items/ar/{item_id}/capture/{uuid.uuid4()}-{filename}"
    return create_upload_target(key=key, content_type=req.content_type, request=request)


@router.post("/{item_id}/ar/captures", response_model=ItemArCapturesResponse)
def attach_ar_capture(
    item_id: uuid.UUID,
    payload: AttachArCaptureRequest,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    content_type = (payload.content_type or "").strip().lower()
    if content_type.startswith("image/"):
        kind = "image"
    elif content_type.startswith("video/"):
        kind = "video"
    else:
        raise HTTPException(status_code=400, detail="AR captures must be image/* or video/*")

    next_position = payload.position
    if next_position is None:
        existing_positions = session.exec(
            select(ArCaptureAsset.position).where(ArCaptureAsset.item_id == item_id)
        ).all()
        normalized_positions = [row[0] if isinstance(row, tuple) else row for row in existing_positions]
        next_position = (max(normalized_positions) + 1) if normalized_positions else 0

    capture = ArCaptureAsset(
        item_id=item_id,
        kind=kind,
        position=max(0, int(next_position)),
        s3_key=payload.s3_key,
        url=payload.url,
        metadata_json={
            "content_type": payload.content_type,
            "filename": payload.filename,
        },
    )
    session.add(capture)
    if kind == "video":
        item.ar_video_s3_key = payload.s3_key
        item.ar_video_url = payload.url
        session.add(item)
    session.commit()

    captures = _load_ar_captures(session, item_id)
    return ItemArCapturesResponse(
        capture_mode=item.ar_capture_mode or AR_CAPTURE_MODE_PHOTO_SCAN,
        captures=_serialize_ar_capture_assets(captures, request),
    )


@router.delete("/{item_id}/ar/captures/{capture_id}", response_model=ItemArCapturesResponse)
def delete_ar_capture(
    item_id: uuid.UUID,
    capture_id: uuid.UUID,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.ar_status in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="Cancel AR processing before removing captures.")

    capture = session.get(ArCaptureAsset, capture_id)
    if not capture or capture.item_id != item_id:
        raise HTTPException(status_code=404, detail="AR capture not found")

    _delete_storage_key_best_effort(capture.s3_key)
    session.delete(capture)
    session.flush()
    remaining_video = session.exec(
        select(ArCaptureAsset)
        .where(ArCaptureAsset.item_id == item_id)
        .where(ArCaptureAsset.kind == "video")
        .order_by(ArCaptureAsset.position, ArCaptureAsset.created_at, ArCaptureAsset.id)
        .limit(1)
    ).first()
    if remaining_video:
        item.ar_video_s3_key = remaining_video.s3_key
        item.ar_video_url = remaining_video.url
    else:
        item.ar_video_s3_key = None
        item.ar_video_url = None
    session.add(item)
    session.commit()

    captures = _load_ar_captures(session, item_id)
    return ItemArCapturesResponse(
        capture_mode=item.ar_capture_mode or AR_CAPTURE_MODE_PHOTO_SCAN,
        captures=_serialize_ar_capture_assets(captures, request),
    )


@router.post("/{item_id}/ar/generate", response_model=ItemRead)
def generate_ar_model(
    item_id: uuid.UUID,
    payload: GenerateArRequest,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    if not kiri_enabled():
        raise HTTPException(status_code=503, detail="AR generation is not configured")

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.ar_status in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="Cancel current AR processing before starting a new run.")

    captures = _load_ar_captures(session, item_id)
    if not captures:
        raise HTTPException(status_code=400, detail="Upload AR captures before generating.")
    try:
        capture_mode = validate_capture_mode(payload.capture_mode)
        select_generation_input(captures)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    queue_kiri_generation(
        session=session,
        item=item,
        capture_mode=capture_mode,
        detail="Queued from editor",
    )
    session.commit()
    session.refresh(item)

    _normalize_item_media_urls(item, request)
    return ItemRead.model_validate(item)

@router.post("/{item_id}/ar/video-upload-url", response_model=PresignedUrlResponse)
def generate_ar_video_upload_url(
    item_id: uuid.UUID, req: PresignedUrlRequest, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not req.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid content type; expected video/*")

    filename = os.path.basename(req.filename)
    key = f"items/ar/{item_id}/video/{uuid.uuid4()}-{filename}"
    return create_upload_target(key=key, content_type=req.content_type, request=request)


class AttachArVideoRequest(BaseModel):
    s3_key: str
    url: str


@router.post("/{item_id}/ar/video", response_model=ItemRead)
def attach_ar_video(
    item_id: uuid.UUID,
    payload: AttachArVideoRequest,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    if not kiri_enabled():
        raise HTTPException(status_code=503, detail="AR generation is not configured")

    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    for capture in _load_ar_captures(session, item_id):
        _delete_storage_key_best_effort(capture.s3_key)
        session.delete(capture)
    session.flush()
    session.add(
        ArCaptureAsset(
            item_id=item_id,
            kind="video",
            position=0,
            s3_key=payload.s3_key,
            url=payload.url,
            metadata_json={"source": "video_route"},
        )
    )

    item.ar_video_s3_key = payload.s3_key
    item.ar_video_url = payload.url
    queue_kiri_generation(
        session=session,
        item=item,
        capture_mode=AR_CAPTURE_MODE_PHOTO_SCAN,
        detail="Queued from video upload",
    )
    session.commit()
    session.refresh(item)

    # Normalize in case the video URL is a local upload stored with a different forwarded prefix.
    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)


@router.post("/{item_id}/ar/retry", response_model=ItemRead)
def retry_ar_generation(
    item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.ar_provider == AR_PROVIDER_KIRI and item.ar_model_usdz_s3_key and item.ar_model_usdz_url and not item.ar_model_glb_s3_key:
        try:
            queue_conversion_from_existing_usdz(
                session=session,
                item=item,
                detail="Retrying GLB conversion",
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        captures = _load_ar_captures(session, item_id)
        if not captures:
            raise HTTPException(status_code=400, detail="No AR captures uploaded for this item")

        queue_kiri_generation(
            session=session,
            item=item,
            capture_mode=item.ar_capture_mode or AR_CAPTURE_MODE_PHOTO_SCAN,
            detail="Retried from editor",
        )
    session.commit()
    session.refresh(item)

    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)


@router.post("/{item_id}/ar/cancel", response_model=ItemRead)
def cancel_ar_generation(
    item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.ar_status not in ("pending", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel AR job with status '{item.ar_status or 'none'}'.",
        )

    item.ar_status = "failed"
    item.ar_error_message = "Canceled by user"
    item.ar_stage = "canceled"
    item.ar_stage_detail = "Canceled by user"
    item.ar_progress = None
    item.ar_job_id = None
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(item, canceled_at=datetime.utcnow().isoformat())

    session.add(item)
    session.commit()
    session.refresh(item)

    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)


@router.delete("/{item_id}/ar/model", response_model=ItemRead)
def delete_ar_model(
    item_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if item.ar_status in ("pending", "processing"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete AR model while processing. Cancel the job first.",
        )

    _delete_storage_key_best_effort(item.ar_model_glb_s3_key)
    _delete_storage_key_best_effort(item.ar_model_usdz_s3_key)
    _delete_storage_key_best_effort(item.ar_model_poster_s3_key)

    item.ar_model_glb_s3_key = None
    item.ar_model_glb_url = None
    item.ar_model_usdz_s3_key = None
    item.ar_model_usdz_url = None
    item.ar_model_poster_s3_key = None
    item.ar_model_poster_url = None
    item.ar_status = "none"
    item.ar_error_message = None
    item.ar_stage = None
    item.ar_stage_detail = None
    item.ar_progress = None
    item.ar_job_id = None
    item.ar_updated_at = datetime.utcnow()

    session.add(item)
    session.commit()
    session.refresh(item)

    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)

@router.put("/local-upload/{key:path}")
async def local_upload(key: str, request: Request):
    if not _local_uploads_enabled():
        raise HTTPException(status_code=404, detail="Local uploads disabled")
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty upload")
    target = _safe_local_path(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as f:
        f.write(body)
    return {"ok": True}

@router.post("/", response_model=ItemRead)
def create_item(item_in: ItemCreate, session: Session = SessionDep, user: dict = UserDep):
    # Authz check
    category = session.get(Category, item_in.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    menu = session.get(Menu, category.menu_id)
    org = session.get(Organization, menu.org_id)
    
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Create Item
    item_payload = item_in.model_dump(
        exclude={"dietary_tag_ids", "allergen_ids", "option_groups", "visibility_rules"}
    )
    item = Item(**item_payload)
    session.add(item)
    
    # Link Tags
    if item_in.dietary_tag_ids:
        for tag_id in item_in.dietary_tag_ids:
            tag = session.get(DietaryTag, tag_id)
            if tag:
                item.dietary_tags.append(tag)
    
    # Link Allergens
    if item_in.allergen_ids:
        for alg_id in item_in.allergen_ids:
            alg = session.get(Allergen, alg_id)
            if alg:
                item.allergens.append(alg)

    _replace_item_options_and_visibility(
        session=session,
        item=item,
        option_groups=item_in.option_groups,
        visibility_rules=item_in.visibility_rules,
    )

    session.commit()
    item = _load_item_with_relations(session, item.id)
    if not item:
        raise HTTPException(status_code=500, detail="Failed to load created item")
    return item

@router.post("/{item_id}/photos", response_model=ItemPhoto)
def add_item_photo(item_id: uuid.UUID, photo: ItemPhoto, session: Session = SessionDep, user: dict = UserDep):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Verify ownership
    category = session.get(Category, item.category_id)
    menu = session.get(Menu, category.menu_id)
    org = session.get(Organization, menu.org_id)
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    photo.item_id = item_id
    session.add(photo)
    session.commit()
    session.refresh(photo)
    return photo

@router.delete("/{item_id}/photos", status_code=204)
def delete_item_photos(item_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    category = session.get(Category, item.category_id)
    menu = session.get(Menu, category.menu_id)
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    photos = session.exec(select(ItemPhoto).where(ItemPhoto.item_id == item_id)).all()
    if photos:
        bucket_name = os.getenv("S3_BUCKET_NAME")
        if bucket_name:
            s3_client = boto3.client("s3")
            for photo in photos:
                try:
                    if photo.s3_key:
                        s3_client.delete_object(Bucket=bucket_name, Key=photo.s3_key)
                except Exception:
                    # Best-effort: removing DB link is enough to "remove" a photo in the app.
                    pass
        elif _local_uploads_enabled():
            for photo in photos:
                try:
                    if photo.s3_key:
                        _safe_local_path(photo.s3_key).unlink(missing_ok=True)
                except Exception:
                    pass

    session.exec(delete(ItemPhoto).where(ItemPhoto.item_id == item_id))
    session.commit()
    return

@router.patch("/{item_id}", response_model=ItemRead)
def update_item(item_id: uuid.UUID, item_update: ItemUpdate, session: Session = SessionDep, user: dict = UserDep):
    db_item = session.get(Item, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    org = session.get(Organization, menu.org_id)
    perms = get_org_permissions(session, menu.org_id, user)

    item_data = item_update.model_dump(exclude_unset=True)
    non_availability_keys = set(item_data.keys()) - {"is_sold_out"}
    if non_availability_keys and not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
    if "is_sold_out" in item_data and not perms.can_manage_availability and not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Update scalar fields
    for key, value in item_data.items():
        if key not in ["dietary_tag_ids", "allergen_ids", "option_groups", "visibility_rules"]:
            setattr(db_item, key, value)
    
    # Update Relationships if provided
    if item_update.dietary_tag_ids is not None:
        db_item.dietary_tags = [] # Clear existing
        for tag_id in item_update.dietary_tag_ids:
            tag = session.get(DietaryTag, tag_id)
            if tag:
                db_item.dietary_tags.append(tag)
                
    if item_update.allergen_ids is not None:
        db_item.allergens = [] # Clear existing
        for alg_id in item_update.allergen_ids:
            alg = session.get(Allergen, alg_id)
            if alg:
                db_item.allergens.append(alg)
        
    _replace_item_options_and_visibility(
        session=session,
        item=db_item,
        option_groups=item_update.option_groups if "option_groups" in item_data else None,
        visibility_rules=item_update.visibility_rules if "visibility_rules" in item_data else None,
    )

    session.add(db_item)
    session.commit()
    db_item = _load_item_with_relations(session, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    return db_item

@router.delete("/{item_id}")
def delete_item(item_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    db_item = session.get(Item, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    org = session.get(Organization, menu.org_id)
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    group_ids = session.exec(
        select(ItemOptionGroup.id).where(ItemOptionGroup.item_id == db_item.id)
    ).all()
    group_ids = [row[0] if isinstance(row, tuple) else row for row in group_ids]
    option_ids: list[uuid.UUID] = []
    if group_ids:
        option_rows = session.exec(
            select(ItemOption.id).where(ItemOption.group_id.in_(group_ids))
        ).all()
        option_ids = [row[0] if isinstance(row, tuple) else row for row in option_rows]
    if option_ids:
        session.exec(delete(VisibilityRule).where(VisibilityRule.option_id.in_(option_ids)))
        session.exec(delete(ItemOption).where(ItemOption.id.in_(option_ids)))
    if group_ids:
        session.exec(delete(ItemOptionGroup).where(ItemOptionGroup.id.in_(group_ids)))
    session.exec(delete(VisibilityRule).where(VisibilityRule.item_id == db_item.id))
    session.delete(db_item)
    session.commit()
    return {"ok": True}
