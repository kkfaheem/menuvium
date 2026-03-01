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
    "/carte", "/speisekarte", "/carta", "/menukaart",
]


async def extract_menu(website_url: str, log_fn=None) -> ParsedMenu:
    """Main entry point: discover menu sources on a website and extract structured data."""
    if log_fn is None:
        log_fn = lambda msg: None

    log_fn(f"Fetching homepage: {website_url}")

    all_text_parts: list[str] = []
    source_urls: list[str] = []
    menu_urls: list[str] = []

    # Step 1: Fetch homepage and discover menu-related links
    try:
        html = await fetch_url_text(website_url)
        soup = BeautifulSoup(html, "html.parser")
        menu_urls = _discover_menu_links(website_url, soup)
        log_fn(f"Discovered {len(menu_urls)} potential menu URL(s)")

        # Always extract homepage text (it may contain menu info)
        # Use copy because _extract_menu_text_from_html mutates the soup
        import copy
        homepage_text = _extract_menu_text_from_html(copy.copy(soup))
        if len(homepage_text.strip()) > 100:
            all_text_parts.append(homepage_text)
            source_urls.append(website_url)
            log_fn(f"Extracted {len(homepage_text)} chars from homepage")
        else:
            log_fn(f"Homepage text too short ({len(homepage_text.strip())} chars), skipping")
    except Exception as e:
        log_fn(f"Failed to fetch homepage: {e}")

    # Step 2: Try common menu URL paths even if not linked from homepage
    parsed_base = urlparse(website_url)
    base_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"
    for path in MENU_PATH_PATTERNS:
        candidate = f"{base_origin}{path}"
        if candidate not in menu_urls and candidate != website_url.rstrip("/"):
            menu_urls.append(candidate)

    # Step 3: Collect text from all menu sources
    for url in menu_urls[:8]:  # Cap at 8 pages
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
                if len(page_text.strip()) > 50:
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

    log_fn(f"Total menu text: {len(combined_text)} chars. Parsing...")

    # Step 4: Parse with OpenAI or fallback
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
    """Extract readable text from HTML, focusing on content likely to be menu items.

    NOTE: This function mutates the soup by decomposing elements.
    Pass a copy if you need to reuse the soup object.
    """
    # Remove script, style, and noscript — these never contain menu content
    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()

    # Only remove nav/header/footer if they are small (< 500 chars)
    # Large nav blocks might actually contain menu content
    for tag in soup.find_all(["nav", "footer", "header"]):
        if len(tag.get_text(strip=True)) < 500:
            tag.decompose()

    # Try to find a main content area
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"menu|content", re.I))
        or soup.find(class_=re.compile(r"menu|content", re.I))
    )
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
    """Robust fallback parser when OpenAI is not available.

    Strategy:
    1. Try to find lines with prices (various formats: $, €, £, commas)
    2. Look for category headers (ALL CAPS or short bold-looking lines)
    3. Extract items even without prices (from list structures)
    """
    categories: list[ParsedCategory] = []
    current_category = "Menu Items"
    current_items: list[ParsedItem] = []

    # Price patterns: $12.99, 12.99, €12,50, £8.00, 12,99€, etc.
    price_re = re.compile(
        r'[\$€£]\s*(\d{1,4}[.,]\d{2})'
        r'|(\d{1,4}[.,]\d{2})\s*[€£]?'
    )

    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if not line or len(line) < 2:
            continue

        # Detect category headers: ALL CAPS, or short lines ending with :
        if (
            (line.isupper() and 3 < len(line) < 50 and not price_re.search(line))
            or (line.endswith(":") and len(line) < 40)
            or (line.startswith("#") and len(line) < 50)
        ):
            # Save previous category
            if current_items:
                categories.append(ParsedCategory(name=current_category, items=current_items))
                current_items = []
            current_category = line.rstrip(":").strip("# ").title()
            continue

        # Try to extract price from the line
        price_match = price_re.search(line)
        if price_match:
            price_str = price_match.group(1) or price_match.group(2)
            try:
                price = float(price_str.replace(",", "."))
            except ValueError:
                price = None
            # Item name is everything before the price
            name = line[:price_match.start()].strip().rstrip(".").rstrip("-").rstrip("…").strip()
            if len(name) > 2 and (price is None or price > 0):
                current_items.append(ParsedItem(name=name, price=price))
        else:
            # No price — could still be a menu item if it's a short-ish line
            if 3 < len(line) < 80 and not any(skip in line.lower() for skip in [
                "copyright", "all rights", "follow us", "contact", "phone",
                "address", "hours", "open", "close", "reserve", "click",
                "http", "www.", "@", "email", "privacy", "terms",
            ]):
                # Looks like it could be an item name or description
                # If previous item exists and line is shorter, treat as description
                if current_items and len(line) < 120 and not current_items[-1].description:
                    current_items[-1].description = line
                elif len(line) < 60:
                    current_items.append(ParsedItem(name=line))

    # Save final category
    if current_items:
        categories.append(ParsedCategory(name=current_category, items=current_items))

    return ParsedMenu(categories=categories)
