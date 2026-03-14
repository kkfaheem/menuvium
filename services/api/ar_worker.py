from __future__ import annotations

import shutil
import tempfile
import threading
import time
import traceback
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

import os
import requests
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ar_pipeline import (
    AR_CAPTURE_MODE_FEATURELESS,
    AR_PROVIDER_KIRI,
    AR_STAGE_CONVERSION_QUEUED,
    AR_STAGE_DOWNLOADING_USDZ,
    AR_STAGE_KIRI_PROCESSING,
    AR_STAGE_UPLOADING_TO_KIRI,
    KIRI_STATUS_EXPIRED,
    KIRI_STATUS_FAILED,
    KIRI_STATUS_PROCESSING,
    KIRI_STATUS_QUEUING,
    KIRI_STATUS_SUCCESS,
    KIRI_STATUS_UPLOADING,
    fail_item_ar,
    get_item_ar_metadata,
    is_item_ar_active,
    kiri_api_key,
    kiri_enabled,
    queue_conversion_from_existing_usdz,
    select_generation_input,
    update_item_ar_metadata,
)
from database import get_engine
from kiri_client import KiriApiError, KiriClient
from models import Item
from storage_utils import materialize_storage_key_to_path, store_file_from_path


POLL_INTERVAL_SECONDS = 5


def start_worker():
    if os.getenv("MENUVIUM_DISABLE_AR_WORKER") == "1":
        print("[ar-worker] Disabled by MENUVIUM_DISABLE_AR_WORKER=1")
        return None
    if not kiri_enabled():
        print("[ar-worker] KIRI_API_KEY not configured; KIRI worker not started")
        return None
    thread = threading.Thread(target=_worker_loop, daemon=True, name="kiri-ar-worker")
    thread.start()
    print("[ar-worker] Background KIRI worker started")
    return thread


def _worker_loop():
    while True:
        try:
            if _submit_next_pending_job():
                continue
            if _poll_next_processing_job():
                continue
            time.sleep(POLL_INTERVAL_SECONDS)
        except Exception as exc:
            print(f"[ar-worker] Worker error: {exc}")
            traceback.print_exc()
            time.sleep(POLL_INTERVAL_SECONDS)


def _kiri_client() -> KiriClient:
    api_key = kiri_api_key()
    if not api_key:
        raise RuntimeError("KIRI_API_KEY is not configured")
    return KiriClient(api_key=api_key)


def _submit_next_pending_job() -> bool:
    engine = get_engine()
    with Session(engine) as session:
        item = session.exec(
            select(Item)
            .where(Item.ar_provider == AR_PROVIDER_KIRI)
            .where(Item.ar_status == "pending")
            .order_by(Item.ar_created_at)
            .limit(1)
        ).first()
        if not item:
            return False
        item.ar_status = "processing"
        item.ar_stage = AR_STAGE_UPLOADING_TO_KIRI
        item.ar_stage_detail = "Preparing captures for KIRI"
        item.ar_progress = 0.05
        item.ar_updated_at = datetime.utcnow()
        session.add(item)
        session.commit()
        item_id = item.id

    _process_pending_item(item_id)
    return True


def _poll_next_processing_job() -> bool:
    engine = get_engine()
    with Session(engine) as session:
        items = session.exec(
            select(Item)
            .where(Item.ar_provider == AR_PROVIDER_KIRI)
            .where(Item.ar_status == "processing")
            .order_by(Item.ar_updated_at)
            .limit(20)
        ).all()

        for item in items:
            if item.ar_stage in {AR_STAGE_CONVERSION_QUEUED, "converting_glb"}:
                continue
            metadata = get_item_ar_metadata(item)
            serialize = metadata.get("serialize")
            if serialize:
                item_id = item.id
                break
        else:
            return False

    _poll_item_status(item_id)
    return True


def _load_item_with_captures(session: Session, item_id) -> Item | None:
    return session.exec(
        select(Item)
        .where(Item.id == item_id)
        .options(selectinload(Item.ar_capture_assets))
    ).first()


