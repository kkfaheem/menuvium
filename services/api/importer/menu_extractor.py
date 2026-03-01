"""
Menu extractor: discovers and parses menu data from a restaurant website.

Handles:
- HTML menu pages (cheerio-like extraction with BeautifulSoup)
- PDF menus (download + pdfplumber text extraction)
- Menu images (download + Tesseract OCR as last resort)
- OpenAI structured parsing for all text sources
"""

import io
import os
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup

from importer.utils import fetch_url_text, fetch_url_bytes, normalize_url


@dataclass
class ParsedItem:
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None


@dataclass
class ParsedCategory:
    name: str
    items: list[ParsedItem] = field(default_factory=list)


@dataclass
class ParsedMenu:
    categories: list[ParsedCategory] = field(default_factory=list)
    raw_text: str = ""
    source_urls: list[str] = field(default_factory=list)


# Common menu page path patterns
MENU_PATH_PATTERNS = [
    "/menu", "/menus", "/food-menu", "/food", "/our-menu",
    "/dinner-menu", "/lunch-menu", "/drinks", "/bar-menu",
]


async def extract_menu(website_url: str, log_fn=None) -> ParsedMenu:
    """Main entry point: discover menu sources on a website and extract structured data."""
    if log_fn is None:
        log_fn = lambda msg: None

    log_fn(f"Fetching homepage: {website_url}")

    # Step 1: Fetch homepage and discover menu-related links
    try:
        html = await fetch_url_text(website_url)
    except Exception as e:
        log_fn(f"Failed to fetch homepage: {e}")
        return ParsedMenu(raw_text=f"Error fetching {website_url}: {e}")

    soup = BeautifulSoup(html, "html.parser")
    menu_urls = _discover_menu_links(website_url, soup)
    log_fn(f"Discovered {len(menu_urls)} potential menu URL(s)")

    # Step 2: Collect text from all menu sources
    all_text_parts: list[str] = []
    source_urls: list[str] = []

    # Extract from homepage if it looks like a menu page
    homepage_text = _extract_menu_text_from_html(soup)
    if _looks_like_menu(homepage_text):
        all_text_parts.append(homepage_text)
        source_urls.append(website_url)
        log_fn("Homepage contains menu content")

    # Try each discovered menu URL
    for url in menu_urls[:5]:  # Cap at 5 pages
        try:
            log_fn(f"Fetching menu page: {url}")
            content_bytes = await fetch_url_bytes(url)
            content_type = _guess_content_type(url, content_bytes)

            if content_type == "pdf":
                text = _extract_text_from_pdf(content_bytes)
                if text.strip():
                    all_text_parts.append(text)
                    source_urls.append(url)
                    log_fn(f"Extracted {len(text)} chars from PDF")
                else:
                    log_fn("PDF text extraction empty, trying OCR...")
                    ocr_text = _ocr_image_bytes(content_bytes)
                    if ocr_text.strip():
                        all_text_parts.append(ocr_text)
                        source_urls.append(url)

            elif content_type == "image":
                log_fn(f"Menu image detected, OCR-ing...")
                ocr_text = _ocr_image_bytes(content_bytes)
                if ocr_text.strip():
                    all_text_parts.append(ocr_text)
                    source_urls.append(url)

            else:  # HTML
                page_soup = BeautifulSoup(content_bytes, "html.parser")
                page_text = _extract_menu_text_from_html(page_soup)
                if page_text.strip():
                    all_text_parts.append(page_text)
                    source_urls.append(url)
                    log_fn(f"Extracted {len(page_text)} chars from HTML")

                # Check for embedded PDF links on menu pages
                pdf_links = _find_pdf_links(url, page_soup)
                for pdf_url in pdf_links[:2]:
                    try:
                        log_fn(f"Downloading PDF: {pdf_url}")
                        pdf_bytes = await fetch_url_bytes(pdf_url)
                        pdf_text = _extract_text_from_pdf(pdf_bytes)
                        if pdf_text.strip():
                            all_text_parts.append(pdf_text)
                            source_urls.append(pdf_url)
                    except Exception as e:
                        log_fn(f"PDF download failed: {e}")

        except Exception as e:
            log_fn(f"Failed to fetch {url}: {e}")

    combined_text = "\n\n---\n\n".join(all_text_parts)

    if not combined_text.strip():
        log_fn("No menu text found on any pages")
        return ParsedMenu(raw_text="", source_urls=source_urls)

    log_fn(f"Total menu text: {len(combined_text)} chars. Parsing with OpenAI...")

    # Step 3: Parse with OpenAI
    parsed = await _parse_with_openai(combined_text, log_fn)
    parsed.raw_text = combined_text
    parsed.source_urls = source_urls
    return parsed


