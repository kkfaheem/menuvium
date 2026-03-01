"""
Zipper: builds the restaurant folder structure and creates a zip archive.

Output structure:
  <restaurant-slug>/
    manifest.json
    images/
      dish_001.webp
      dish_002.webp
      ...
"""

import io
import os
import zipfile
from pathlib import Path
from typing import Optional

import boto3

from importer.utils import slugify


def create_zip(
    restaurant_name: str,
    manifest_json: str,
    images: list[dict],  # [{"filename": "dish_001.webp", "data": bytes}, ...]
) -> bytes:
    """Create a zip archive with the restaurant folder structure.

    Returns the zip bytes.
    """
    slug = slugify(restaurant_name)
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # manifest.json at root of restaurant folder
        zf.writestr(f"{slug}/manifest.json", manifest_json)

        # Images
        for img in images:
            zf.writestr(f"{slug}/images/{img['filename']}", img["data"])

    return buffer.getvalue()


def store_zip(
    zip_data: bytes,
    job_id: str,
    restaurant_name: str,
) -> str:
    """Store the zip archive and return a storage key/path.

    Uses S3 if configured, otherwise stores locally.
    Returns the storage key (S3 key or local path).
    """
    slug = slugify(restaurant_name)
    filename = f"{slug}.zip"

    if _use_s3():
        return _store_to_s3(zip_data, job_id, filename)
    else:
        return _store_locally(zip_data, job_id, filename)


def get_zip_data(storage_key: str) -> Optional[bytes]:
    """Retrieve zip data from storage by key.

    Returns bytes or None if not found.
    """
    if _use_s3():
        return _get_from_s3(storage_key)
    else:
        return _get_from_local(storage_key)


def _use_s3() -> bool:
    """Check if S3 storage is configured."""
    return bool(os.getenv("S3_BUCKET_NAME")) and os.getenv("LOCAL_UPLOADS") != "1"


def _store_to_s3(data: bytes, job_id: str, filename: str) -> str:
    """Upload zip to S3 and return the key."""
    bucket = os.getenv("S3_BUCKET_NAME")
    key = f"menu-importer/{job_id}/{filename}"

    s3 = boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType="application/zip",
        ContentDisposition=f'attachment; filename="{filename}"',
    )
    return key


def _get_from_s3(key: str) -> Optional[bytes]:
    """Download zip from S3."""
    bucket = os.getenv("S3_BUCKET_NAME")
    try:
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        response = s3.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()
    except Exception:
        return None


def _store_locally(data: bytes, job_id: str, filename: str) -> str:
    """Store zip to local filesystem and return the path."""
    base_dir = Path("/tmp/menu-importer") / job_id
    base_dir.mkdir(parents=True, exist_ok=True)
    filepath = base_dir / filename
    filepath.write_bytes(data)
    return str(filepath)


def _get_from_local(path: str) -> Optional[bytes]:
    """Read zip from local filesystem."""
    try:
        return Path(path).read_bytes()
    except Exception:
        return None
