from fastapi import Request
from typing import Optional
from urllib.parse import urlparse


def external_base_url(request: Request, default_prefix: str = "") -> str:
    """
    Resolve the externally reachable base URL for this request, honoring reverse-proxy headers.

    If `X-Forwarded-Prefix` is set (e.g. `/api`), returned URLs include that prefix.
    """
    forwarded_host = request.headers.get("x-forwarded-host")
    host = forwarded_host or request.headers.get("host") or request.url.netloc

    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = forwarded_proto or request.url.scheme

    prefix = request.headers.get("x-forwarded-prefix") or default_prefix
    prefix = prefix.rstrip("/")

    return f"{scheme}://{host}{prefix}".rstrip("/")


def forwarded_prefix(request: Request, default_prefix: str = "") -> str:
    prefix = request.headers.get("x-forwarded-prefix") or default_prefix
    prefix = prefix.rstrip("/")
    return prefix


def normalize_upload_url(url: Optional[str], request: Request, default_prefix: str = "") -> Optional[str]:
    """
    Normalize local upload URLs so they work across devices.

    - If `url` contains `/uploads/<key>` (absolute or relative), return `/<prefix>/uploads/<key>` using forwarded prefix.
    """
    if not url:
        return url

    path = url if url.startswith("/") else (urlparse(url).path or "")
    if "/uploads/" not in path:
        return url

    key = path.split("/uploads/", 1)[1].lstrip("/")
    prefix = forwarded_prefix(request, default_prefix=default_prefix)
    return f"{prefix}/uploads/{key}" if prefix else f"/uploads/{key}"