def _process_pending_item(item_id) -> None:
    engine = get_engine()
    with Session(engine) as session:
        item = _load_item_with_captures(session, item_id)
        if not item:
            return
        if item.ar_provider != AR_PROVIDER_KIRI or item.ar_status != "processing":
            return

        captures = list(item.ar_capture_assets or [])
        try:
            capture_input_kind, selected_captures = select_generation_input(captures)
        except ValueError as exc:
            fail_item_ar(session=session, item=item, error_message=str(exc), detail="Capture validation failed")
            session.commit()
            return

        update_item_ar_metadata(item, capture_input_kind=capture_input_kind)
        item.ar_stage = AR_STAGE_UPLOADING_TO_KIRI
        item.ar_stage_detail = "Uploading captures to KIRI"
        item.ar_progress = 0.12
        item.ar_updated_at = datetime.utcnow()
        session.add(item)
        session.commit()

    with tempfile.TemporaryDirectory(prefix=f"menuvium-kiri-{item_id}-") as temp_dir:
        temp_path = Path(temp_dir)
        materialized_paths = []
        try:
            for capture in selected_captures:
                destination = temp_path / f"{capture.position:04d}-{Path(capture.s3_key).name}"
                materialize_storage_key_to_path(key=capture.s3_key, destination=destination)
                materialized_paths.append(destination)

            client = _kiri_client()
            if item.ar_capture_mode == AR_CAPTURE_MODE_FEATURELESS:
                if capture_input_kind == "images":
                    submitted = client.submit_featureless_images(
                        image_paths=materialized_paths,
                        file_format="usdz",
                    )
                else:
                    submitted = client.submit_featureless_video(
                        video_path=materialized_paths[0],
                        file_format="usdz",
                    )
            else:
                if capture_input_kind == "images":
                    submitted = client.submit_photo_images(
                        image_paths=materialized_paths,
                        file_format="usdz",
                        model_quality=int(os.getenv("KIRI_PHOTO_MODEL_QUALITY", "0")),
                        texture_quality=int(os.getenv("KIRI_PHOTO_TEXTURE_QUALITY", "0")),
                        texture_smoothing=int(os.getenv("KIRI_PHOTO_TEXTURE_SMOOTHING", "1")),
                        is_mask=int(os.getenv("KIRI_PHOTO_IS_MASK", "1")),
                    )
                else:
                    submitted = client.submit_photo_video(
                        video_path=materialized_paths[0],
                        file_format="usdz",
                        model_quality=int(os.getenv("KIRI_PHOTO_MODEL_QUALITY", "0")),
                        texture_quality=int(os.getenv("KIRI_PHOTO_TEXTURE_QUALITY", "0")),
                        texture_smoothing=int(os.getenv("KIRI_PHOTO_TEXTURE_SMOOTHING", "1")),
                        is_mask=int(os.getenv("KIRI_PHOTO_IS_MASK", "1")),
                    )
        except KiriApiError as exc:
            with Session(engine) as session:
                item = session.get(Item, item_id)
                if item:
                    fail_item_ar(
                        session=session,
                        item=item,
                        error_message=f"KIRI submission failed: {exc}",
                        detail="KIRI rejected the capture upload",
                    )
                    update_item_ar_metadata(
                        item,
                        provider_message=str(exc),
                    )
                    session.commit()
            return
        except Exception as exc:
            with Session(engine) as session:
                item = session.get(Item, item_id)
                if item:
                    fail_item_ar(
                        session=session,
                        item=item,
                        error_message=f"Failed to prepare KIRI job: {exc}",
                        detail="Could not prepare capture files",
                    )
                    session.commit()
            return

    with Session(engine) as session:
        item = session.get(Item, item_id)
        if not item or item.ar_stage == "canceled":
            return
        item.ar_status = "processing"
        item.ar_stage = AR_STAGE_KIRI_PROCESSING
        item.ar_stage_detail = "Waiting for KIRI to finish processing"
        item.ar_progress = 0.2
        item.ar_updated_at = datetime.utcnow()
        update_item_ar_metadata(
            item,
            serialize=submitted.serialize,
            provider_status=KIRI_STATUS_QUEUING,
            provider_calculate_type=submitted.calculate_type,
            provider_message="submitted",
        )
        session.add(item)
        session.commit()


def _poll_item_status(item_id) -> None:
    engine = get_engine()
    with Session(engine) as session:
        item = session.get(Item, item_id)
        if not item or item.ar_provider != AR_PROVIDER_KIRI or item.ar_status != "processing":
            return
        metadata = get_item_ar_metadata(item)
        serialize = metadata.get("serialize")
        if not serialize:
            return

    try:
        status = _kiri_client().get_status(serialize=serialize)
    except KiriApiError as exc:
        with Session(engine) as session:
            item = session.get(Item, item_id)
            if item and is_item_ar_active(item):
                update_item_ar_metadata(item, provider_message=f"Status poll failed: {exc}")
                item.ar_updated_at = datetime.utcnow()
                session.add(item)
                session.commit()
        return

    handle_kiri_status_update(serialize=status.serialize, provider_status=status.status, source="poll")


