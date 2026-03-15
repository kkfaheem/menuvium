from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Iterable

from sqlmodel import Session, select

from models import ArCaptureAsset, ArConversionJob, Item


AR_PROVIDER_KIRI = "kiri"

AR_CAPTURE_MODE_PHOTO_SCAN = "photo_scan"
AR_CAPTURE_MODE_FEATURELESS = "featureless"
VALID_CAPTURE_MODES = {AR_CAPTURE_MODE_PHOTO_SCAN, AR_CAPTURE_MODE_FEATURELESS}

AR_STAGE_QUEUED = "queued"
AR_STAGE_UPLOADING_TO_KIRI = "uploading_to_kiri"
AR_STAGE_KIRI_PROCESSING = "kiri_processing"
AR_STAGE_DOWNLOADING_USDZ = "downloading_usdz"
AR_STAGE_CONVERSION_QUEUED = "conversion_queued"
AR_STAGE_CONVERTING_GLB = "converting_glb"
AR_STAGE_READY = "ready"
AR_STAGE_FAILED = "failed"
AR_STAGE_CANCELED = "canceled"

CONVERSION_STATUS_QUEUED = "queued"
CONVERSION_STATUS_PROCESSING = "processing"
CONVERSION_STATUS_READY = "ready"
CONVERSION_STATUS_FAILED = "failed"

KIRI_STATUS_UPLOADING = -1
KIRI_STATUS_PROCESSING = 0
KIRI_STATUS_FAILED = 1
KIRI_STATUS_SUCCESS = 2
KIRI_STATUS_QUEUING = 3
KIRI_STATUS_EXPIRED = 4

KIRI_WEBHOOK_HEADER_CANDIDATES = (
    "x-kiri-signature",
    "x-kiri-secret",
    "x-signing-secret",
    "x-webhook-secret",
)


def kiri_api_key() -> str | None:
    return os.getenv("KIRI_API_KEY")


def kiri_enabled() -> bool:
    return bool(kiri_api_key())


def converter_worker_token() -> str | None:
    return os.getenv("AR_CONVERTER_TOKEN")


def get_item_ar_metadata(item: Item) -> dict:
    if isinstance(item.ar_metadata_json, dict):
        return dict(item.ar_metadata_json)
    return {}


def set_item_ar_metadata(item: Item, metadata: dict | None) -> None:
    item.ar_metadata_json = metadata or None


def update_item_ar_metadata(item: Item, **updates) -> dict:
    metadata = get_item_ar_metadata(item)
    for key, value in updates.items():
        if value is None:
            metadata.pop(key, None)
        else:
            metadata[key] = value
    set_item_ar_metadata(item, metadata)
    return metadata


def sorted_capture_assets(captures: Iterable[ArCaptureAsset]) -> list[ArCaptureAsset]:
    return sorted(captures, key=lambda capture: (capture.position, capture.created_at, str(capture.id)))


def validate_capture_mode(capture_mode: str) -> str:
    normalized = (capture_mode or "").strip().lower()
    if normalized not in VALID_CAPTURE_MODES:
        raise ValueError(f"Unsupported AR capture mode '{capture_mode}'")
    return normalized


def select_generation_input(captures: Iterable[ArCaptureAsset]) -> tuple[str, list[ArCaptureAsset]]:
    ordered = sorted_capture_assets(captures)
    images = [capture for capture in ordered if capture.kind == "image"]
    videos = [capture for capture in ordered if capture.kind == "video"]

    if len(images) >= 20:
        return "images", images
    if len(images) > 0 and not videos:
        raise ValueError("Please upload at least 20 images for photo-based AR generation.")
    if videos:
        return "video", [videos[0]]
    raise ValueError("Upload either at least 20 images or one video to generate an AR model.")


def reset_ar_outputs(item: Item, *, preserve_usdz: bool = False) -> None:
    item.ar_model_glb_s3_key = None
    item.ar_model_glb_url = None
    if not preserve_usdz:
        item.ar_model_usdz_s3_key = None
        item.ar_model_usdz_url = None
    item.ar_model_poster_s3_key = None
    item.ar_model_poster_url = None


