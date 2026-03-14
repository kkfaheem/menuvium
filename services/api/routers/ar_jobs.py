import os
import uuid
from datetime import datetime
from typing import Literal, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from ar_pipeline import (
    AR_PROVIDER_KIRI,
    AR_STAGE_KIRI_PROCESSING,
    AR_STAGE_UPLOADING_TO_KIRI,
    AR_STAGE_CANCELED,
    AR_STAGE_READY,
    CONVERSION_STATUS_FAILED,
    CONVERSION_STATUS_PROCESSING,
    CONVERSION_STATUS_QUEUED,
    CONVERSION_STATUS_READY,
    KIRI_STATUS_QUEUING,
    converter_worker_token,
    fail_item_ar,
    select_generation_input,
    update_item_ar_metadata,
)
from ar_worker import handle_kiri_status_update
from database import get_session
from models import ArConversionJob, Item, ItemRead
from storage_utils import create_upload_target, local_uploads_enabled
from url_utils import external_base_url, normalize_upload_url
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/ar-jobs", tags=["ar-jobs"])
SessionDep = Depends(get_session)


def _require_worker_token(x_worker_token: Optional[str] = Header(default=None, alias="X-Worker-Token")):
    expected = converter_worker_token()
    if not expected:
        raise HTTPException(status_code=503, detail="AR converter worker not configured")
    if not x_worker_token or x_worker_token != expected:
        raise HTTPException(status_code=403, detail="Invalid worker token")


def _require_kiri_webhook_secret(
    request: Request,
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_signature: Optional[str] = Header(default=None, alias="X-Signature"),
    x_kiri_signature: Optional[str] = Header(default=None),
    x_kiri_secret: Optional[str] = Header(default=None),
    x_signing_secret: Optional[str] = Header(default=None),
    x_webhook_secret: Optional[str] = Header(default=None),
):
    expected = os.getenv("KIRI_WEBHOOK_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="KIRI webhook secret is not configured")

    candidates = [
        token,
        x_signature,
        x_kiri_signature,
        x_kiri_secret,
        x_signing_secret,
        x_webhook_secret,
    ]
    if authorization and authorization.lower().startswith("bearer "):
        candidates.append(authorization.split(" ", 1)[1])

    if expected not in [candidate for candidate in candidates if candidate]:
        raise HTTPException(status_code=403, detail="Invalid KIRI webhook secret")


def _generate_download_url(*, key: str, request: Request) -> str:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        try:
            return boto3.client("s3").generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": key},
                ExpiresIn=3600,
            )
        except ClientError as exc:
            print(exc)
            raise HTTPException(status_code=500, detail="Could not generate download URL")

    if not local_uploads_enabled():
        raise HTTPException(status_code=500, detail="Storage not configured")
    base = external_base_url(request)
    return f"{base}/uploads/{key}".replace("//uploads/", "/uploads/")


class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    public_url: str


class WorkerUploadUrlRequest(BaseModel):
    item_id: uuid.UUID
    kind: Literal["model_glb", "model_usdz", "poster"]
    filename: str
    content_type: str


@router.post("/upload-url", response_model=PresignedUrlResponse, dependencies=[Depends(_require_worker_token)])
def generate_worker_upload_url(payload: WorkerUploadUrlRequest, request: Request):
    filename = os.path.basename(payload.filename)
    key = f"items/ar/{payload.item_id}/{payload.kind}/{uuid.uuid4()}-{filename}"
    return create_upload_target(key=key, content_type=payload.content_type, request=request)


class ConversionClaimResponse(BaseModel):
    job_id: uuid.UUID
    item_id: uuid.UUID
    usdz_s3_key: str
    usdz_download_url: str


class GenerationPhotoScanOptions(BaseModel):
    model_quality: int
    texture_quality: int
    texture_smoothing: int
    is_mask: int


class GenerationCaptureResponse(BaseModel):
    capture_id: uuid.UUID
    kind: str
    position: int
    s3_key: str
    download_url: str


class GenerationClaimResponse(BaseModel):
    job_id: uuid.UUID
    item_id: uuid.UUID
    capture_mode: str
    capture_input_kind: str
    captures: list[GenerationCaptureResponse]
    photo_scan_options: GenerationPhotoScanOptions


class GenerationProgressRequest(BaseModel):
    stage: Optional[str] = None
    detail: Optional[str] = None
    progress: Optional[float] = None


class DebugFrameUploadUrlRead(PresignedUrlResponse):
    filename: str


class GenerationDebugFrameUploadUrlsRequest(BaseModel):
    filenames: list[str]
    run_id: Optional[str] = None


