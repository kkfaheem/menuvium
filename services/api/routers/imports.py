import io
import json
import os
import uuid
from typing import List, Optional

import boto3
import httpx
import pdfplumber
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlmodel import Session

from database import get_session
from dependencies import get_current_user
from models import Category, Item, Menu, Organization
from permissions import get_org_permissions
from url_utils import forwarded_prefix

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


# ================== Menuvium ZIP Import ==================

import zipfile
import boto3
from pathlib import Path
from models import DietaryTag, Allergen, ItemPhoto


def _select_manifest_path(zf: zipfile.ZipFile) -> tuple[str, str]:
    """
    Find manifest.json in the ZIP, supporting archives that wrap files in a top-level folder.

    Returns (manifest_path, base_prefix). base_prefix is "" or like "demo_menu/".
    """
    names = [name for name in zf.namelist() if name and name.endswith("manifest.json")]

    def is_valid(candidate: str) -> bool:
        if candidate.endswith("/"):
            return False
        if "/__MACOSX/" in candidate or candidate.startswith("__MACOSX/"):
            return False
        basename = candidate.rsplit("/", 1)[-1]
        return basename == "manifest.json"

    candidates = [name for name in names if is_valid(name)]
    if not candidates:
        raise HTTPException(status_code=400, detail="ZIP archive missing manifest.json")

    if "manifest.json" in candidates:
        manifest_path = "manifest.json"
    else:
        # Prefer the shallowest path (fewest folders), then shortest string.
        candidates.sort(key=lambda p: (p.count("/"), len(p)))
        manifest_path = candidates[0]

    base_prefix = ""
    if "/" in manifest_path:
        base_prefix = manifest_path.rsplit("/", 1)[0].rstrip("/") + "/"
    return manifest_path, base_prefix


def _resolve_zip_member(zip_files: set[str], base_prefix: str, path: str) -> str | None:
    if not path:
        return None
    cleaned = path.lstrip("./").lstrip("/")
    direct = cleaned if cleaned in zip_files else path if path in zip_files else None
    if direct:
        return direct
    if base_prefix:
        prefixed = f"{base_prefix}{cleaned}"
        if prefixed in zip_files:
            return prefixed
    return None


def _get_or_create_dietary_tag(session: Session, name: str, icon: str = None) -> DietaryTag:
    """Get existing dietary tag by name or create a new one with optional icon."""
    from sqlmodel import select
    name = name.strip()
    existing = session.exec(select(DietaryTag).where(DietaryTag.name == name)).first()
    if existing:
        # Update icon if provided and different
        if icon is not None and existing.icon != icon:
            existing.icon = icon
            session.add(existing)
            session.flush()
        return existing
    tag = DietaryTag(name=name, icon=icon)
    session.add(tag)
    session.flush()
    return tag


def _get_or_create_allergen(session: Session, name: str) -> Allergen:
    """Get existing allergen by name or create a new one."""
    from sqlmodel import select
    name = name.strip()
    existing = session.exec(select(Allergen).where(Allergen.name == name)).first()
    if existing:
        return existing
    allergen = Allergen(name=name)
    session.add(allergen)
    session.flush()
    return allergen


def _local_uploads_enabled() -> bool:
    return os.getenv("LOCAL_UPLOADS") == "1"


def _local_upload_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "uploads"


def _upload_image_to_storage(
    image_data: bytes,
    filename: str,
    content_type: str = "image/jpeg",
    public_prefix: str = ""
) -> tuple[str, str]:
    """
    Upload image to S3 or local storage.
    Returns (s3_key, public_url).
    """
    key = f"items/{uuid.uuid4()}-{filename}"
    
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if bucket_name:
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=image_data,
            ContentType=content_type
        )
        public_url = f"https://{bucket_name}.s3.amazonaws.com/{key}"
        return key, public_url
    elif _local_uploads_enabled():
        upload_dir = _local_upload_dir()
        target = upload_dir / key
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as f:
            f.write(image_data)
        prefix = public_prefix.rstrip("/")
        public_url = f"{prefix}/uploads/{key}" if prefix else f"/uploads/{key}"
        return key, public_url
    else:
        raise HTTPException(status_code=500, detail="No storage configured for uploads")


class ZipImportResult(BaseModel):
    categories_created: int
    items_created: int
    photos_imported: int
    tags_created: int
    allergens_created: int


