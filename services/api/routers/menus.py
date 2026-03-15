import uuid
import json
import os
import io
from datetime import datetime
from typing import List, NamedTuple, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Request, Query, Response
from pydantic import BaseModel
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload
from PIL import Image
from zoneinfo import ZoneInfo
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
    ItemOptionGroup,
    ItemOption,
    VisibilityRule,
)
from dependencies import get_current_user
from permissions import get_org_permissions
from storage_keys import menu_qr_current_key, menu_qr_version_key
from storage_utils import store_bytes
from url_utils import append_version_query, normalize_upload_url, forwarded_prefix

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


def _normalize_origin(origin_like: Optional[str]) -> Optional[str]:
    if not origin_like:
        return None

    candidate = origin_like.strip()
    if not candidate:
        return None

    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None

    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _public_web_origin(request: Request) -> str:
    """
    Resolve the public web app origin used in QR links.

    Priority:
    1) Explicit environment vars (recommended in production)
    2) Configured `CORS_ORIGINS`
    3) Browser `Origin` / `Referer` headers
    4) Forwarded host/proto from reverse proxy
    """
    for env_key in (
        "PUBLIC_WEB_BASE_URL",
        "WEB_APP_BASE_URL",
        "APP_BASE_URL",
        "NEXT_PUBLIC_APP_URL",
        "NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN",
    ):
        explicit = _normalize_origin(os.getenv(env_key))
        if explicit:
            return explicit

    cors_origins = os.getenv("CORS_ORIGINS", "")
    local_cors_fallback: Optional[str] = None
    for entry in cors_origins.split(","):
        normalized = _normalize_origin(entry)
        if not normalized:
            continue
        host = (urlparse(normalized).hostname or "").lower()
        if host in {"localhost", "127.0.0.1"}:
            if not local_cors_fallback:
                local_cors_fallback = normalized
            continue
        return normalized
    if local_cors_fallback:
        return local_cors_fallback

    request_origin = _normalize_origin(request.headers.get("origin"))
    if request_origin:
        return request_origin

    request_referer = _normalize_origin(request.headers.get("referer"))
    if request_referer:
        return request_referer

    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    )
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    fallback = _normalize_origin(f"{proto}://{host}")
    if fallback:
        return fallback

    raise HTTPException(status_code=500, detail="Unable to resolve public web origin")


