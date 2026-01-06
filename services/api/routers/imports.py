import io
import json
import os
import uuid
from typing import List, Optional

import boto3
import httpx
import pdfplumber
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlmodel import Session

from database import get_session
from dependencies import get_current_user
from models import Category, Item, Menu, Organization
from permissions import get_org_permissions

router = APIRouter(prefix="/imports", tags=["imports"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)


class ParsedItem(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = None


class ParsedCategory(BaseModel):
    name: str
    items: List[ParsedItem] = Field(default_factory=list)


class ParsedMenu(BaseModel):
    categories: List[ParsedCategory] = Field(default_factory=list)


def _get_menu_or_404(menu_id: uuid.UUID, session: Session, user: dict) -> Menu:
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized")
    return menu


def _ocr_with_tesseract(file: UploadFile) -> str:
    try:
        from PIL import Image
        import pytesseract
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR dependencies missing: {e}")

    content = file.file.read()
    if file.content_type == "application/pdf":
        text_parts: List[str] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
        text = "\n".join(text_parts).strip()
        if not text:
            raise HTTPException(
                status_code=400,
                detail="PDF text not detected. Use OCR_MODE=textract for scanned PDFs."
            )
        return text

    image = Image.open(io.BytesIO(content)).convert("RGB")
    return pytesseract.image_to_string(image)


def _ocr_with_tesseract_bytes(content: bytes, content_type: str) -> str:
    """OCR from raw bytes instead of UploadFile."""
    try:
        from PIL import Image
        import pytesseract
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR dependencies missing: {e}")

    if content_type == "application/pdf":
        text_parts: List[str] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
        text = "\n".join(text_parts).strip()
        return text

    image = Image.open(io.BytesIO(content)).convert("RGB")
    return pytesseract.image_to_string(image)


def _ocr_with_textract(file: UploadFile) -> str:
    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise HTTPException(status_code=500, detail="S3_BUCKET_NAME is required for Textract OCR")
    key = f"imports/{uuid.uuid4()}-{file.filename}"
    s3 = boto3.client("s3")
    textract = boto3.client("textract")
    s3.upload_fileobj(file.file, bucket, key, ExtraArgs={"ContentType": file.content_type})
    response = textract.detect_document_text(
        Document={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    lines = [b["Text"] for b in response.get("Blocks", []) if b.get("BlockType") == "LINE"]
    return "\n".join(lines)


def _parse_menu_text_with_openai(text: str) -> ParsedMenu:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is required")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    system_prompt = (
        "You are a menu parser. Convert raw menu text into JSON with categories and items. "
        "Return strict JSON only with the shape: "
        "{ \"categories\": [ { \"name\": \"Category\", \"items\": [ { \"name\": \"Item\", \"description\": \"...\", \"price\": 0.0 } ] } ] }."
    )
    user_prompt = f"Menu text:\n{text}"
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0,
        response_format={"type": "json_object"}
    )
    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)
    return ParsedMenu.model_validate(data)


def _fetch_url_content(url: str) -> tuple[bytes, str]:
    """Fetch content from URL. Returns (content_bytes, content_type)."""
    try:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            response = client.get(url, headers={
                # Use a realistic browser User-Agent to avoid 406/403 blocks
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            })
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").lower()
            return response.content, content_type
    except httpx.TimeoutException:
        raise HTTPException(status_code=400, detail="URL request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"URL returned error: {e.response.status_code}")


def _extract_text_from_html(html_content: bytes) -> str:
    """Extract readable text from HTML content."""
    soup = BeautifulSoup(html_content, "html.parser")
    # Remove script and style elements
    for element in soup(["script", "style", "nav", "footer", "header"]):
        element.decompose()
    # Get text
    text = soup.get_text(separator="\n")
    # Clean up whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


@router.post("/menu/parse", response_model=ParsedMenu)
def parse_menu_from_file(
    menu_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = SessionDep,
    user: dict = UserDep
):
    _get_menu_or_404(menu_id, session, user)
    ocr_mode = os.getenv("OCR_MODE", "tesseract").lower()
    file.file.seek(0)
    if ocr_mode == "textract":
        text = _ocr_with_textract(file)
    else:
        text = _ocr_with_tesseract(file)
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text detected in file")
    return _parse_menu_text_with_openai(text)


@router.post("/menu/parse-multi", response_model=ParsedMenu)
def parse_menu_from_files(
    menu_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    session: Session = SessionDep,
    user: dict = UserDep
):
    """Parse menu from multiple uploaded files. OCRs each file and combines text for AI parsing."""
    _get_menu_or_404(menu_id, session, user)
    
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    ocr_mode = os.getenv("OCR_MODE", "tesseract").lower()
    all_text_parts: List[str] = []
    
    for file in files:
        file.file.seek(0)
        if ocr_mode == "textract":
            text = _ocr_with_textract(file)
        else:
            text = _ocr_with_tesseract(file)
        if text.strip():
            all_text_parts.append(f"--- File: {file.filename} ---\n{text}")
    
    combined_text = "\n\n".join(all_text_parts)
    if not combined_text.strip():
        raise HTTPException(status_code=400, detail="No text detected in any of the files")
    
    return _parse_menu_text_with_openai(combined_text)


@router.post("/menu/parse-url", response_model=ParsedMenu)
def parse_menu_from_url(
    menu_id: uuid.UUID,
    url: str = Query(..., description="Public URL to fetch menu from"),
    session: Session = SessionDep,
    user: dict = UserDep
):
    """Parse menu from a public URL. Supports images, PDFs, and web pages."""
    _get_menu_or_404(menu_id, session, user)
    
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    
    content, content_type = _fetch_url_content(url)
    
    # Determine content type and process accordingly
    if "image/" in content_type:
        # Image file - OCR it
        text = _ocr_with_tesseract_bytes(content, content_type.split(";")[0])
    elif "application/pdf" in content_type:
        # PDF file - OCR it
        text = _ocr_with_tesseract_bytes(content, "application/pdf")
    elif "text/html" in content_type or "application/xhtml" in content_type:
        # Web page - extract text from HTML
        text = _extract_text_from_html(content)
    else:
        # Try to treat as plain text
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported content type: {content_type}"
            )
    
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text detected from URL")
    
    return _parse_menu_text_with_openai(text)


class ImportRequest(BaseModel):
    categories: List[ParsedCategory]


@router.post("/menu/apply", status_code=201)
def apply_imported_menu(
    menu_id: uuid.UUID,
    payload: ImportRequest,
    session: Session = SessionDep,
    user: dict = UserDep
):
    menu = _get_menu_or_404(menu_id, session, user)
    for cat_index, cat in enumerate(payload.categories):
        category = Category(name=cat.name, menu_id=menu.id, rank=cat_index)
        session.add(category)
        session.flush()
        for item_index, item in enumerate(cat.items):
            if not item.name:
                continue
            price = item.price if item.price is not None else 0.0
            new_item = Item(
                name=item.name,
                description=item.description,
                price=price,
                category_id=category.id,
                position=item_index
            )
            session.add(new_item)
    session.commit()
    return {"ok": True}

