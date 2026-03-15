#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from datetime import datetime

import boto3


@dataclass
class PrefixStats:
    key: str
    objects: int
    bytes: int
    latest_modified: datetime | None


def human_size(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(value)
    for unit in units:
        if size < 1024.0 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{value} B"


def normalize_prefix(prefix: str) -> str:
    if not prefix:
        return ""
    return prefix if prefix.endswith("/") else f"{prefix}/"


def build_session(profile: str | None, region: str | None) -> boto3.session.Session:
    kwargs: dict[str, str] = {}
    if profile:
        kwargs["profile_name"] = profile
    if region:
        kwargs["region_name"] = region
    return boto3.Session(**kwargs)


def list_child_prefixes(client, bucket: str, prefix: str) -> list[str]:
    paginator = client.get_paginator("list_objects_v2")
    prefixes: list[str] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix, Delimiter="/"):
        for item in page.get("CommonPrefixes", []):
            child = item.get("Prefix")
            if isinstance(child, str):
                prefixes.append(child)
    return sorted(set(prefixes))


def collect_prefix_stats(client, bucket: str, prefix: str) -> PrefixStats:
    paginator = client.get_paginator("list_objects_v2")
    total_bytes = 0
    total_objects = 0
    latest_modified: datetime | None = None
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            if key == prefix:
                continue
            total_objects += 1
            total_bytes += int(obj.get("Size", 0))
            modified = obj.get("LastModified")
            if isinstance(modified, datetime) and (
                latest_modified is None or modified > latest_modified
            ):
                latest_modified = modified
    return PrefixStats(
        key=prefix,
        objects=total_objects,
        bytes=total_bytes,
        latest_modified=latest_modified,
    )


def list_objects(client, bucket: str, prefix: str, limit: int) -> list[dict]:
    paginator = client.get_paginator("list_objects_v2")
    results: list[dict] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj.get("Key")
            if key == prefix:
                continue
            results.append(obj)
            if len(results) >= limit:
                return results
    return results


def print_summary(client, bucket: str, prefix: str) -> int:
    children = list_child_prefixes(client, bucket, prefix)
    if not children:
        stats = collect_prefix_stats(client, bucket, prefix)
        print(
            f"{stats.key or '/'} | objects={stats.objects} | size={human_size(stats.bytes)} | "
            f"latest={stats.latest_modified.isoformat() if stats.latest_modified else '-'}"
        )
        return 0

    rows = [collect_prefix_stats(client, bucket, child) for child in children]
    rows.sort(key=lambda row: row.bytes, reverse=True)
    for row in rows:
        print(
            f"{row.key} | objects={row.objects} | size={human_size(row.bytes)} | "
            f"latest={row.latest_modified.isoformat() if row.latest_modified else '-'}"
        )
    return 0


def print_objects(client, bucket: str, prefix: str, limit: int) -> int:
    rows = list_objects(client, bucket, prefix, limit)
    if not rows:
        print("No objects found.")
        return 0
    for obj in rows:
        print(
            f"{obj['Key']} | size={human_size(int(obj.get('Size', 0)))} | "
            f"modified={obj.get('LastModified').isoformat() if obj.get('LastModified') else '-'}"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect Menuvium S3 storage layout.")
    parser.add_argument(
        "mode",
        choices=["summary", "objects"],
        nargs="?",
        default="summary",
        help="summary: summarize child prefixes, objects: list individual objects",
    )
    parser.add_argument("--bucket", default=os.getenv("S3_BUCKET_NAME"))
    parser.add_argument("--prefix", default="")
    parser.add_argument("--profile", default=os.getenv("AWS_PROFILE"))
    parser.add_argument("--region", default=os.getenv("AWS_REGION"))
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    if not args.bucket:
        raise SystemExit("S3 bucket is required. Pass --bucket or set S3_BUCKET_NAME.")

    session = build_session(args.profile, args.region)
    client = session.client("s3")
    prefix = normalize_prefix(args.prefix)

    if args.mode == "objects":
        return print_objects(client, args.bucket, prefix, args.limit)
    return print_summary(client, args.bucket, prefix)


if __name__ == "__main__":
    raise SystemExit(main())