@router.post("/menu/from-zip", response_model=ZipImportResult, status_code=201)
def import_menu_from_zip(
    menu_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    session: Session = SessionDep,
    user: dict = UserDep
):
    """
    Import menu data from a Menuvium export ZIP file.
    
    The ZIP must contain:
    - manifest.json: Menu structure and metadata
    - images/: Folder with item photos (optional)
    
    Missing dietary tags and allergens will be auto-created.
    """
    menu = _get_menu_or_404(menu_id, session, user)
    public_prefix = forwarded_prefix(request)
    
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")
    
    # Read ZIP file
    try:
        file_content = file.file.read()
        zip_buffer = io.BytesIO(file_content)
        zf = zipfile.ZipFile(zip_buffer, "r")
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read ZIP file: {str(e)}")
    
    # Extract and validate manifest
    try:
        manifest_path, base_prefix = _select_manifest_path(zf)
        manifest_data = zf.read(manifest_path)
        manifest = json.loads(manifest_data.decode("utf-8"))
    except KeyError:
        raise HTTPException(status_code=400, detail="ZIP archive missing manifest.json")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid manifest.json format")
    
    # Validate manifest version
    version = manifest.get("version", "1.0")
    if not version.startswith("1."):
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported manifest version: {version}. Expected 1.x"
        )
    
    # Apply manifest metadata to menu
    menu_name = manifest.get("menu_name")
    if menu_name:
        menu.name = menu_name
    menu_slug = manifest.get("menu_slug")
    if menu_slug:
        menu.slug = menu_slug
    menu_theme = manifest.get("menu_theme")
    if menu_theme:
        menu.theme = menu_theme
    
    # Get list of files in ZIP for image lookup (needed for banner/logo import)
    zip_files = set(zf.namelist())
    
    # Import banner image if present in ZIP
    banner_filename = manifest.get("menu_banner_filename")
    resolved_banner = _resolve_zip_member(zip_files, base_prefix, banner_filename) if banner_filename else None
    if resolved_banner:
        try:
            image_data = zf.read(resolved_banner)
            ext = resolved_banner.split(".")[-1].lower() if "." in resolved_banner else "jpg"
            content_type_map = {
                "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "gif": "image/gif", "webp": "image/webp"
            }
            content_type = content_type_map.get(ext, "image/jpeg")
            s3_key, public_url = _upload_image_to_storage(
                image_data, f"banner_{uuid.uuid4()}.{ext}", content_type, public_prefix
            )
            menu.banner_url = public_url
        except Exception as e:
            print(f"Warning: Failed to import banner: {e}")
    
    # Import logo image if present in ZIP
    logo_filename = manifest.get("menu_logo_filename")
    resolved_logo = _resolve_zip_member(zip_files, base_prefix, logo_filename) if logo_filename else None
    if resolved_logo:
        try:
            image_data = zf.read(resolved_logo)
            ext = resolved_logo.split(".")[-1].lower() if "." in resolved_logo else "jpg"
            content_type_map = {
                "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "gif": "image/gif", "webp": "image/webp"
            }
            content_type = content_type_map.get(ext, "image/jpeg")
            s3_key, public_url = _upload_image_to_storage(
                image_data, f"logo_{uuid.uuid4()}.{ext}", content_type, public_prefix
            )
            menu.logo_url = public_url
        except Exception as e:
            print(f"Warning: Failed to import logo: {e}")
    
    session.add(menu)
    session.flush()
    
    # Track statistics
    categories_created = 0
    items_created = 0
    photos_imported = 0
    tags_created_set = set()
    allergens_created_set = set()
    
    # Process categories
    categories_data = manifest.get("categories", [])
    for cat_data in categories_data:
        cat_name = cat_data.get("name", "Untitled Category")
        cat_rank = cat_data.get("rank", categories_created)
        
        category = Category(name=cat_name, menu_id=menu.id, rank=cat_rank)
        session.add(category)
        session.flush()
        categories_created += 1
        
        # Process items in category
        items_data = cat_data.get("items", [])
        for item_index, item_data in enumerate(items_data):
            item_name = item_data.get("name")
            if not item_name:
                continue
            
            # Create item
            new_item = Item(
                name=item_name,
                description=item_data.get("description"),
                price=item_data.get("price", 0.0),
                position=item_data.get("position", item_index),
                is_sold_out=item_data.get("is_sold_out", False),
                category_id=category.id
            )
            session.add(new_item)
            session.flush()
            items_created += 1
            
            # Link dietary tags (get-or-create)
            # Supports both object format {name, icon} and legacy string format
            dietary_tags = item_data.get("dietary_tags", [])
            for tag_data in dietary_tags:
                if isinstance(tag_data, dict):
                    tag_name = tag_data.get("name")
                    tag_icon = tag_data.get("icon")
                elif isinstance(tag_data, str):
                    tag_name = tag_data
                    tag_icon = None
                else:
                    continue
                
                if tag_name:
                    tag = _get_or_create_dietary_tag(session, tag_name, tag_icon)
                    if tag not in new_item.dietary_tags:
                        new_item.dietary_tags.append(tag)
                    tags_created_set.add(tag_name)
            
            # Link allergens (get-or-create)
            # Supports both object format {name} and legacy string format
            allergens = item_data.get("allergens", [])
            for allergen_data in allergens:
                if isinstance(allergen_data, dict):
                    allergen_name = allergen_data.get("name")
                elif isinstance(allergen_data, str):
                    allergen_name = allergen_data
                else:
                    continue
                
                if allergen_name:
                    allergen = _get_or_create_allergen(session, allergen_name)
                    if allergen not in new_item.allergens:
                        new_item.allergens.append(allergen)
                    allergens_created_set.add(allergen_name)
            
            # Process photos
            photos_data = item_data.get("photos", [])
            for photo_data in photos_data:
                zip_path = photo_data.get("filename")
                resolved_photo = _resolve_zip_member(zip_files, base_prefix, zip_path) if zip_path else None
                if not resolved_photo:
                    continue
                
                try:
                    image_data = zf.read(resolved_photo)
                    # Extract just the filename for upload
                    image_filename = resolved_photo.split("/")[-1]
                    
                    # Determine content type from extension
                    ext = image_filename.split(".")[-1].lower() if "." in image_filename else "jpg"
                    content_type_map = {
                        "jpg": "image/jpeg",
                        "jpeg": "image/jpeg",
                        "png": "image/png",
                        "gif": "image/gif",
                        "webp": "image/webp"
                    }
                    content_type = content_type_map.get(ext, "image/jpeg")
                    
                    # Upload to storage
                    s3_key, public_url = _upload_image_to_storage(
                        image_data, image_filename, content_type, public_prefix
                    )
                    
                    # Create photo record
                    photo = ItemPhoto(
                        s3_key=s3_key,
                        url=public_url,
                        item_id=new_item.id
                    )
                    session.add(photo)
                    photos_imported += 1
                except Exception as e:
                    # Log but continue - missing images shouldn't fail the import
                    print(f"Warning: Failed to import photo {zip_path}: {e}")
                    continue
    
    session.commit()
    zf.close()
    
    return ZipImportResult(
        categories_created=categories_created,
        items_created=items_created,
        photos_imported=photos_imported,
        tags_created=len(tags_created_set),
        allergens_created=len(allergens_created_set)
    )


