import uuid
import json
import os
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload
from database import get_session
from models import (
    Menu,
    Organization,
    MenuRead,
    MenuUpdate,
    Category,
    Item,
    ItemPhoto,
    ItemDietaryTagLink,
    ItemAllergenLink,
)
from dependencies import get_current_user
from permissions import get_org_permissions
from url_utils import normalize_upload_url

router = APIRouter(prefix="/menus", tags=["menus"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

def _local_uploads_enabled() -> bool:
    import os

    return os.getenv("LOCAL_UPLOADS") == "1"


def _local_upload_dir():
    from pathlib import Path

    return Path(__file__).resolve().parent.parent / "uploads"


def _safe_local_upload_path(key: str):
    from pathlib import Path
    import os

    base = _local_upload_dir().resolve()
    target = (base / key).resolve()
    if not str(target).startswith(str(base) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid upload key")
    return target


def _data_url_from_logo_url(logo_url: str) -> str:
    """
    Convert a logo URL to a data URL so OpenAI can always consume it.

    OpenAI can't fetch `localhost`/private URLs; for local uploads we read from disk.
    """
    import base64
    import mimetypes
    from urllib.parse import urlparse

    parsed = urlparse(logo_url)
    path = parsed.path or ""
    if "/uploads/" in path and _local_uploads_enabled():
        key = path.split("/uploads/", 1)[1].lstrip("/")
        file_path = _safe_local_upload_path(key)
        if not file_path.exists():
            raise HTTPException(status_code=400, detail="Logo file not found on server")
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(str(file_path))[0] or "image/png"
        encoded = base64.b64encode(content).decode("ascii")
        return f"data:{content_type};base64,{encoded}"

    # For remote URLs, try to fetch and inline (handles localhost/private URLs too if reachable).
    try:
        import httpx

        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            res = client.get(logo_url)
            res.raise_for_status()
            content_type = res.headers.get("content-type") or "image/png"
            encoded = base64.b64encode(res.content).decode("ascii")
            return f"data:{content_type};base64,{encoded}"
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Logo URL is not reachable by the server; re-upload the logo and try again."
        )

@router.post("/", response_model=Menu)
def create_menu(menu: Menu, session: Session = SessionDep, user: dict = UserDep):
    org = session.get(Organization, menu.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized for this organization")

    # If slug is provided, check uniqueness globally for now.
    if menu.slug:
        existing = session.exec(select(Menu).where(Menu.slug == menu.slug)).first()
        if existing:
            # simple slug check, might want to scope by org eventually
            raise HTTPException(status_code=400, detail="Menu slug already taken")
    else:
        # Auto-generate internal slug
        menu.slug = str(uuid.uuid4())[:8]

    session.add(menu)
    session.commit()
    session.refresh(menu)
    return menu


class GenerateTitleDesignRequest(BaseModel):
    hint: Optional[str] = None


@router.post("/generate-title-design/{menu_id}")
def generate_title_design(
    menu_id: uuid.UUID,
    request_body: GenerateTitleDesignRequest | None = None,
    session: Session = SessionDep,
    user: dict = UserDep
):
    """
    Generate AI-powered title area design based on restaurant logo.
    Uses OpenAI Vision API to analyze the logo and create theme-agnostic design configuration.
    """
    from openai import OpenAI
    
    # Get menu and verify permissions
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Verify logo exists
    if not menu.logo_url:
        raise HTTPException(
            status_code=400,
            detail="Logo must be uploaded before generating title design"
        )
    
    try:
        # Initialize OpenAI client
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        logo_data_url = _data_url_from_logo_url(menu.logo_url)
        
        requirements = [
            "- The design must be theme-agnostic (work on any background color)",
            "- No additional graphics should be needed",
            "- Logo should be the only visual element",
            "- Design should be clean and minimal",
            "- Must work responsively on mobile and desktop",
        ]
        if request_body and request_body.hint:
            requirements.append(f"- User preference: {request_body.hint}")

        prompt = "\n".join(
            [
                "Analyze this restaurant logo and generate a title area design configuration.",
                "",
                "Your task:",
                "1. Extract the dominant colors from the logo (provide as hex codes)",
                "2. Determine optimal logo placement (left, center, or right)",
                "3. Suggest logo scale (0.5 to 2.0, where 1.0 is original size)",
                "4. Recommend spacing values in pixels",
                "5. Determine if text should appear beside or below the logo",
                "6. Create a design that works across light AND dark themes",
                "",
                "CRITICAL REQUIREMENTS:",
                *requirements,
                "",
                "Output ONLY valid JSON in this exact format:",
                "{",
                '  "logoPosition": "left" | "center" | "right",',
                '  "logoScale": 1.0,',
                '  "spacing": {',
                '    "top": 32,',
                '    "bottom": 24,',
                '    "horizontal": 16',
                "  },",
                '  "layout": "logo-only" | "logo-with-text",',
                '  "textPosition": "beside" | "below" | "none",',
                '  "dominantColors": ["#hex1", "#hex2"],',
                '  "recommendation": "Brief explanation of the design choices"',
                "}",
            ]
        )
        
        # Call OpenAI Vision API
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": logo_data_url}
                        }
                    ]
                }
            ],
            max_tokens=500,
            temperature=0.3  # Lower temperature for more consistent output
        )
        
        # Parse AI response
        ai_response = response.choices[0].message.content
        
        # Extract JSON from response (AI might wrap it in markdown)
        if "```json" in ai_response:
            ai_response = ai_response.split("```json")[1].split("```")[0].strip()
        elif "```" in ai_response:
            ai_response = ai_response.split("```")[1].split("```")[0].strip()
        
        
        design_config = json.loads(ai_response)
        
        # Add metadata
        design_config["enabled"] = True
        design_config["generatedAt"] = datetime.utcnow().isoformat()
        design_config["logoUrl"] = menu.logo_url
        
        # Save to database
        menu.title_design_config = design_config
        session.add(menu)
        session.commit()
        session.refresh(menu)
        
        return {
            "success": True,
            "config": design_config,
            "message": "Title design generated successfully"
        }
        
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate title design: {str(e)}"
        )

