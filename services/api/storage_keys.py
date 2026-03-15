from __future__ import annotations

import mimetypes
import os
import re
import uuid
from pathlib import Path


_FILENAME_SANITIZER = re.compile(r"[^A-Za-z0-9._-]+")


def _normalize_identifier(value: uuid.UUID | str) -> str:
    return str(value)


def _safe_name(value: str, *, fallback: str) -> str:
    cleaned = _FILENAME_SANITIZER.sub("-", value.strip())
    cleaned = cleaned.strip(".-")
    return cleaned or fallback


def extension_for_filename(filename: str, *, content_type: str | None = None, default: str = "") -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix:
        return suffix
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
        if guessed:
            return guessed.lower()
    if default and not default.startswith("."):
        return f".{default.lower()}"
    return default.lower()


def generated_asset_filename(
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
    default_stem: str = "asset",
    default_ext: str = "",
) -> str:
    identifier = _normalize_identifier(asset_id or uuid.uuid4())
    ext = extension_for_filename(filename, content_type=content_type, default=default_ext)
    original_stem = _safe_name(Path(filename or "").stem, fallback=default_stem)
    return f"{identifier}-{original_stem}{ext}"


def organization_root(org_id: uuid.UUID | str) -> str:
    return f"orgs/{_normalize_identifier(org_id)}"


def item_root(org_id: uuid.UUID | str, item_id: uuid.UUID | str) -> str:
    return f"{organization_root(org_id)}/items/{_normalize_identifier(item_id)}"


def menu_root(org_id: uuid.UUID | str, menu_id: uuid.UUID | str) -> str:
    return f"{organization_root(org_id)}/menus/{_normalize_identifier(menu_id)}"


def import_root(import_job_id: uuid.UUID | str, *, org_id: uuid.UUID | str | None = None) -> str:
    if org_id:
        return f"{organization_root(org_id)}/imports/{_normalize_identifier(import_job_id)}"
    return f"imports/{_normalize_identifier(import_job_id)}"


def misc_upload_key(
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="upload",
        default_ext=".bin",
    )
    return f"misc/uploads/{target}"


def item_photo_original_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="photo",
        default_ext=".jpg",
    )
    return f"{item_root(org_id, item_id)}/photos/original/{target}"


def item_ar_capture_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    filename: str,
    *,
    capture_kind: str,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    normalized_kind = "video" if capture_kind == "video" else "image"
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem=normalized_kind,
        default_ext=".jpg" if normalized_kind == "image" else ".mp4",
    )
    return f"{item_root(org_id, item_id)}/ar/captures/{normalized_kind}/{target}"


def item_ar_current_manifest_key(org_id: uuid.UUID | str, item_id: uuid.UUID | str) -> str:
    return f"{item_root(org_id, item_id)}/ar/current/manifest.json"


def item_ar_current_usdz_key(org_id: uuid.UUID | str, item_id: uuid.UUID | str) -> str:
    return f"{item_root(org_id, item_id)}/ar/current/usdz/model.usdz"


def item_ar_current_glb_key(org_id: uuid.UUID | str, item_id: uuid.UUID | str) -> str:
    return f"{item_root(org_id, item_id)}/ar/current/glb/model.glb"


def item_ar_current_poster_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="poster",
        default_ext=".png",
    )
    return f"{item_root(org_id, item_id)}/ar/current/poster/{target}"


def item_ar_run_root(org_id: uuid.UUID | str, item_id: uuid.UUID | str, run_id: uuid.UUID | str) -> str:
    return f"{item_root(org_id, item_id)}/ar/runs/{_normalize_identifier(run_id)}"


def item_ar_run_manifest_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
) -> str:
    return f"{item_ar_run_root(org_id, item_id, run_id)}/manifest.json"


def item_ar_run_source_video_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
) -> str:
    ext = extension_for_filename(filename, content_type=content_type, default=".mp4")
    return f"{item_ar_run_root(org_id, item_id, run_id)}/input/video/original{ext}"


def item_ar_run_frames_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
    filename: str,
    *,
    selected: bool,
) -> str:
    subdir = "frames_selected" if selected else "frames_all"
    safe_filename = _safe_name(os.path.basename(filename), fallback="frame.jpg")
    return f"{item_ar_run_root(org_id, item_id, run_id)}/input/{subdir}/{safe_filename}"


def item_ar_run_provider_submit_response_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
) -> str:
    return f"{item_ar_run_root(org_id, item_id, run_id)}/provider/submit-response.json"