def _resolve_menu_timezone(menu: Menu) -> ZoneInfo:
    timezone_name = (menu.timezone or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        return ZoneInfo("UTC")


def _visibility_rule_matches(rule: VisibilityRule, now_local: datetime) -> bool:
    if not rule.is_active:
        return False
    days = rule.days_of_week or []
    if days and now_local.weekday() not in days:
        return False
    if rule.start_date and now_local.date() < rule.start_date:
        return False
    if rule.end_date and now_local.date() > rule.end_date:
        return False

    start_time = rule.start_time_local
    end_time = rule.end_time_local
    current_time = now_local.time()
    if start_time <= end_time:
        return start_time <= current_time < end_time
    return current_time >= start_time or current_time < end_time


def _is_visible_with_rules(rules: List[VisibilityRule], now_local: datetime) -> bool:
    if not rules:
        return True

    exclude_rules = [rule for rule in rules if rule.kind == "exclude" and rule.is_active]
    if any(_visibility_rule_matches(rule, now_local) for rule in exclude_rules):
        return False

    include_rules = [rule for rule in rules if rule.kind == "include" and rule.is_active]
    if not include_rules:
        return True
    return any(_visibility_rule_matches(rule, now_local) for rule in include_rules)


def _fetch_qr_png(public_url: str, size_px: int = 1000) -> bytes:
    from urllib.parse import quote
    import httpx

    qr_size = max(256, min(1000, int(size_px)))
    qr_url = (
        "https://api.qrserver.com/v1/create-qr-code/"
        f"?size={qr_size}x{qr_size}&margin=0&ecc=H&format=png&data={quote(public_url, safe='')}"
    )
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        res = client.get(qr_url)
        res.raise_for_status()
        return res.content


def _trim_qr_whitespace(qr_img: Image.Image) -> Image.Image:
    """
    Remove outer white padding to keep the exported QR tightly framed.
    """
    grayscale = qr_img.convert("L")
    mask = grayscale.point(lambda px: 255 if px < 245 else 0)
    bounds = mask.getbbox()
    if not bounds:
        return qr_img
    return qr_img.crop(bounds)


def _png_to_pdf_bytes(png_bytes: bytes) -> bytes:
    png_image = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    output = io.BytesIO()
    # 300 DPI metadata helps print workflows while keeping file size moderate.
    png_image.save(output, format="PDF", resolution=300.0)
    return output.getvalue()


def _render_standard_qr_png(public_url: str, size_px: int = 1000) -> bytes:
    qr_img = Image.open(io.BytesIO(_fetch_qr_png(public_url, size_px=size_px))).convert("RGB")
    trimmed = _trim_qr_whitespace(qr_img)
    output = io.BytesIO()
    trimmed.save(output, format="PNG", optimize=True)
    return output.getvalue()


class _StoredQrAssets(NamedTuple):
    version_url: str
    current_url: str


def _store_generated_qr(
    menu: Menu,
    png_bytes: bytes,
    request: Request,
    *,
    size_px: int = 1000,
) -> _StoredQrAssets:
    render_id = uuid.uuid4()
    base_url = forwarded_prefix(request) or None
    version_key = menu_qr_version_key(menu.org_id, menu.id, render_id, size_px=size_px)
    current_key = menu_qr_current_key(menu.org_id, menu.id, size_px=size_px)

    version_url = store_bytes(
        data=png_bytes,
        key=version_key,
        content_type="image/png",
        base_url=base_url,
        cache_control="public, max-age=31536000, immutable",
    )
    current_url = store_bytes(
        data=png_bytes,
        key=current_key,
        content_type="image/png",
        base_url=base_url,
        cache_control="no-store",
    )
    return _StoredQrAssets(version_url=version_url, current_url=current_url)

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


class RegenerateMenuQrResponse(BaseModel):
    qr_url: str
    current_qr_url: str
    generated_at: datetime


def _regenerate_plain_menu_qr(
    menu: Menu,
    request: Request,
    session: Session,
    *,
    size_px: int = 1000,
) -> RegenerateMenuQrResponse:
    public_url = f"{_public_web_origin(request)}/r/{menu.id}"
    qr_png = _render_standard_qr_png(public_url, size_px=size_px)
    stored_assets = _store_generated_qr(menu, qr_png, request, size_px=size_px)
    generated_at = datetime.utcnow()

    menu.qr_url = stored_assets.version_url
    menu.qr_generated_at = generated_at
    session.add(menu)
    session.commit()
    session.refresh(menu)

    normalized_qr_url = normalize_upload_url(menu.qr_url, request) or stored_assets.version_url
    normalized_current_qr_url = (
        normalize_upload_url(stored_assets.current_url, request) or stored_assets.current_url
    )
    return RegenerateMenuQrResponse(
        qr_url=normalized_qr_url,
        current_qr_url=normalized_current_qr_url,
        generated_at=generated_at,
    )


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


@router.post("/{menu_id}/regenerate-qr", response_model=RegenerateMenuQrResponse)
def regenerate_menu_qr(
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

    try:
        return _regenerate_plain_menu_qr(menu, request, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to regenerate QR code: {str(e)}",
        )

@router.get("/{menu_id}/qr")
def get_menu_qr_asset(
    menu_id: uuid.UUID,
    request: Request,
    fmt: str = Query(default="png", alias="format", description="png or pdf"),
    size: int = Query(default=1000, ge=256, le=1000, description="PNG render size in px"),
    session: Session = SessionDep,
):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    format_key = fmt.strip().lower()
    if format_key not in {"png", "pdf"}:
        raise HTTPException(status_code=400, detail="Invalid format")

    public_url = f"{_public_web_origin(request)}/r/{menu.id}"
    png_bytes = _render_standard_qr_png(public_url, size_px=size)

    safe_name = (menu.name or "menu").strip().replace("/", "-")
    if format_key == "pdf":
        pdf_bytes = _png_to_pdf_bytes(png_bytes)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}-qr.pdf"',
                "Cache-Control": "no-store",
            },
        )

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}-qr.png"',
            "Cache-Control": "no-store",
        },
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
        menu.qr_url = normalize_upload_url(menu.qr_url, request)
    return menus

