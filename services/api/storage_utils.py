from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, Request

from url_utils import external_base_url, forwarded_prefix


def local_uploads_enabled() -> bool:
    return os.getenv("LOCAL_UPLOADS") == "1"


def local_upload_dir() -> Path:
    return Path(__file__).resolve().parent / "uploads"


def safe_local_path(key: str) -> Path:
    base = local_upload_dir().resolve()
    target = (base / key).resolve()
    if not str(target).startswith(str(base) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid upload key")
    return target


def build_public_url(key: str, *, request: Request | None = None, base_url: str | None = None) -> str:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        return f"https://{bucket_name}.s3.amazonaws.com/{key}"
    if base_url:
        return f"{base_url.rstrip('/')}/uploads/{key}"
    if request is not None:
        prefix = forwarded_prefix(request)
        return f"{prefix}/uploads/{key}" if prefix else f"/uploads/{key}"
    return f"/uploads/{key}"


def create_upload_target(
    *,
    key: str,
    content_type: str,
    request: Request,
) -> dict:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        if local_uploads_enabled():
            prefix = forwarded_prefix(request)
            base = prefix or ""
            return {
                "upload_url": f"{base}/items/local-upload/{key}",
                "s3_key": key,
                "public_url": build_public_url(key, request=request),
            }
        raise HTTPException(status_code=500, detail="S3 configuration missing")

    s3_client = boto3.client("s3")
    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": bucket_name, "Key": key, "ContentType": content_type},
            ExpiresIn=3600,
        )
    except ClientError as exc:
        print(exc)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return {
        "upload_url": upload_url,
        "s3_key": key,
        "public_url": build_public_url(key),
    }


def store_file_from_path(
    *,
    source_path: Path,
    key: str,
    content_type: str | None = None,
    base_url: str | None = None,
) -> str:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        extra_args = {"ContentType": content_type} if content_type else None
        boto3.client("s3").upload_file(
            str(source_path),
            bucket_name,
            key,
            ExtraArgs=extra_args or {},
        )
        return build_public_url(key)

    if not local_uploads_enabled():
        raise RuntimeError("Storage not configured")
    target = safe_local_path(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target)
    return build_public_url(key, base_url=base_url)


def materialize_storage_key_to_path(*, key: str, destination: Path) -> Path:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if bucket_name:
        boto3.client("s3").download_file(bucket_name, key, str(destination))
        return destination

    if not local_uploads_enabled():
        raise RuntimeError("Storage not configured")
    source = safe_local_path(key)
    shutil.copy2(source, destination)
    return destination


def delete_storage_key_best_effort(s3_key: Optional[str]) -> None:
    if not s3_key:
        return
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        try:
            boto3.client("s3").delete_object(Bucket=bucket_name, Key=s3_key)
        except Exception:
            pass
        return
    if local_uploads_enabled():
        try:
            safe_local_path(s3_key).unlink(missing_ok=True)
        except Exception:
            pass


def public_base_url_from_request(request: Request) -> str:
    return external_base_url(request)