def item_ar_run_provider_model_zip_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
    filename: str = "model.zip",
) -> str:
    safe_filename = _safe_name(filename, fallback="model.zip")
    return f"{item_ar_run_root(org_id, item_id, run_id)}/provider/{safe_filename}"


def item_ar_run_provider_original_usdz_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
    filename: str = "original.usdz",
) -> str:
    safe_filename = _safe_name(filename, fallback="original.usdz")
    return f"{item_ar_run_root(org_id, item_id, run_id)}/provider/{safe_filename}"


def item_ar_run_derived_android_glb_key(
    org_id: uuid.UUID | str,
    item_id: uuid.UUID | str,
    run_id: uuid.UUID | str,
) -> str:
    return f"{item_ar_run_root(org_id, item_id, run_id)}/derived/android/model.glb"


def menu_branding_banner_key(
    org_id: uuid.UUID | str,
    menu_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="banner",
        default_ext=".jpg",
    )
    return f"{menu_root(org_id, menu_id)}/branding/banner/{target}"


def menu_branding_logo_key(
    org_id: uuid.UUID | str,
    menu_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="logo",
        default_ext=".png",
    )
    return f"{menu_root(org_id, menu_id)}/branding/logo/{target}"


def menu_branding_title_logo_key(
    org_id: uuid.UUID | str,
    menu_id: uuid.UUID | str,
    filename: str,
    *,
    content_type: str | None = None,
    asset_id: uuid.UUID | str | None = None,
) -> str:
    target = generated_asset_filename(
        filename,
        content_type=content_type,
        asset_id=asset_id,
        default_stem="title-logo",
        default_ext=".png",
    )
    return f"{menu_root(org_id, menu_id)}/branding/title_logos/{target}"


def menu_qr_current_key(org_id: uuid.UUID | str, menu_id: uuid.UUID | str, *, size_px: int = 1000) -> str:
    return f"{menu_root(org_id, menu_id)}/qr/current/qr-{size_px}.png"


def menu_qr_version_key(
    org_id: uuid.UUID | str,
    menu_id: uuid.UUID | str,
    render_id: uuid.UUID | str,
    *,
    size_px: int = 1000,
) -> str:
    return f"{menu_root(org_id, menu_id)}/qr/versions/{_normalize_identifier(render_id)}/qr-{size_px}.png"


def menu_manifest_items_key(org_id: uuid.UUID | str, menu_id: uuid.UUID | str) -> str:
    return f"{menu_root(org_id, menu_id)}/manifests/items.json"


def menu_manifest_public_key(org_id: uuid.UUID | str, menu_id: uuid.UUID | str) -> str:
    return f"{menu_root(org_id, menu_id)}/manifests/public-menu.json"


def import_source_upload_key(
    import_job_id: uuid.UUID | str,
    filename: str,
    *,
    org_id: uuid.UUID | str | None = None,
    source_kind: str = "upload",
    content_type: str | None = None,
) -> str:
    default_ext = ".pdf" if source_kind == "upload" else ".txt"
    ext = extension_for_filename(filename, content_type=content_type, default=default_ext)
    safe_name = _safe_name(Path(filename or "").stem, fallback=source_kind)
    return f"{import_root(import_job_id, org_id=org_id)}/source/{safe_name}{ext}"


def import_result_zip_key(
    import_job_id: uuid.UUID | str,
    filename: str,
    *,
    org_id: uuid.UUID | str | None = None,
) -> str:
    safe_filename = _safe_name(filename, fallback="menu-export.zip")
    return f"{import_root(import_job_id, org_id=org_id)}/output/{safe_filename}"


def import_output_manifest_key(import_job_id: uuid.UUID | str, *, org_id: uuid.UUID | str | None = None) -> str:
    return f"{import_root(import_job_id, org_id=org_id)}/output/manifest.json"


def import_log_key(import_job_id: uuid.UUID | str, *, org_id: uuid.UUID | str | None = None) -> str:
    return f"{import_root(import_job_id, org_id=org_id)}/logs/worker.log"


def storage_key_from_url(url: str | None) -> str | None:
    if not url:
        return None
    marker = ".amazonaws.com/"
    if marker in url:
        return url.split(marker, 1)[1].split("?", 1)[0]
    uploads_marker = "/uploads/"
    if uploads_marker in url:
        return url.split(uploads_marker, 1)[1].split("?", 1)[0]
    return None