@router.get("/{menu_id}", response_model=Menu)
def get_menu(menu_id: uuid.UUID, request: Request, session: Session = SessionDep):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)
    menu.qr_url = normalize_upload_url(menu.qr_url, request)
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
    if "timezone" in menu_data:
        timezone_name = (menu_data.get("timezone") or "").strip()
        if not timezone_name:
            raise HTTPException(status_code=400, detail="timezone cannot be empty")
        try:
            ZoneInfo(timezone_name)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid timezone")
        menu_data["timezone"] = timezone_name
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
            option_group_ids = session.exec(
                select(ItemOptionGroup.id).where(ItemOptionGroup.item_id.in_(item_ids))
            ).all()
            option_group_ids = [row[0] if isinstance(row, tuple) else row for row in option_group_ids]
            option_ids: list[uuid.UUID] = []
            if option_group_ids:
                option_ids = session.exec(
                    select(ItemOption.id).where(ItemOption.group_id.in_(option_group_ids))
                ).all()
                option_ids = [row[0] if isinstance(row, tuple) else row for row in option_ids]

            session.exec(delete(ItemPhoto).where(ItemPhoto.item_id.in_(item_ids)))
            session.exec(delete(ItemDietaryTagLink).where(ItemDietaryTagLink.item_id.in_(item_ids)))
            session.exec(delete(ItemAllergenLink).where(ItemAllergenLink.item_id.in_(item_ids)))
            session.exec(delete(VisibilityRule).where(VisibilityRule.item_id.in_(item_ids)))
            if option_ids:
                session.exec(delete(VisibilityRule).where(VisibilityRule.option_id.in_(option_ids)))
                session.exec(delete(ItemOption).where(ItemOption.id.in_(option_ids)))
            if option_group_ids:
                session.exec(delete(ItemOptionGroup).where(ItemOptionGroup.id.in_(option_group_ids)))
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
            selectinload(Category.items)
            .selectinload(Item.visibility_rules),
            selectinload(Category.items)
            .selectinload(Item.option_groups)
            .selectinload(ItemOptionGroup.options)
            .selectinload(ItemOption.visibility_rules),
        )
    ).all()

    now_local = datetime.now(_resolve_menu_timezone(menu))
    for cat in categories:
        visible_items: list[Item] = []
        for item in sorted(cat.items or [], key=lambda item: item.position):
            if not _is_visible_with_rules(item.visibility_rules or [], now_local):
                continue
            visible_groups: list[ItemOptionGroup] = []
            for group in sorted(item.option_groups or [], key=lambda group: group.position):
                if not group.is_active:
                    continue
                visible_options: list[ItemOption] = []
                for option in sorted(group.options or [], key=lambda option: option.position):
                    if not option.is_active:
                        continue
                    if not _is_visible_with_rules(option.visibility_rules or [], now_local):
                        continue
                    option.image_url = normalize_upload_url(option.image_url, request)
                    option.visibility_rules = []
                    visible_options.append(option)
                if not visible_options:
                    continue
                visible_count = len(visible_options)
                group.options = visible_options
                if group.max_select is not None:
                    group.max_select = min(group.max_select, visible_count)
                group.min_select = min(group.min_select, visible_count)
                visible_groups.append(group)
            item.option_groups = visible_groups
            item.visibility_rules = []
            version = (
                str(int(item.ar_updated_at.timestamp()))
                if item.ar_updated_at and item.ar_status in {"processing", "ready", "failed"}
                else None
            )

            def _versioned_ar_url(url: Optional[str]) -> Optional[str]:
                normalized = normalize_upload_url(url, request)
                if normalized and "/ar/current/" in normalized:
                    return append_version_query(normalized, version)
                return normalized

            for photo in item.photos or []:
                photo.url = normalize_upload_url(photo.url, request)
            item.ar_video_url = normalize_upload_url(item.ar_video_url, request)
            item.ar_model_glb_url = _versioned_ar_url(item.ar_model_glb_url)
            item.ar_model_usdz_url = _versioned_ar_url(item.ar_model_usdz_url)
            item.ar_model_poster_url = _versioned_ar_url(item.ar_model_poster_url)
            visible_items.append(item)
        cat.items = visible_items
    menu.categories = categories
    menu.banner_url = normalize_upload_url(menu.banner_url, request)
    menu.logo_url = normalize_upload_url(menu.logo_url, request)
    menu.qr_url = normalize_upload_url(menu.qr_url, request)

    # Validate explicitly so nested tag/allergen IDs are included consistently.
    return MenuRead.model_validate(menu)
