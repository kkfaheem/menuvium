#!/usr/bin/env python3
from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select

import database
from models import ArCaptureAsset, ArConversionJob, Category, ImportJob, Item, ItemPhoto, Menu
from storage_keys import (
    import_result_zip_key,
    item_ar_capture_key,
    item_ar_current_glb_key,
    item_ar_current_poster_key,
    item_ar_current_usdz_key,
    item_ar_run_derived_android_glb_key,
    item_ar_run_frames_key,
    item_ar_run_provider_model_zip_key,
    item_ar_run_provider_original_usdz_key,
    item_ar_run_provider_submit_response_key,
    item_photo_original_key,
    menu_branding_banner_key,
    menu_branding_logo_key,
    menu_branding_title_logo_key,
    menu_qr_current_key,
    menu_qr_version_key,
    storage_key_from_url,
)
from storage_utils import build_public_url, copy_storage_key, delete_storage_key_best_effort


def _infer_content_type(name: str) -> str | None:
    guessed, _ = mimetypes.guess_type(name)
    return guessed


class Migrator:
    def __init__(self, *, dry_run: bool, delete_old: bool):
        self.dry_run = dry_run
        self.delete_old = delete_old
        self.copy_pairs: set[tuple[str, str]] = set()
        self.sources_to_delete: set[str] = set()

    def log(self, message: str) -> None:
        print(message)

    def copy_key(self, source_key: str | None, target_key: str, *, content_type: str | None = None) -> str:
        if not source_key:
            return target_key
        pair = (source_key, target_key)
        if pair in self.copy_pairs:
            return target_key
        self.log(f"COPY {source_key} -> {target_key}")
        if not self.dry_run:
            copy_storage_key(source_key=source_key, destination_key=target_key, content_type=content_type)
        self.copy_pairs.add(pair)
        if self.delete_old and source_key != target_key:
            self.sources_to_delete.add(source_key)
        return target_key

    def delete_sources(self) -> None:
        if self.dry_run or not self.delete_old:
            return
        for source_key in sorted(self.sources_to_delete):
            self.log(f"DELETE {source_key}")
            delete_storage_key_best_effort(source_key)


def _item_contexts(session: Session) -> dict[str, dict[str, str]]:
    contexts: dict[str, dict[str, str]] = {}
    items = session.exec(select(Item)).all()
    for item in items:
        category = session.get(Category, item.category_id)
        if not category:
            continue
        menu = session.get(Menu, category.menu_id)
        if not menu:
            continue
        contexts[str(item.id)] = {
            "org_id": str(menu.org_id),
            "menu_id": str(menu.id),
        }
    return contexts


def _menu_contexts(session: Session) -> dict[str, dict[str, str]]:
    return {str(menu.id): {"org_id": str(menu.org_id)} for menu in session.exec(select(Menu)).all()}


def _legacy_run_id(item: Item) -> str:
    return str(item.ar_job_id or f"legacy-{item.id}")


def _run_id_from_storage_prefix(prefix: str | None, fallback: str) -> str:
    if prefix and "/debug_frames/" in prefix:
        return prefix.split("/debug_frames/", 1)[1].split("/", 1)[0]
    if prefix and "/ar/runs/" in prefix:
        return prefix.split("/ar/runs/", 1)[1].split("/", 1)[0]
    return fallback


def _source_key(s3_key: str | None, url: str | None) -> str | None:
    return s3_key or storage_key_from_url(url)


def _public_url(key: str) -> str:
    return build_public_url(key)


