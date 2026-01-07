from fastapi import Request


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