class GenerationDebugFrameUploadUrlsResponse(BaseModel):
    storage_prefix: str
    uploads: list[DebugFrameUploadUrlRead]


class GenerationSubmittedRequest(BaseModel):
    serialize: str
    provider_calculate_type: Optional[int] = None
    provider_input_kind: Optional[str] = None
    video_frame_extraction: Optional[dict] = None


class GenerationFailRequest(BaseModel):
    error: str
    detail: Optional[str] = None
    provider_input_kind: Optional[str] = None
    video_frame_extraction: Optional[dict] = None


def _photo_scan_submission_options() -> GenerationPhotoScanOptions:
    def _env_int(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None:
            return default
        try:
            return int(raw)
        except ValueError:
            return default

    return GenerationPhotoScanOptions(
        model_quality=_env_int("KIRI_PHOTO_MODEL_QUALITY", 3),
        texture_quality=_env_int("KIRI_PHOTO_TEXTURE_QUALITY", 3),
        texture_smoothing=_env_int("KIRI_PHOTO_TEXTURE_SMOOTHING", 1),
        is_mask=_env_int("KIRI_PHOTO_IS_MASK", 1),
    )


def _find_active_generation_item(session: Session, job_id: uuid.UUID) -> Item:
    item = session.exec(
        select(Item)
        .where(Item.ar_job_id == job_id)
        .options(selectinload(Item.ar_capture_assets))
    ).first()
    if not item or item.ar_provider != AR_PROVIDER_KIRI:
        raise HTTPException(status_code=404, detail="AR generation job not found")
    return item


@router.post("/conversions/claim", response_model=ConversionClaimResponse, dependencies=[Depends(_require_worker_token)])
def claim_conversion_job(request: Request, session: Session = SessionDep):
    job = session.exec(
        select(ArConversionJob)
        .where(ArConversionJob.status == CONVERSION_STATUS_QUEUED)
        .order_by(ArConversionJob.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    ).first()
    if not job:
        return Response(status_code=204)

    item = session.get(Item, job.item_id)
    if not item:
        job.status = CONVERSION_STATUS_FAILED
        job.error_message = "Item no longer exists"
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()
        return Response(status_code=204)

    job.status = CONVERSION_STATUS_PROCESSING
    job.attempts += 1
    job.updated_at = datetime.utcnow()
    item.ar_status = "processing"
    item.ar_stage = "converting_glb"
    item.ar_stage_detail = "Converter picked up the job"
    item.ar_progress = max(float(item.ar_progress or 0.0), 0.88)
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(
        item,
        conversion_job_id=str(job.id),
        conversion_status=CONVERSION_STATUS_PROCESSING,
    )
    session.add(job)
    session.add(item)
    session.commit()

    return ConversionClaimResponse(
        job_id=job.id,
        item_id=item.id,
        usdz_s3_key=job.usdz_s3_key,
        usdz_download_url=_generate_download_url(key=job.usdz_s3_key, request=request),
    )


@router.post("/generations/claim", response_model=GenerationClaimResponse, dependencies=[Depends(_require_worker_token)])
def claim_generation_job(request: Request, session: Session = SessionDep):
    item = session.exec(
        select(Item)
        .where(Item.ar_provider == AR_PROVIDER_KIRI)
        .where(Item.ar_status == "pending")
        .order_by(Item.ar_created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
        .options(selectinload(Item.ar_capture_assets))
    ).first()
    if not item:
        return Response(status_code=204)

    captures = list(item.ar_capture_assets or [])
    try:
        capture_input_kind, selected_captures = select_generation_input(captures)
    except ValueError as exc:
        fail_item_ar(
            session=session,
            item=item,
            error_message=str(exc),
            detail="Capture validation failed",
        )
        session.commit()
        return Response(status_code=204)

    item.ar_status = "processing"
    item.ar_stage = AR_STAGE_UPLOADING_TO_KIRI
    item.ar_stage_detail = "AR worker picked up the scan job"
    item.ar_progress = 0.03
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(item, capture_input_kind=capture_input_kind)
    session.add(item)
    session.commit()

    return GenerationClaimResponse(
        job_id=item.ar_job_id,
        item_id=item.id,
        capture_mode=item.ar_capture_mode or "photo_scan",
        capture_input_kind=capture_input_kind,
        captures=[
            GenerationCaptureResponse(
                capture_id=capture.id,
                kind=capture.kind,
                position=capture.position,
                s3_key=capture.s3_key,
                download_url=_generate_download_url(key=capture.s3_key, request=request),
            )
            for capture in selected_captures
        ],
        photo_scan_options=_photo_scan_submission_options(),
    )


@router.post("/generations/{job_id}/progress", status_code=204, dependencies=[Depends(_require_worker_token)])
def update_generation_progress(
    job_id: uuid.UUID,
    payload: GenerationProgressRequest,
    session: Session = SessionDep,
):
    item = _find_active_generation_item(session, job_id)
    if item.ar_status != "processing" or item.ar_stage == AR_STAGE_CANCELED:
        raise HTTPException(status_code=409, detail="AR generation job is not active")

    if payload.stage is not None:
        item.ar_stage = payload.stage.strip()[:120] or item.ar_stage
    if payload.detail is not None:
        detail = payload.detail.strip()
        item.ar_stage_detail = detail[:500] if detail else None
    if payload.progress is not None:
        item.ar_progress = max(0.0, min(1.0, float(payload.progress)))
    item.ar_updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    return Response(status_code=204)


@router.post(
    "/generations/{job_id}/debug-frame-upload-urls",
    response_model=GenerationDebugFrameUploadUrlsResponse,
    dependencies=[Depends(_require_worker_token)],
)
def generate_debug_frame_upload_urls(
    job_id: uuid.UUID,
    payload: GenerationDebugFrameUploadUrlsRequest,
    request: Request,
    session: Session = SessionDep,
):
    item = _find_active_generation_item(session, job_id)
    if item.ar_status != "processing" or item.ar_stage == AR_STAGE_CANCELED:
        raise HTTPException(status_code=409, detail="AR generation job is not active")
    if not payload.filenames:
        raise HTTPException(status_code=400, detail="At least one debug frame filename is required")
    if len(payload.filenames) > 300:
        raise HTTPException(status_code=400, detail="No more than 300 debug frame uploads can be requested")

    run_id = (payload.run_id or str(item.ar_job_id or item.id)).strip()
    if not run_id:
        raise HTTPException(status_code=400, detail="A valid run_id is required")

    storage_prefix = f"items/ar/{item.id}/debug_frames/{run_id}"
    uploads: list[DebugFrameUploadUrlRead] = []
    for filename in payload.filenames:
        normalized = os.path.basename(filename)
        if not normalized:
            raise HTTPException(status_code=400, detail="Invalid debug frame filename")
        key = f"{storage_prefix}/{normalized}"
        target = create_upload_target(
            key=key,
            content_type="image/jpeg",
            request=request,
        )
        uploads.append(
            DebugFrameUploadUrlRead(
                filename=normalized,
                upload_url=target["upload_url"],
                s3_key=target["s3_key"],
                public_url=target["public_url"],
            )
        )

    return GenerationDebugFrameUploadUrlsResponse(
        storage_prefix=storage_prefix,
        uploads=uploads,
    )


@router.post("/generations/{job_id}/submitted", status_code=204, dependencies=[Depends(_require_worker_token)])
def mark_generation_submitted(
    job_id: uuid.UUID,
    payload: GenerationSubmittedRequest,
    session: Session = SessionDep,
):
    item = _find_active_generation_item(session, job_id)
    if item.ar_status != "processing" or item.ar_stage == AR_STAGE_CANCELED:
        raise HTTPException(status_code=409, detail="AR generation job is not active")

    item.ar_stage = AR_STAGE_KIRI_PROCESSING
    item.ar_stage_detail = "Processing the 3D model"
    item.ar_progress = max(float(item.ar_progress or 0.0), 0.2)
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(
        item,
        serialize=payload.serialize,
        provider_status=KIRI_STATUS_QUEUING,
        provider_calculate_type=payload.provider_calculate_type,
        provider_message="submitted",
        provider_input_kind=payload.provider_input_kind or "images",
        video_frame_extraction=payload.video_frame_extraction,
    )
    session.add(item)
    session.commit()
    return Response(status_code=204)


@router.post("/generations/{job_id}/fail", status_code=204, dependencies=[Depends(_require_worker_token)])
def fail_generation_job(
    job_id: uuid.UUID,
    payload: GenerationFailRequest,
    session: Session = SessionDep,
):
    item = _find_active_generation_item(session, job_id)
    if item.ar_stage == AR_STAGE_CANCELED:
        return Response(status_code=204)

    fail_item_ar(
        session=session,
        item=item,
        error_message=payload.error[:4000],
        detail=(payload.detail or "Could not prepare the scan input")[:500] if payload.detail else "Could not prepare the scan input",
    )
    update_item_ar_metadata(
        item,
        provider_message=payload.error[:4000],
        provider_input_kind=payload.provider_input_kind,
        video_frame_extraction=payload.video_frame_extraction,
    )
    session.add(item)
    session.commit()
    return Response(status_code=204)


class ConversionProgressRequest(BaseModel):
    stage: Optional[str] = None
    detail: Optional[str] = None
    progress: Optional[float] = None


@router.post("/conversions/{job_id}/progress", status_code=204, dependencies=[Depends(_require_worker_token)])
def update_conversion_progress(job_id: uuid.UUID, payload: ConversionProgressRequest, session: Session = SessionDep):
    job = session.get(ArConversionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Conversion job not found")
    if job.status != CONVERSION_STATUS_PROCESSING:
        raise HTTPException(status_code=409, detail="Conversion job is not active")

    item = session.get(Item, job.item_id)
    if item and item.ar_status == "processing":
        if payload.stage is not None:
            item.ar_stage = payload.stage.strip()[:120] or item.ar_stage
        if payload.detail is not None:
            detail = payload.detail.strip()
            item.ar_stage_detail = detail[:500] if detail else None
        if payload.progress is not None:
            item.ar_progress = max(0.0, min(1.0, float(payload.progress)))
        item.ar_updated_at = datetime.utcnow()
        session.add(item)

    job.updated_at = datetime.utcnow()
    session.add(job)
    session.commit()
    return Response(status_code=204)


class ConversionCompleteRequest(BaseModel):
    glb_s3_key: str
    glb_url: str


@router.post("/conversions/{job_id}/complete", response_model=ItemRead, dependencies=[Depends(_require_worker_token)])
def complete_conversion(
    job_id: uuid.UUID, payload: ConversionCompleteRequest, request: Request, session: Session = SessionDep
):
    job = session.get(ArConversionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Conversion job not found")
    if job.status != CONVERSION_STATUS_PROCESSING:
        raise HTTPException(status_code=409, detail="Conversion job is not active")

    item = session.get(Item, job.item_id)
    if not item or item.ar_status != "processing":
        raise HTTPException(status_code=409, detail="Item is not active for conversion")

    job.status = CONVERSION_STATUS_READY
    job.glb_s3_key = payload.glb_s3_key
    job.glb_url = payload.glb_url
    job.updated_at = datetime.utcnow()

    item.ar_model_glb_s3_key = payload.glb_s3_key
    item.ar_model_glb_url = payload.glb_url
    item.ar_status = "ready"
    item.ar_error_message = None
    item.ar_stage = AR_STAGE_READY
    item.ar_stage_detail = None
    item.ar_progress = 1.0
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(
        item,
        conversion_job_id=str(job.id),
        conversion_status=CONVERSION_STATUS_READY,
    )
    session.add(job)
    session.add(item)
    session.commit()
    session.refresh(item)

    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)


class ConversionFailRequest(BaseModel):
    error: str


@router.post("/conversions/{job_id}/fail", response_model=ItemRead, dependencies=[Depends(_require_worker_token)])
def fail_conversion(job_id: uuid.UUID, payload: ConversionFailRequest, session: Session = SessionDep):
    job = session.get(ArConversionJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Conversion job not found")
    if job.status not in {CONVERSION_STATUS_QUEUED, CONVERSION_STATUS_PROCESSING}:
        raise HTTPException(status_code=409, detail="Conversion job is not active")

    job.status = CONVERSION_STATUS_FAILED
    job.error_message = payload.error[:4000]
    job.updated_at = datetime.utcnow()
    session.add(job)

    item = session.get(Item, job.item_id)
    if item and item.ar_status == "processing" and item.ar_stage != AR_STAGE_CANCELED:
        item.ar_status = "failed"
        item.ar_error_message = payload.error[:4000]
        item.ar_stage = "failed"
        item.ar_stage_detail = "GLB conversion failed"
        item.ar_progress = None
        item.ar_updated_at = datetime.utcnow()
        update_item_ar_metadata(
            item,
            conversion_job_id=str(job.id),
            conversion_status=CONVERSION_STATUS_FAILED,
        )
        session.add(item)

    session.commit()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemRead.model_validate(item)


class KiriWebhookPayload(BaseModel):
    status: int
    serialize: str


@router.post("/kiri/webhook", dependencies=[Depends(_require_kiri_webhook_secret)])
def kiri_webhook(payload: KiriWebhookPayload):
    matched = handle_kiri_status_update(
        serialize=payload.serialize,
        provider_status=payload.status,
        source="webhook",
    )
    return {"ok": True, "matched": matched}