def _migrate_menu_assets(session: Session, migrator: Migrator, menu_contexts: dict[str, dict[str, str]]) -> None:
    menus = session.exec(select(Menu)).all()
    for menu in menus:
        context = menu_contexts.get(str(menu.id))
        if not context:
            continue
        org_id = context["org_id"]

        banner_source = storage_key_from_url(menu.banner_url)
        if banner_source:
            ext = Path(banner_source).suffix or ".jpg"
            target_key = menu_branding_banner_key(org_id, menu.id, f"banner{ext}", content_type=_infer_content_type(banner_source))
            migrator.copy_key(banner_source, target_key, content_type=_infer_content_type(banner_source))
            menu.banner_url = _public_url(target_key)

        logo_source = storage_key_from_url(menu.logo_url)
        if logo_source:
            ext = Path(logo_source).suffix or ".png"
            target_key = menu_branding_logo_key(org_id, menu.id, f"logo{ext}", content_type=_infer_content_type(logo_source))
            migrator.copy_key(logo_source, target_key, content_type=_infer_content_type(logo_source))
            menu.logo_url = _public_url(target_key)

        qr_source = storage_key_from_url(menu.logo_qr_url)
        if qr_source:
            render_id = f"legacy-{menu.id}"
            version_key = menu_qr_version_key(org_id, menu.id, render_id, size_px=1000)
            current_key = menu_qr_current_key(org_id, menu.id, size_px=1000)
            migrator.copy_key(qr_source, version_key, content_type="image/png")
            migrator.copy_key(qr_source, current_key, content_type="image/png")
            menu.logo_qr_url = _public_url(version_key)

        if isinstance(menu.title_design_config, dict):
            config = dict(menu.title_design_config)
            logos = config.get("logos")
            if isinstance(logos, list):
                next_logos: list[str | None] = []
                for index, value in enumerate(logos):
                    source = storage_key_from_url(value if isinstance(value, str) else None)
                    if not source:
                        next_logos.append(value if isinstance(value, str) else None)
                        continue
                    ext = Path(source).suffix or ".png"
                    target_key = menu_branding_title_logo_key(
                        org_id,
                        menu.id,
                        f"title-logo-{index}{ext}",
                        content_type=_infer_content_type(source),
                    )
                    migrator.copy_key(source, target_key, content_type=_infer_content_type(source))
                    next_logos.append(_public_url(target_key))
                config["logos"] = next_logos
            logo_url = config.get("logoUrl")
            if isinstance(logo_url, str) and storage_key_from_url(logo_url) and menu.logo_url:
                config["logoUrl"] = menu.logo_url
            menu.title_design_config = config
        session.add(menu)


