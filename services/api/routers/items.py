import uuid
import os
import boto3
from botocore.exceptions import ClientError
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlmodel import Session, select, delete
from database import get_session
from models import (
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

def _local_uploads_enabled() -> bool:
    return os.getenv("LOCAL_UPLOADS") == "1"

def _local_upload_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "uploads"

def _safe_local_path(key: str) -> Path:
    base = _local_upload_dir().resolve()
    target = (base / key).resolve()
    if not str(target).startswith(str(base) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid upload key")
    return target

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
                    priority=rule.priority,
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
                        priority=rule.priority,
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

    bucket_name = os.getenv("S3_BUCKET_NAME")
    filename = os.path.basename(req.filename)
    key = f"items/ar/{item_id}/video/{uuid.uuid4()}-{filename}"
    if not bucket_name:
        if _local_uploads_enabled():
            prefix = forwarded_prefix(request)
            base = prefix or ""
            return {
                "upload_url": f"{base}/items/local-upload/{key}",
                "s3_key": key,
                "public_url": f"{base}/uploads/{key}",
            }
        raise HTTPException(status_code=500, detail="S3 configuration missing")

    s3_client = boto3.client("s3")
    try:
        response = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket_name,
                "Key": key,
                "ContentType": req.content_type,
            },
            ExpiresIn=3600,
        )
    except ClientError as e:
        print(e)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return {
        "upload_url": response,
        "s3_key": key,
        "public_url": f"https://{bucket_name}.s3.amazonaws.com/{key}",
    }


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
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    perms = _item_org_permissions(session, item, user)
    if not perms.can_edit_items:
        raise HTTPException(status_code=403, detail="Not authorized")

    item.ar_video_s3_key = payload.s3_key
    item.ar_video_url = payload.url
    item.ar_status = "pending"
    item.ar_error_message = None
    item.ar_luma_capture_id = None
    item.ar_stage = "queued"
    item.ar_stage_detail = None
    item.ar_progress = 0.0
    item.ar_job_id = None
    item.ar_model_glb_s3_key = None
    item.ar_model_glb_url = None
    item.ar_model_usdz_s3_key = None
    item.ar_model_usdz_url = None
    item.ar_model_poster_s3_key = None
    item.ar_model_poster_url = None
    item.ar_created_at = datetime.utcnow()
    item.ar_updated_at = datetime.utcnow()

    session.add(item)
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
    if not item.ar_video_s3_key:
        raise HTTPException(status_code=400, detail="No AR video uploaded for this item")

    item.ar_status = "pending"
    item.ar_error_message = None
    item.ar_stage = "queued"
    item.ar_stage_detail = None
    item.ar_progress = 0.0
    item.ar_job_id = None
    item.ar_model_glb_s3_key = None
    item.ar_model_glb_url = None
    item.ar_model_usdz_s3_key = None
    item.ar_model_usdz_url = None
    item.ar_model_poster_s3_key = None
    item.ar_model_poster_url = None
    item.ar_created_at = datetime.utcnow()
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
