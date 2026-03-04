import uuid
import json
import os
import io
import base64
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload
import boto3
from PIL import Image, ImageOps, ImageDraw
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
from url_utils import normalize_upload_url, forwarded_prefix

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


def _external_origin(request: Request) -> str:
    """
    Resolve externally reachable origin without forwarded prefix.
    """
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{proto}://{host}".rstrip("/")


def _decode_data_url(data_url: str) -> tuple[bytes, str]:
    if "," not in data_url:
        raise HTTPException(status_code=400, detail="Invalid logo data URL")
    meta, payload = data_url.split(",", 1)
    content_type = "image/png"
    if meta.startswith("data:") and ";base64" in meta:
        content_type = meta[5:].split(";", 1)[0] or content_type
    try:
        return base64.b64decode(payload), content_type
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid logo image payload")


def _rgb_from_hex(hex_color: str, default: tuple[int, int, int] = (17, 24, 39)) -> tuple[int, int, int]:
    clean = (hex_color or "").strip().lstrip("#")
    if len(clean) != 6:
        return default
    try:
        return tuple(int(clean[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except Exception:
        return default


def _analyze_logo_qr_style(logo_data_url: str) -> dict:
    """
    Ask OpenAI for brand-aware sizing/color hints for the centered logo block.
    """
    defaults = {
        "logo_scale": 0.2,
        "frame_color": "#111827",
        "ai_used": False,
    }
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return defaults

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.1,
            max_tokens=180,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "Return strict JSON only.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "You are styling a QR code with this logo in the center. "
                                "Return JSON: {\"logo_scale\": number, \"frame_color\": \"#RRGGBB\"}. "
                                "Constraints: logo_scale must be between 0.16 and 0.26. "
                                "frame_color should be a dark brand-compatible accent that still keeps high contrast."
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": logo_data_url}},
                    ],
                },
            ],
        )
        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)
        logo_scale = float(parsed.get("logo_scale", defaults["logo_scale"]))
        logo_scale = max(0.16, min(0.26, logo_scale))
        frame_color = str(parsed.get("frame_color", defaults["frame_color"]))
        if not frame_color.startswith("#") or len(frame_color) != 7:
            frame_color = defaults["frame_color"]
        return {
            "logo_scale": logo_scale,
            "frame_color": frame_color,
            "ai_used": True,
        }
    except Exception:
        return defaults


def _fetch_qr_png(public_url: str) -> bytes:
    from urllib.parse import quote
    import httpx

    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/"
        f"?size=1024x1024&margin=0&ecc=H&format=png&data={quote(public_url, safe='')}"
    )
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        res = client.get(qr_url)
        res.raise_for_status()
        return res.content


def _compose_logo_qr_png(qr_png: bytes, logo_data_url: str, style: dict) -> bytes:
    logo_bytes, _ = _decode_data_url(logo_data_url)

    qr_img = Image.open(io.BytesIO(qr_png)).convert("RGBA")
    logo_img = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")

    canvas_size = min(qr_img.width, qr_img.height)
    logo_scale = float(style.get("logo_scale", 0.2))
    logo_size = int(canvas_size * logo_scale)
    logo_size = max(int(canvas_size * 0.16), min(int(canvas_size * 0.26), logo_size))

    pad = max(10, int(logo_size * 0.22))
    frame_size = logo_size + (pad * 2)
    corner_radius = max(10, int(frame_size * 0.2))

    frame = Image.new("RGBA", (frame_size, frame_size), (255, 255, 255, 0))
    frame_draw = ImageDraw.Draw(frame)
    frame_draw.rounded_rectangle(
        (0, 0, frame_size - 1, frame_size - 1),
        radius=corner_radius,
        fill=(255, 255, 255, 245),
        outline=(*_rgb_from_hex(str(style.get("frame_color", "#111827"))), 255),
        width=max(2, canvas_size // 220),
    )

    fitted_logo = ImageOps.contain(logo_img, (logo_size, logo_size))
    logo_x = (frame_size - fitted_logo.width) // 2
    logo_y = (frame_size - fitted_logo.height) // 2
    frame.alpha_composite(fitted_logo, (logo_x, logo_y))

    frame_x = (qr_img.width - frame_size) // 2
    frame_y = (qr_img.height - frame_size) // 2
    qr_img.alpha_composite(frame, (frame_x, frame_y))

    output = io.BytesIO()
    qr_img.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def _store_generated_qr(png_bytes: bytes, request: Request, key_prefix: str = "menus/qr") -> str:
    key = f"{key_prefix}/{uuid.uuid4()}-logo-qr.png"
    bucket_name = os.getenv("S3_BUCKET_NAME")

    if bucket_name:
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=png_bytes,
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        return f"https://{bucket_name}.s3.amazonaws.com/{key}"

    if _local_uploads_enabled():
        target = _safe_local_upload_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png_bytes)
        prefix = forwarded_prefix(request)
        return f"{prefix}/uploads/{key}" if prefix else f"/uploads/{key}"

    raise HTTPException(status_code=500, detail="No storage configured for QR generation")

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