def handle_kiri_status_update(*, serialize: str, provider_status: int, source: str) -> bool:
    engine = get_engine()
    with Session(engine) as session:
        item = _find_item_by_serialize(session=session, serialize=serialize)
        if not item:
            return False

        update_item_ar_metadata(item, provider_status=provider_status)
        item.ar_updated_at = datetime.utcnow()

        if not is_item_ar_active(item):
            session.add(item)
            session.commit()
            return True

        if provider_status == KIRI_STATUS_UPLOADING:
            item.ar_stage = AR_STAGE_UPLOADING_TO_KIRI
            item.ar_stage_detail = f"KIRI is uploading captures ({source})"
            item.ar_progress = max(float(item.ar_progress or 0.0), 0.15)
        elif provider_status in {KIRI_STATUS_QUEUING, KIRI_STATUS_PROCESSING}:
            item.ar_stage = AR_STAGE_KIRI_PROCESSING
            item.ar_stage_detail = "KIRI is processing the model"
            item.ar_progress = max(float(item.ar_progress or 0.0), 0.45 if provider_status == KIRI_STATUS_QUEUING else 0.65)
        elif provider_status == KIRI_STATUS_SUCCESS:
            session.add(item)
            session.commit()
            _finalize_successful_kiri_job(item.id, serialize=serialize, source=source)
            return True
        elif provider_status == KIRI_STATUS_FAILED:
            fail_item_ar(
                session=session,
                item=item,
                error_message="KIRI failed to generate this model.",
                detail="KIRI returned failed status",
            )
        elif provider_status == KIRI_STATUS_EXPIRED:
            fail_item_ar(
                session=session,
                item=item,
                error_message="KIRI model expired before Menuvium could download it.",
                detail="KIRI returned expired status",
            )
        else:
            update_item_ar_metadata(item, provider_message=f"Unhandled KIRI status {provider_status}")

        session.add(item)
        session.commit()
        return True


def _finalize_successful_kiri_job(item_id, *, serialize: str, source: str) -> None:
    engine = get_engine()
    with Session(engine) as session:
        item = session.get(Item, item_id)
        if not item or not is_item_ar_active(item):
            return
        item.ar_stage = AR_STAGE_DOWNLOADING_USDZ
        item.ar_stage_detail = f"Downloading USDZ from KIRI ({source})"
        item.ar_progress = max(float(item.ar_progress or 0.0), 0.72)
        item.ar_updated_at = datetime.utcnow()
        session.add(item)
        session.commit()

    try:
        model_zip = _kiri_client().get_model_zip(serialize=serialize)
    except KiriApiError as exc:
        with Session(engine) as session:
            item = session.get(Item, item_id)
            if item and is_item_ar_active(item):
                fail_item_ar(
                    session=session,
                    item=item,
                    error_message=f"Failed to retrieve KIRI model download link: {exc}",
                    detail="KIRI did not return a model zip URL",
                )
                session.commit()
        return

    try:
        with tempfile.TemporaryDirectory(prefix=f"menuvium-kiri-model-{item_id}-") as temp_dir:
            temp_path = Path(temp_dir)
            zip_path = temp_path / "model.zip"
            extract_dir = temp_path / "unzipped"
            extract_dir.mkdir(parents=True, exist_ok=True)

            with requests.get(model_zip.model_url, stream=True, timeout=300) as response:
                response.raise_for_status()
                with zip_path.open("wb") as handle:
                    shutil.copyfileobj(response.raw, handle)

            with zipfile.ZipFile(zip_path) as archive:
                archive.extractall(extract_dir)

            usdz_candidates = sorted(extract_dir.rglob("*.usdz"))
            if not usdz_candidates:
                raise RuntimeError("KIRI returned a model zip without a USDZ file")

            usdz_path = usdz_candidates[0]
            usdz_key = f"items/ar/{item_id}/model_usdz/{uuid.uuid4()}-{usdz_path.name}"
            usdz_url = store_file_from_path(
                source_path=usdz_path,
                key=usdz_key,
                content_type="model/vnd.usdz+zip",
            )
    except Exception as exc:
        with Session(engine) as session:
            item = session.get(Item, item_id)
            if item and is_item_ar_active(item):
                fail_item_ar(
                    session=session,
                    item=item,
                    error_message=f"Failed to download/store the KIRI USDZ model: {exc}",
                    detail="KIRI model download failed",
                )
                session.commit()
        return

    with Session(engine) as session:
        item = session.get(Item, item_id)
        if not item or not is_item_ar_active(item):
            return
        item.ar_model_usdz_s3_key = usdz_key
        item.ar_model_usdz_url = usdz_url
        item.ar_stage = AR_STAGE_CONVERSION_QUEUED
        item.ar_stage_detail = "USDZ stored; waiting for GLB conversion"
        item.ar_progress = max(float(item.ar_progress or 0.0), 0.8)
        item.ar_updated_at = datetime.utcnow()
        update_item_ar_metadata(item, provider_message="model downloaded")
        queue_conversion_from_existing_usdz(session=session, item=item, detail="USDZ ready for GLB conversion")
        session.commit()


def _find_item_by_serialize(*, session: Session, serialize: str) -> Item | None:
    items = session.exec(
        select(Item)
        .where(Item.ar_provider == AR_PROVIDER_KIRI)
        .where(Item.ar_status.in_(["pending", "processing", "failed"]))
        .options(selectinload(Item.ar_capture_assets))
    ).all()
    for item in items:
        metadata = get_item_ar_metadata(item)
        if metadata.get("serialize") == serialize:
            return item
    return None