def _migrate_item_assets(session: Session, migrator: Migrator, item_contexts: dict[str, dict[str, str]]) -> None:
    items = session.exec(select(Item)).all()
    for item in items:
        context = item_contexts.get(str(item.id))
        if not context:
            continue
        org_id = context["org_id"]
        legacy_run_id = _legacy_run_id(item)

        photos = session.exec(select(ItemPhoto).where(ItemPhoto.item_id == item.id)).all()
        for photo in photos:
            source_key = _source_key(photo.s3_key, photo.url)
            if not source_key:
                continue
            target_key = item_photo_original_key(org_id, item.id, Path(source_key).name, content_type=_infer_content_type(source_key), asset_id=photo.id)
            migrator.copy_key(source_key, target_key, content_type=_infer_content_type(source_key))
            photo.s3_key = target_key
            photo.url = _public_url(target_key)
            session.add(photo)

        captures = session.exec(select(ArCaptureAsset).where(ArCaptureAsset.item_id == item.id)).all()
        capture_key_map: dict[str, tuple[str, str]] = {}
        for capture in captures:
            source_key = _source_key(capture.s3_key, capture.url)
            if not source_key:
                continue
            content_type = None
            if isinstance(capture.metadata_json, dict):
                raw_content_type = capture.metadata_json.get("content_type")
                if isinstance(raw_content_type, str):
                    content_type = raw_content_type
            target_key = item_ar_capture_key(
                org_id,
                item.id,
                Path(source_key).name,
                capture_kind=capture.kind,
                content_type=content_type or _infer_content_type(source_key),
                asset_id=capture.id,
            )
            migrator.copy_key(source_key, target_key, content_type=content_type or _infer_content_type(source_key))
            capture.s3_key = target_key
            capture.url = _public_url(target_key)
            capture_key_map[source_key] = (target_key, capture.url)
            session.add(capture)

        item_video_source = _source_key(item.ar_video_s3_key, item.ar_video_url)
        if item_video_source and item_video_source in capture_key_map:
            item.ar_video_s3_key, item.ar_video_url = capture_key_map[item_video_source]

        current_usdz_source = _source_key(item.ar_model_usdz_s3_key, item.ar_model_usdz_url)
        current_glb_source = _source_key(item.ar_model_glb_s3_key, item.ar_model_glb_url)
        current_poster_source = _source_key(item.ar_model_poster_s3_key, item.ar_model_poster_url)

        metadata = dict(item.ar_metadata_json) if isinstance(item.ar_metadata_json, dict) else {}
        provider_usdz_source = _source_key(
            metadata.get("provider_usdz_s3_key") if isinstance(metadata.get("provider_usdz_s3_key"), str) else None,
            metadata.get("provider_usdz_url") if isinstance(metadata.get("provider_usdz_url"), str) else None,
        ) or current_usdz_source

        if provider_usdz_source:
            provider_target_key = item_ar_run_provider_original_usdz_key(org_id, item.id, legacy_run_id, "original.usdz")
            current_target_key = item_ar_current_usdz_key(org_id, item.id)
            migrator.copy_key(provider_usdz_source, provider_target_key, content_type="model/vnd.usdz+zip")
            migrator.copy_key(provider_usdz_source, current_target_key, content_type="model/vnd.usdz+zip")
            metadata["provider_usdz_s3_key"] = provider_target_key
            metadata["provider_usdz_url"] = _public_url(provider_target_key)
            item.ar_model_usdz_s3_key = current_target_key
            item.ar_model_usdz_url = _public_url(current_target_key)

        provider_zip_source = metadata.get("provider_model_zip_s3_key")
        if isinstance(provider_zip_source, str):
            provider_zip_target = item_ar_run_provider_model_zip_key(org_id, item.id, legacy_run_id, Path(provider_zip_source).name or "model.zip")
            migrator.copy_key(provider_zip_source, provider_zip_target, content_type="application/zip")
            metadata["provider_model_zip_s3_key"] = provider_zip_target

        submit_response_source = metadata.get("provider_submit_response_s3_key")
        if isinstance(submit_response_source, str):
            submit_response_target = item_ar_run_provider_submit_response_key(org_id, item.id, legacy_run_id)
            migrator.copy_key(submit_response_source, submit_response_target, content_type="application/json")
            metadata["provider_submit_response_s3_key"] = submit_response_target

        if current_glb_source:
            current_glb_target = item_ar_current_glb_key(org_id, item.id)
            migrator.copy_key(current_glb_source, current_glb_target, content_type="model/gltf-binary")
            item.ar_model_glb_s3_key = current_glb_target
            item.ar_model_glb_url = _public_url(current_glb_target)

        if current_poster_source:
            current_poster_target = item_ar_current_poster_key(
                org_id,
                item.id,
                Path(current_poster_source).name,
                content_type=_infer_content_type(current_poster_source),
            )
            migrator.copy_key(current_poster_source, current_poster_target, content_type=_infer_content_type(current_poster_source))
            item.ar_model_poster_s3_key = current_poster_target
            item.ar_model_poster_url = _public_url(current_poster_target)

        extraction = metadata.get("video_frame_extraction")
        if isinstance(extraction, dict):
            storage_prefix = extraction.get("storage_prefix") if isinstance(extraction.get("storage_prefix"), str) else None
            run_id = _run_id_from_storage_prefix(storage_prefix, legacy_run_id)
            frames = extraction.get("persisted_frames")
            if isinstance(frames, list):
                next_frames: list[dict] = []
                for index, frame in enumerate(frames, start=1):
                    if not isinstance(frame, dict):
                        continue
                    source_key = _source_key(
                        frame.get("s3_key") if isinstance(frame.get("s3_key"), str) else None,
                        frame.get("url") if isinstance(frame.get("url"), str) else None,
                    )
                    filename = frame.get("filename") if isinstance(frame.get("filename"), str) else f"frame-{index:04d}.jpg"
                    target_key = item_ar_run_frames_key(org_id, item.id, run_id, filename, selected=False)
                    if source_key:
                        migrator.copy_key(source_key, target_key, content_type="image/jpeg")
                    next_frame = dict(frame)
                    next_frame["s3_key"] = target_key
                    next_frame["url"] = _public_url(target_key)
                    next_frames.append(next_frame)
                extraction["persisted_frames"] = next_frames
            extraction["storage_prefix"] = str(item_ar_run_frames_key(org_id, item.id, run_id, "frame-0001.jpg", selected=False).rsplit("/", 1)[0])
            metadata["video_frame_extraction"] = extraction

        if metadata.get("conversion_source_usdz_s3_key") == current_usdz_source and item.ar_model_usdz_s3_key:
            metadata["conversion_source_usdz_s3_key"] = item.ar_model_usdz_s3_key
        item.ar_metadata_json = metadata or None
        session.add(item)

    conversion_jobs = session.exec(select(ArConversionJob)).all()
    items_by_id = {str(item.id): item for item in items}
    for job in conversion_jobs:
        item = items_by_id.get(str(job.item_id))
        context = item_contexts.get(str(job.item_id))
        if not item or not context:
            continue
        org_id = context["org_id"]
        glb_source = _source_key(job.glb_s3_key, job.glb_url)
        if glb_source:
            target_key = item_ar_run_derived_android_glb_key(org_id, item.id, job.id)
            migrator.copy_key(glb_source, target_key, content_type="model/gltf-binary")
            job.glb_s3_key = target_key
            job.glb_url = _public_url(target_key)
        usdz_source = _source_key(job.usdz_s3_key, job.usdz_url)
        if usdz_source and item.ar_metadata_json and isinstance(item.ar_metadata_json, dict):
            provider_usdz_key = item.ar_metadata_json.get("provider_usdz_s3_key")
            if isinstance(provider_usdz_key, str):
                job.usdz_s3_key = provider_usdz_key
                job.usdz_url = _public_url(provider_usdz_key)
        session.add(job)


