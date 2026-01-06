"""
Menu export functionality - creates portable ZIP archives of menus with all data and images.
"""
import io
import json
import os
import uuid
import zipfile
from datetime import datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from database import get_session
from dependencies import get_current_user
from models import (
    Allergen,
    Category,
    DietaryTag,
    Item,
    ItemPhoto,
    Menu,
    Organization,
)
from permissions import get_org_permissions

router = APIRouter(prefix="/export", tags=["export"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)


# Export Schema Models
class PhotoExport(BaseModel):
    original_url: str
    filename: str  # Relative path in the ZIP


class DietaryTagExport(BaseModel):
    name: str
    icon: Optional[str] = None


class AllergenExport(BaseModel):
    name: str


class ItemExport(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    position: int
    is_sold_out: bool
    dietary_tags: List[DietaryTagExport]  # Full tag objects for portability
    allergens: List[AllergenExport]  # Full allergen objects for portability
    photos: List[PhotoExport]


class CategoryExport(BaseModel):
    name: str
    rank: int
    items: List[ItemExport]


class MenuExportManifest(BaseModel):
    version: str = "1.0"
    exported_at: str
    menu_name: str
    menu_slug: Optional[str] = None
    menu_theme: str
    menu_is_active: bool
    menu_banner_url: Optional[str] = None
    categories: List[CategoryExport]


def _download_image(url: str, timeout: float = 10.0) -> Optional[bytes]:
    """Download image from URL. Returns None if download fails."""
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.content
    except Exception:
        return None


def _generate_image_filename(item_name: str, photo_index: int, url: str) -> str:
    """Generate a safe filename for an image in the ZIP."""
    # Extract extension from URL if possible
    ext = ".jpg"  # Default
    if "." in url.split("/")[-1]:
        ext_part = url.split("/")[-1].split(".")[-1].split("?")[0]
        if ext_part.lower() in ["jpg", "jpeg", "png", "gif", "webp"]:
            ext = f".{ext_part.lower()}"
    
    # Sanitize item name for filename
    safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in item_name)[:50]
    safe_name = safe_name.strip().replace(" ", "_")
    
    return f"{safe_name}_{photo_index}{ext}"


@router.get("/menu/{menu_id}")
def export_menu(
    menu_id: uuid.UUID,
    session: Session = SessionDep,
    user: dict = UserDep
):
    """
    Export a menu as a ZIP file containing:
    - manifest.json: All menu data (categories, items, tags, allergens)
    - images/: All item photos
    """
    # Fetch menu with authorization check
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_view:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Fetch complete menu data with all relationships
    categories = session.exec(
        select(Category)
        .where(Category.menu_id == menu_id)
        .order_by(Category.rank)
        .options(
            selectinload(Category.items)
            .selectinload(Item.dietary_tags),
            selectinload(Category.items)
            .selectinload(Item.allergens),
            selectinload(Category.items)
            .selectinload(Item.photos),
        )
    ).all()
    
    # Build export data structure
    categories_export: List[CategoryExport] = []
    images_to_download: List[tuple[str, str, str]] = []  # (url, zip_path, item_name)
    
    for cat in categories:
        items_export: List[ItemExport] = []
        sorted_items = sorted(cat.items or [], key=lambda x: x.position)
        
        for item in sorted_items:
            photos_export: List[PhotoExport] = []
            
            for idx, photo in enumerate(item.photos or []):
                if photo.url:
                    filename = _generate_image_filename(item.name, idx, photo.url)
                    zip_path = f"images/{filename}"
                    photos_export.append(PhotoExport(
                        original_url=photo.url,
                        filename=zip_path
                    ))
                    images_to_download.append((photo.url, zip_path, item.name))
            
            items_export.append(ItemExport(
                name=item.name,
                description=item.description,
                price=item.price,
                position=item.position,
                is_sold_out=item.is_sold_out,
                dietary_tags=[DietaryTagExport(name=tag.name, icon=tag.icon) for tag in (item.dietary_tags or [])],
                allergens=[AllergenExport(name=allergen.name) for allergen in (item.allergens or [])],
                photos=photos_export
            ))
        
        categories_export.append(CategoryExport(
            name=cat.name,
            rank=cat.rank or 0,
            items=items_export
        ))
    
    # Create manifest
    manifest = MenuExportManifest(
        version="1.0",
        exported_at=datetime.utcnow().isoformat(),
        menu_name=menu.name,
        menu_slug=menu.slug,
        menu_theme=menu.theme or "noir",
        menu_is_active=menu.is_active,
        menu_banner_url=menu.banner_url,
        categories=categories_export
    )
    
    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add manifest
        manifest_json = manifest.model_dump_json(indent=2)
        zf.writestr("manifest.json", manifest_json)
        
        # Download and add images
        for url, zip_path, item_name in images_to_download:
            image_data = _download_image(url)
            if image_data:
                zf.writestr(zip_path, image_data)
            # If download fails, we just skip the image (it's noted in manifest but not included)
    
    zip_buffer.seek(0)
    
    # Generate filename
    safe_menu_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in menu.name)[:30]
    safe_menu_name = safe_menu_name.strip().replace(" ", "_")
    export_date = datetime.utcnow().strftime("%Y%m%d")
    filename = f"menu_{safe_menu_name}_{export_date}.zip"
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