class GenerateLogoQrResponse(BaseModel):
    logo_qr_url: str
    ai_used: bool


@router.post("/generate-title-design/{menu_id}")
def generate_title_design(
    menu_id: uuid.UUID,
    request_body: Optional[GenerateTitleDesignRequest] = None,
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


@router.post("/{menu_id}/generate-logo-qr", response_model=GenerateLogoQrResponse)
def generate_logo_qr(
    menu_id: uuid.UUID,
    request: Request,
    session: Session = SessionDep,
    user: dict = UserDep,
):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    perms = get_org_permissions(session, menu.org_id, user)
    if not perms.can_manage_menus:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not menu.logo_url:
        raise HTTPException(status_code=400, detail="Logo must be uploaded first")

    try:
        public_url = f"{_external_origin(request)}/r/{menu.id}"
        logo_data_url = _data_url_from_logo_url(menu.logo_url)
        style = _analyze_logo_qr_style(logo_data_url)
        qr_png = _fetch_qr_png(public_url)
        branded_qr_png = _compose_logo_qr_png(qr_png, logo_data_url, style)
        stored_url = _store_generated_qr(branded_qr_png, request)

        menu.logo_qr_url = stored_url
        menu.logo_qr_generated_at = datetime.utcnow()
        session.add(menu)
        session.commit()
        session.refresh(menu)

        return {
            "logo_qr_url": normalize_upload_url(menu.logo_qr_url, request) or stored_url,
            "ai_used": bool(style.get("ai_used")),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate branded QR code: {str(e)}",
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
        menu.logo_qr_url = normalize_upload_url(menu.logo_qr_url, request)
    return menus

@router.get("/{menu_id}", response_model=Menu)
def get_menu(menu_id: uuid.UUID, request: Request, session: Session = SessionDep):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)
    menu.logo_qr_url = normalize_upload_url(menu.logo_qr_url, request)
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
    previous_logo_url = db_menu.logo_url
    for key, value in menu_data.items():
        setattr(db_menu, key, value)
    if "logo_url" in menu_data and menu_data.get("logo_url") != previous_logo_url:
        # Invalidate branded QR whenever the source logo changes.
        db_menu.logo_qr_url = None
        db_menu.logo_qr_generated_at = None

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
            item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
            item.ar_model_glb_url = normalize_upload_url(item.ar_model_glb_url, request)
            item.ar_model_usdz_url = normalize_upload_url(item.ar_model_usdz_url, request)
            item.ar_model_poster_url = normalize_upload_url(item.ar_model_poster_url, request)
    menu.categories = categories
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)
    menu.logo_qr_url = normalize_upload_url(menu.logo_qr_url, request)

    # Validate explicitly so nested tag/allergen IDs are included consistently.
    return MenuRead.model_validate(menu)