def canonical_usdz_source(item: Item) -> tuple[str | None, str | None]:
    metadata = get_item_ar_metadata(item)
    provider_key = metadata.get("provider_usdz_s3_key")
    provider_url = metadata.get("provider_usdz_url")
    if provider_key and provider_url:
        return str(provider_key), str(provider_url)
    return item.ar_model_usdz_s3_key, item.ar_model_usdz_url


def queue_kiri_generation(
    *,
    session: Session,
    item: Item,
    capture_mode: str,
    detail: str | None = None,
) -> Item:
    now = datetime.utcnow()
    item.ar_provider = AR_PROVIDER_KIRI
    item.ar_capture_mode = validate_capture_mode(capture_mode)
    item.ar_status = "pending"
    item.ar_error_message = None
    item.ar_stage = AR_STAGE_QUEUED
    item.ar_stage_detail = detail
    item.ar_progress = 0.0
    item.ar_created_at = now
    item.ar_updated_at = now
    item.ar_job_id = uuid.uuid4()
    reset_ar_outputs(item, preserve_usdz=False)
    update_item_ar_metadata(
        item,
        serialize=None,
        provider_status=None,
        provider_message=None,
        provider_calculate_type=None,
        provider_input_kind=None,
        provider_usdz_s3_key=None,
        provider_usdz_url=None,
        provider_model_zip_s3_key=None,
        provider_submit_response_s3_key=None,
        conversion_job_id=None,
        conversion_status=None,
        capture_input_kind=None,
        video_frame_extraction=None,
        canceled_at=None,
    )
    session.add(item)
    return item


def queue_conversion_from_existing_usdz(
    *,
    session: Session,
    item: Item,
    detail: str | None = None,
) -> ArConversionJob:
    source_usdz_s3_key, source_usdz_url = canonical_usdz_source(item)
    if not source_usdz_s3_key or not source_usdz_url:
        raise ValueError("Cannot queue conversion without an existing USDZ model.")

    for existing in session.exec(
        select(ArConversionJob).where(
            ArConversionJob.item_id == item.id,
            ArConversionJob.status.in_([CONVERSION_STATUS_QUEUED, CONVERSION_STATUS_PROCESSING]),
        )
    ).all():
        existing.status = CONVERSION_STATUS_FAILED
        existing.error_message = "Superseded by a newer conversion request"
        existing.updated_at = datetime.utcnow()
        session.add(existing)

    job = ArConversionJob(
        item_id=item.id,
        status=CONVERSION_STATUS_QUEUED,
        usdz_s3_key=source_usdz_s3_key,
        usdz_url=source_usdz_url,
    )
    session.add(job)
    session.flush()

    item.ar_status = "processing"
    item.ar_error_message = None
    item.ar_stage = AR_STAGE_CONVERSION_QUEUED
    item.ar_stage_detail = detail or "Queued GLB conversion"
    item.ar_progress = max(float(item.ar_progress or 0.0), 0.8)
    item.ar_updated_at = datetime.utcnow()
    item.ar_provider = item.ar_provider or AR_PROVIDER_KIRI
    update_item_ar_metadata(
        item,
        conversion_job_id=str(job.id),
        conversion_status=CONVERSION_STATUS_QUEUED,
        conversion_source_usdz_s3_key=source_usdz_s3_key,
        conversion_source_kind=(
            "provider_original"
            if source_usdz_s3_key != item.ar_model_usdz_s3_key or source_usdz_url != item.ar_model_usdz_url
            else "current_item"
        ),
    )
    session.add(item)
    return job


def fail_item_ar(
    *,
    session: Session,
    item: Item,
    error_message: str,
    stage: str = AR_STAGE_FAILED,
    detail: str | None = None,
) -> None:
    item.ar_status = "failed"
    item.ar_error_message = error_message[:4000]
    item.ar_stage = stage
    item.ar_stage_detail = detail
    item.ar_progress = None
    item.ar_updated_at = datetime.utcnow()
    session.add(item)


def is_item_ar_active(item: Item) -> bool:
    return item.ar_status in {"pending", "processing"} and item.ar_stage != AR_STAGE_CANCELED