def _discover_menu_links(base_url: str, soup: BeautifulSoup) -> list[str]:
    """Find links on a page that are likely to be menu pages."""
    found: list[str] = []
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        resolved = normalize_url(base_url, href)
        if not resolved:
            continue

        parsed = urlparse(resolved)
        # Only follow links on the same domain
        if parsed.netloc.lower() != base_domain:
            continue

        path = parsed.path.lower().rstrip("/")
        link_text = (a.get_text() or "").lower().strip()

        # Check if path matches common menu patterns
        is_menu_path = any(path.endswith(p) or path.endswith(p + "/") for p in MENU_PATH_PATTERNS)
        # Check if link text suggests menu
        is_menu_text = any(kw in link_text for kw in ["menu", "food", "dinner", "lunch", "drinks"])

        if is_menu_path or is_menu_text:
            if resolved not in found and resolved != base_url.rstrip("/"):
                found.append(resolved)

    return found


def _find_pdf_links(base_url: str, soup: BeautifulSoup) -> list[str]:
    """Find PDF links on a page (likely menu PDFs)."""
    pdfs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().endswith(".pdf"):
            resolved = normalize_url(base_url, href)
            if resolved:
                pdfs.append(resolved)
    return pdfs


def _extract_menu_text_from_html(soup: BeautifulSoup) -> str:
    """Extract readable text from HTML, focusing on content likely to be menu items."""
    # Remove script, style, nav, footer, header elements
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    # Try to find a main content area
    main = soup.find("main") or soup.find("article") or soup.find(id=re.compile(r"menu|content", re.I))
    target = main if main else soup.body if soup.body else soup

    lines = []
    for element in target.stripped_strings:
        line = element.strip()
        if line:
            lines.append(line)

    return "\n".join(lines)


def _looks_like_menu(text: str) -> bool:
    """Heuristic: does this text look like it contains menu items?"""
    if len(text) < 50:
        return False
    # Look for price-like patterns ($XX.XX or XX.XX)
    price_pattern = re.compile(r"\$?\d{1,4}\.\d{2}")
    price_matches = price_pattern.findall(text)
    return len(price_matches) >= 3


def _guess_content_type(url: str, data: bytes) -> str:
    """Guess if content is PDF, image, or HTML."""
    if data[:4] == b"%PDF":
        return "pdf"
    path = urlparse(url).path.lower()
    if path.endswith(".pdf"):
        return "pdf"
    if path.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")):
        return "image"
    # Check magic bytes
    if data[:2] in (b"\xff\xd8", b"\x89P"):  # JPEG, PNG
        return "image"
    return "html"


def _extract_text_from_pdf(data: bytes) -> str:
    """Extract text from a PDF using pdfplumber."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages_text = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            return "\n\n".join(pages_text)
    except Exception:
        return ""


def _ocr_image_bytes(data: bytes) -> str:
    """OCR image bytes using Tesseract (if available)."""
    try:
        from PIL import Image
        import pytesseract
        img = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(img)
    except Exception:
        return ""


async def _parse_with_openai(text: str, log_fn) -> ParsedMenu:
    """Use OpenAI to parse menu text into structured categories and items."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        log_fn("OPENAI_API_KEY not set — using regex fallback parser")
        return _fallback_parse(text)

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        prompt = (
            "You are a menu parser. Given the following restaurant menu text, extract all menu items "
            "and organize them into categories. Return valid JSON with this exact structure:\n"
            '{"categories": [{"name": "Category Name", "items": [{"name": "Item Name", '
            '"description": "Description or null", "price": 12.99}]}]}\n\n'
            "Rules:\n"
            "- Group items into their natural categories (Appetizers, Mains, Desserts, etc.)\n"
            "- Price should be a float or null if not found\n"
            "- Description should be the item description or null\n"
            "- If categories aren't clear, use 'Menu Items' as the default category\n"
            "- Return ONLY valid JSON, no markdown formatting\n\n"
            f"Menu text:\n{text[:8000]}"
        )

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        import json
        result = json.loads(response.choices[0].message.content)
        categories = []
        for cat in result.get("categories", []):
            items = []
            for item in cat.get("items", []):
                items.append(ParsedItem(
                    name=item.get("name", "Unknown"),
                    description=item.get("description"),
                    price=item.get("price"),
                ))
            categories.append(ParsedCategory(name=cat.get("name", "Menu Items"), items=items))

        log_fn(f"Parsed {sum(len(c.items) for c in categories)} items in {len(categories)} categories")
        return ParsedMenu(categories=categories)

    except Exception as e:
        log_fn(f"OpenAI parsing failed: {e}, using fallback")
        return _fallback_parse(text)


def _fallback_parse(text: str) -> ParsedMenu:
    """Simple regex-based menu parser as fallback when OpenAI is not available."""
    items = []
    # Pattern: "Item Name ... $XX.XX" or "Item Name XX.XX"
    pattern = re.compile(r"^(.+?)\s+\$?(\d{1,4}\.\d{2})\s*$", re.MULTILINE)
    for match in pattern.finditer(text):
        name = match.group(1).strip().rstrip(".")
        price = float(match.group(2))
        if len(name) > 2 and price > 0:
            items.append(ParsedItem(name=name, price=price))

    if items:
        return ParsedMenu(categories=[ParsedCategory(name="Menu Items", items=items)])
    return ParsedMenu()