@router.get("/", response_model=List[Menu])
def list_menus(org_id: uuid.UUID, request: Request, session: Session = SessionDep, user: dict = UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, org_id, user)
    if not perms.can_view:
        raise HTTPException(status_code=403, detail="Not authorized")

    menus = session.exec(select(Menu).where(Menu.org_id == org_id)).all()
    for menu in menus:
        menu.banner_url = normalize_upload_url(menu.banner_url, request)
        menu.logo_url = normalize_upload_url(menu.logo_url, request)
    return menus

@router.get("/{menu_id}", response_model=Menu)
def get_menu(menu_id: uuid.UUID, request: Request, session: Session = SessionDep):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)
    return menu

@router.patch("/{menu_id}", response_model=Menu)
def update_menu(menu_id: uuid.UUID, menu_update: MenuUpdate, session: Session = SessionDep, user: dict = UserDep):
    db_menu = session.get(Menu, menu_id)
    if not db_menu:
        raise HTTPException(status_code=404, detail="Menu not found")
        
    # Owner check
    org = session.get(Organization, db_menu.org_id)
    perms = get_org_permissions(session, db_menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized")

    menu_data = menu_update.model_dump(exclude_unset=True)
    for key, value in menu_data.items():
        setattr(db_menu, key, value)

    session.add(db_menu)
    session.commit()
    session.refresh(db_menu)
    return db_menu

@router.delete("/{menu_id}")
def delete_menu(menu_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    db_menu = session.get(Menu, menu_id)
    if not db_menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Owner check
    org = session.get(Organization, db_menu.org_id)
    perms = get_org_permissions(session, db_menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized")

    categories = session.exec(select(Category.id).where(Category.menu_id == menu_id)).all()
    category_ids = [row[0] if isinstance(row, tuple) else row for row in categories]
    if category_ids:
        item_ids = session.exec(select(Item.id).where(Item.category_id.in_(category_ids))).all()
        item_ids = [row[0] if isinstance(row, tuple) else row for row in item_ids]
        if item_ids:
            session.exec(delete(ItemPhoto).where(ItemPhoto.item_id.in_(item_ids)))
            session.exec(delete(ItemDietaryTagLink).where(ItemDietaryTagLink.item_id.in_(item_ids)))
            session.exec(delete(ItemAllergenLink).where(ItemAllergenLink.item_id.in_(item_ids)))
            session.exec(delete(Item).where(Item.id.in_(item_ids)))
        session.exec(delete(Category).where(Category.id.in_(category_ids)))

    session.delete(db_menu)
    session.commit()
    return {"ok": True}

@router.get("/public/{menu_id}", response_model=MenuRead)
def get_public_menu(menu_id: uuid.UUID, request: Request, session: Session = SessionDep):
    # Fetch by ID now
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Check Active
    if not menu.is_active:
        raise HTTPException(status_code=404, detail="Menu is not active")

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
    for cat in categories:
        cat.items = sorted(cat.items or [], key=lambda item: item.position)
        for item in cat.items or []:
            for photo in item.photos or []:
                photo.url = normalize_upload_url(photo.url, request)
    menu.categories = categories
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)

    # Validate explicitly so nested tag/allergen IDs are included consistently.
    return MenuRead.model_validate(menu)