class ManifestPreview(BaseModel):
    version: str
    menu_name: str
    categories_count: int
    items_count: int
    has_images: bool


@router.post("/menu/preview-zip", response_model=ManifestPreview)
def preview_zip_manifest(
    file: UploadFile = File(...),
    user: dict = UserDep
):
    """
    Preview the contents of a Menuvium export ZIP without importing.
    Useful for showing user what will be imported.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")
    
    try:
        file_content = file.file.read()
        zip_buffer = io.BytesIO(file_content)
        zf = zipfile.ZipFile(zip_buffer, "r")
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read ZIP file: {str(e)}")
    
    try:
        manifest_path, base_prefix = _select_manifest_path(zf)
        manifest_data = zf.read(manifest_path)
        manifest = json.loads(manifest_data.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid manifest.json format")
    
    # Count items
    categories = manifest.get("categories", [])
    items_count = sum(len(cat.get("items", [])) for cat in categories)
    
    # Check for images folder
    prefix_images = f"{base_prefix}images/" if base_prefix else "images/"
    has_images = any(name.startswith(prefix_images) for name in zf.namelist())
    
    zf.close()
    
    return ManifestPreview(
        version=manifest.get("version", "unknown"),
        menu_name=manifest.get("menu_name", "Unknown Menu"),
        categories_count=len(categories),
        items_count=items_count,
        has_images=has_images
    )
