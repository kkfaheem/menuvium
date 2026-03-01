"""
Utility functions for the menu importer pipeline.
Includes slugify, rate-limited fetch, robots.txt checking, and retry logic.
"""

import asyncio
import hashlib
import re
import time
from typing import Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

# ---------------------------------------------------------------------------
# Slugify
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug.

    >>> slugify("The Gilded Fork")
    'the-gilded-fork'
    >>> slugify("Café Résumé & Bar!")
    'cafe-resume-bar'
    """
    text = text.lower().strip()
    # Normalize common unicode characters
    replacements = {
        "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
        "è": "e", "é": "e", "ê": "e", "ë": "e",
        "ì": "i", "í": "i", "î": "i", "ï": "i",
        "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
        "ù": "u", "ú": "u", "û": "u", "ü": "u",
        "ñ": "n", "ç": "c", "ß": "ss",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    # Replace non-alphanumeric with hyphens
    text = re.sub(r"[^a-z0-9]+", "-", text)
    # Strip leading/trailing hyphens
    text = text.strip("-")
    # Collapse multiple hyphens
    text = re.sub(r"-{2,}", "-", text)
    return text or "restaurant"


# ---------------------------------------------------------------------------
# Rate-limited HTTP client
# ---------------------------------------------------------------------------

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
MAX_CONCURRENT = 2
_semaphore: Optional[asyncio.Semaphore] = None

def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    return _semaphore


# Simple in-memory robots.txt cache
_robots_cache: dict[str, Optional[RobotFileParser]] = {}


def _get_robots_parser(base_url: str) -> Optional[RobotFileParser]:
    """Fetch and cache robots.txt for a domain."""
    parsed = urlparse(base_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin in _robots_cache:
        return _robots_cache[origin]
    robots_url = f"{origin}/robots.txt"
    rp = RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        _robots_cache[origin] = rp
    except Exception:
        _robots_cache[origin] = None
    return _robots_cache[origin]


def is_allowed_by_robots(url: str) -> bool:
    """Check if a URL is allowed by robots.txt. Returns True on error (permissive)."""
    try:
        rp = _get_robots_parser(url)
        if rp is None:
            return True
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


async def fetch_url(
    url: str,
    *,
    timeout: float = 15.0,
    max_retries: int = 3,
    headers: Optional[dict] = None,
) -> httpx.Response:
    """Fetch a URL with rate limiting, retries, and backoff."""
    sem = _get_semaphore()
    req_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
    }
    if headers:
        req_headers.update(headers)

    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        async with sem:
            try:
                async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=True, verify=False
                ) as client:
                    resp = await client.get(url, headers=req_headers)
                    resp.raise_for_status()
                    return resp
            except httpx.HTTPStatusError as exc:
                # Don't retry client errors (4xx) — they won't change
                if 400 <= exc.response.status_code < 500:
                    raise
                last_exc = exc
                wait = 2 ** attempt
                await asyncio.sleep(wait)
            except httpx.RequestError as exc:
                last_exc = exc
                wait = 2 ** attempt
                await asyncio.sleep(wait)
    raise last_exc or RuntimeError(f"Failed to fetch {url}")


async def fetch_url_bytes(url: str, **kwargs) -> bytes:
    """Fetch URL and return raw bytes."""
    response = await fetch_url(url, **kwargs)
    return response.content


async def fetch_url_text(url: str, **kwargs) -> str:
    """Fetch URL and return decoded text."""
    response = await fetch_url(url, **kwargs)
    return response.text


# ---------------------------------------------------------------------------
# Image hashing (perceptual-ish via average hash)
# ---------------------------------------------------------------------------

def image_hash(data: bytes) -> str:
    """Compute a simple hash for deduplication. Uses SHA256 of raw bytes."""
    return hashlib.sha256(data).hexdigest()


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def normalize_url(base: str, href: str) -> Optional[str]:
    """Resolve a potentially relative URL against a base URL."""
    if not href or href.startswith(("data:", "javascript:", "mailto:", "#")):
        return None
    try:
        resolved = urljoin(base, href)
        parsed = urlparse(resolved)
        if parsed.scheme in ("http", "https"):
            return resolved
    except Exception:
        pass
    return None


def is_image_url(url: str) -> bool:
    """Check if a URL looks like an image based on extension or common patterns."""
    path = urlparse(url).path.lower()
    image_extensions = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg")
    return any(path.endswith(ext) for ext in image_extensions)


def is_likely_dish_image(url: str, width: int = 0, height: int = 0) -> bool:
    """Filter out tiny icons and logos. Prefer images above a minimum size."""
    if width > 0 and height > 0:
        return width >= 100 and height >= 100
    # Check URL for common non-dish patterns
    lower = url.lower()
    skip_patterns = [
        "logo", "icon", "favicon", "sprite", "avatar", "badge",
        "button", "social", "facebook", "twitter", "instagram",
        "linkedin", "pinterest", "youtube", "tiktok", "arrow",
        "spinner", "loading", "placeholder", "banner-ad",
    ]
    return not any(p in lower for p in skip_patterns)