def _migrate_import_jobs(session: Session, migrator: Migrator) -> None:
    jobs = session.exec(select(ImportJob)).all()
    for job in jobs:
        source_key = job.result_zip_key
        if not source_key:
            continue
        filename = Path(source_key).name or f"{job.id}.zip"
        target_key = import_result_zip_key(job.id, filename, org_id=job.org_id)
        migrator.copy_key(source_key, target_key, content_type="application/zip")
        job.result_zip_key = target_key
        session.add(job)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ad hoc storage layout migration for Menuvium assets")
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without copying objects or updating the database")
    parser.add_argument("--delete-old", action="store_true", help="Delete source objects after successful copies")
    parser.add_argument("--database-url", help="Optional database URL override for the migration run")
    args = parser.parse_args()

    migrator = Migrator(dry_run=args.dry_run, delete_old=args.delete_old)
    if args.database_url:
        database.settings.DATABASE_URL = args.database_url
    engine = database.get_engine()
    with Session(engine) as session:
        item_contexts = _item_contexts(session)
        menu_contexts = _menu_contexts(session)
        _migrate_menu_assets(session, migrator, menu_contexts)
        _migrate_item_assets(session, migrator, item_contexts)
        _migrate_import_jobs(session, migrator)

        if args.dry_run:
            session.rollback()
        else:
            session.commit()

    migrator.delete_sources()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
