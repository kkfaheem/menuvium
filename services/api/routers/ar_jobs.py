import os
import uuid
from datetime import datetime, timedelta
from typing import Literal, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from database import get_session
from models import Item, ItemRead
from url_utils import normalize_upload_url, external_base_url

router = APIRouter(prefix="/ar-jobs", tags=["ar-jobs"])
SessionDep = Depends(get_session)


def _require_worker_token(x_worker_token: Optional[str] = Header(default=None, alias="X-Worker-Token")):
    expected = os.getenv("AR_WORKER_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="AR worker not configured")
    if not x_worker_token or x_worker_token != expected:
        raise HTTPException(status_code=403, detail="Invalid worker token")


def _local_uploads_enabled() -> bool:
    return os.getenv("LOCAL_UPLOADS") == "1"


class WorkerClaimResponse(BaseModel):
    item_id: uuid.UUID
    job_id: uuid.UUID
    video_s3_key: str
    video_download_url: str


@router.post("/claim", response_model=WorkerClaimResponse, dependencies=[Depends(_require_worker_token)])
def claim_job(request: Request, session: Session = SessionDep):
    item = session.exec(
        select(Item)
        .where(Item.ar_status == "pending")
        .where(Item.ar_video_s3_key.is_not(None))
        .order_by(Item.ar_created_at)
        .limit(1)
    ).first()
    reclaimed = False

    if not item:
        now = datetime.utcnow()
        starting_stale_seconds = int(os.getenv("AR_JOB_STARTING_STALE_SECONDS", "180"))
        stale_seconds = int(os.getenv("AR_JOB_STALE_SECONDS", "1800"))
        starting_cutoff = now - timedelta(seconds=max(0, starting_stale_seconds))
        stale_cutoff = now - timedelta(seconds=max(0, stale_seconds))

        stale_condition = or_(
            Item.ar_updated_at.is_(None),
            Item.ar_updated_at < stale_cutoff,
            and_(Item.ar_stage == "starting", Item.ar_updated_at < starting_cutoff),
        )

        item = session.exec(
            select(Item)
            .where(Item.ar_status == "processing")
            .where(Item.ar_video_s3_key.is_not(None))
            .where(stale_condition)
            .order_by(Item.ar_updated_at)
            .limit(1)
        ).first()

        if not item:
            return Response(status_code=204)

        reclaimed = True

    job_id = uuid.uuid4()
    item.ar_status = "processing"
    item.ar_job_id = job_id
    item.ar_error_message = None
    item.ar_stage = "starting"
    item.ar_stage_detail = "Reclaimed stale job" if reclaimed else None
    item.ar_progress = max(item.ar_progress or 0.0, 0.01)
    item.ar_updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)

    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        s3_client = boto3.client("s3")
        try:
            download_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket_name, "Key": item.ar_video_s3_key},
                ExpiresIn=3600,
            )
        except ClientError as e:
            print(e)
            item.ar_status = "failed"
            item.ar_error_message = "Could not generate download URL"
            item.ar_stage = "failed"
            item.ar_updated_at = datetime.utcnow()
            session.add(item)
            session.commit()
            raise HTTPException(status_code=500, detail="Could not generate download URL")
    else:
        if not _local_uploads_enabled():
            item.ar_status = "failed"
            item.ar_error_message = "Local uploads disabled and no S3 configured"
            item.ar_stage = "failed"
            item.ar_updated_at = datetime.utcnow()
            session.add(item)
            session.commit()
            raise HTTPException(status_code=500, detail="Storage not configured")
        base = external_base_url(request)
        download_url = f"{base}/uploads/{item.ar_video_s3_key}".replace("//uploads/", "/uploads/")
        if not download_url:
            item.ar_status = "failed"
            item.ar_error_message = "Missing local video URL"
            item.ar_stage = "failed"
            item.ar_updated_at = datetime.utcnow()
            session.add(item)
            session.commit()
            raise HTTPException(status_code=500, detail="Missing local video URL")

    return WorkerClaimResponse(
        item_id=item.id,
        job_id=job_id,
        video_s3_key=item.ar_video_s3_key or "",
        video_download_url=download_url,
    )


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
    bucket_name = os.getenv("S3_BUCKET_NAME")
    filename = os.path.basename(payload.filename)
    key = f"items/ar/{payload.item_id}/{payload.kind}/{uuid.uuid4()}-{filename}"

    if not bucket_name:
        if _local_uploads_enabled():
            base = external_base_url(request)
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
            Params={"Bucket": bucket_name, "Key": key, "ContentType": payload.content_type},
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


class WorkerCompleteRequest(BaseModel):
    job_id: uuid.UUID
    model_glb_s3_key: str
    model_glb_url: str
    model_usdz_s3_key: str
    model_usdz_url: str
    poster_s3_key: Optional[str] = None
    poster_url: Optional[str] = None


@router.post("/{item_id}/complete", response_model=ItemRead, dependencies=[Depends(_require_worker_token)])
def mark_complete(
    item_id: uuid.UUID, payload: WorkerCompleteRequest, request: Request, session: Session = SessionDep
):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.ar_status != "processing" or not item.ar_job_id or item.ar_job_id != payload.job_id:
        raise HTTPException(status_code=409, detail="Job is not active for this item")

    item.ar_model_glb_s3_key = payload.model_glb_s3_key
    item.ar_model_glb_url = payload.model_glb_url
    item.ar_model_usdz_s3_key = payload.model_usdz_s3_key
    item.ar_model_usdz_url = payload.model_usdz_url
    item.ar_model_poster_s3_key = payload.poster_s3_key
    item.ar_model_poster_url = payload.poster_url
    item.ar_status = "ready"
    item.ar_error_message = None
    item.ar_stage = "ready"
    item.ar_stage_detail = None
    item.ar_progress = 1.0
    item.ar_updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)

    item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
    item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
    item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
    item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    return ItemRead.model_validate(item)


class WorkerFailRequest(BaseModel):
    job_id: uuid.UUID
    error: str


@router.post("/{item_id}/fail", response_model=ItemRead, dependencies=[Depends(_require_worker_token)])
def mark_failed(item_id: uuid.UUID, payload: WorkerFailRequest, session: Session = SessionDep):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.ar_status != "processing" or not item.ar_job_id or item.ar_job_id != payload.job_id:
        raise HTTPException(status_code=409, detail="Job is not active for this item")

    item.ar_status = "failed"
    item.ar_error_message = payload.error[:4000]
    item.ar_stage = "failed"
    item.ar_updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return ItemRead.model_validate(item)


class WorkerProgressRequest(BaseModel):
    job_id: uuid.UUID
    stage: Optional[str] = None
    detail: Optional[str] = None
    progress: Optional[float] = None  # 0.0 - 1.0


@router.post("/{item_id}/progress", status_code=204, dependencies=[Depends(_require_worker_token)])
def update_progress(item_id: uuid.UUID, payload: WorkerProgressRequest, session: Session = SessionDep):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.ar_status != "processing" or not item.ar_job_id or item.ar_job_id != payload.job_id:
        raise HTTPException(status_code=409, detail="Job is not active for this item")

    if payload.stage is not None:
        item.ar_stage = payload.stage.strip()[:120] or None
    if payload.detail is not None:
        detail = payload.detail.strip()
        item.ar_stage_detail = detail[:500] if detail else None
    if payload.progress is not None:
        item.ar_progress = max(0.0, min(1.0, float(payload.progress)))
    item.ar_updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    return Response(status_code=204)
