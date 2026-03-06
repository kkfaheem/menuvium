from datetime import datetime, timedelta
import hashlib
import os
import secrets
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select, delete
from typing import List, Annotated, Optional
import uuid

from database import get_session
from email_utils import EmailConfigError, send_email
from models import (
    Organization,
    OrganizationUpdate,
    OrganizationMember,
    OrganizationMemberCreate,
    OrganizationMemberRead,
    OrganizationMemberUpdate,
    OrganizationOwnershipTransfer,
    OwnershipTransferRequestCreate,
    OwnershipTransferRequestRead,
    OwnershipTransferVerifyRequest,
    OwnershipTransferVerifyRead,
    OrgPermissionsRead,
    Menu,
    Category,
    Item,
    ItemPhoto,
    ItemDietaryTagLink,
    ItemAllergenLink,
)
from dependencies import get_current_user
from permissions import get_org_permissions

router = APIRouter(prefix="/organizations", tags=["organizations"])

UserDep = Annotated[dict, Depends(get_current_user)]
SessionDep = Annotated[Session, Depends(get_session)]


def _normalize_email(email: Optional[object]) -> Optional[str]:
    if not isinstance(email, str):
        return None
    normalized = email.strip().lower()
    return normalized or None


def _hash_transfer_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


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


def _resolve_public_web_origin(request: Request) -> str:
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
    local_fallback: Optional[str] = None
    for entry in cors_origins.split(","):
        normalized = _normalize_origin(entry)
        if not normalized:
            continue
        host = (urlparse(normalized).hostname or "").lower()
        if host in {"localhost", "127.0.0.1"}:
            if not local_fallback:
                local_fallback = normalized
            continue
        return normalized

    if local_fallback:
        return local_fallback

    request_origin = _normalize_origin(request.headers.get("origin"))
    if request_origin:
        return request_origin

    request_referer = _normalize_origin(request.headers.get("referer"))
    if request_referer:
        return request_referer

    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    fallback = _normalize_origin(f"{proto}://{host}")
    if fallback:
        return fallback

    raise HTTPException(status_code=500, detail="Unable to resolve web application URL")


def _send_ownership_transfer_email(
    *,
    to_email: str,
    company_name: str,
    verify_url: str,
    expires_at: datetime,
) -> None:
    expires_label = expires_at.strftime("%Y-%m-%d %H:%M UTC")
    subject = f"Confirm ownership transfer for {company_name}"
    text_body = (
        f"You were selected as the new owner for {company_name} in Menuvium.\n\n"
        f"To accept ownership, open this link:\n{verify_url}\n\n"
        f"This link expires on {expires_label}.\n"
        "If you were not expecting this, you can ignore this email."
    )
    html_body = (
        f"<p>You were selected as the new owner for <strong>{company_name}</strong> in Menuvium.</p>"
        f"<p><a href=\"{verify_url}\">Confirm ownership transfer</a></p>"
        f"<p>This link expires on <strong>{expires_label}</strong>.</p>"
        "<p>If you were not expecting this, you can ignore this email.</p>"
    )
    send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


@router.post("/", response_model=Organization)
def create_organization(organization: Organization, session: SessionDep, user: UserDep):
    user_id = user["sub"]
    # Check if org already exists for this owner (optional business rule: 1 org per owner for now?)
    # or just allow multiple.
    # Enforce owner_id from token
    organization.owner_id = user_id
    
    # Check slug uniqueness
    existing_org = session.exec(select(Organization).where(Organization.slug == organization.slug)).first()
    if existing_org:
        raise HTTPException(status_code=400, detail="Organization slug already taken")

    session.add(organization)
    session.commit()
    session.refresh(organization)
    return organization

@router.get("/", response_model=List[Organization])
def list_my_organizations(session: SessionDep, user: UserDep):
    user_id = user["sub"]
    email = user.get("email")
    if isinstance(email, str):
        email = email.strip().lower() or None
    owned = session.exec(select(Organization).where(Organization.owner_id == user_id)).all()
    if not email:
        return owned
    member_orgs = session.exec(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.org_id == Organization.id)
        .where(OrganizationMember.email == email)
    ).all()
    merged: dict[uuid.UUID, Organization] = {org.id: org for org in owned}
    for org in member_orgs:
        merged[org.id] = org
    return list(merged.values())


@router.post("/{org_id}/ownership-transfer", response_model=OwnershipTransferRequestRead)
def request_ownership_transfer(
    org_id: uuid.UUID,
    payload: OwnershipTransferRequestCreate,
    request: Request,
    session: SessionDep,
    user: UserDep,
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    requester_sub = user.get("sub")
    if not requester_sub or org.owner_id != requester_sub:
        raise HTTPException(status_code=403, detail="Only the current owner can transfer ownership")

    target_member = session.get(OrganizationMember, payload.member_id)
    if not target_member or target_member.org_id != org_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if target_member.user_id and target_member.user_id == org.owner_id:
        raise HTTPException(status_code=400, detail="This member is already the owner")
    if (target_member.role or "").lower() == "owner":
        raise HTTPException(status_code=400, detail="This member is already the owner")

    target_email = _normalize_email(target_member.email)
    if not target_email:
        raise HTTPException(status_code=400, detail="Selected member does not have a valid email")

    pending_transfers = session.exec(
        select(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.org_id == org_id,
            OrganizationOwnershipTransfer.status == "pending",
        )
    ).all()
    for transfer in pending_transfers:
        transfer.status = "cancelled"
        session.add(transfer)

    raw_token = secrets.token_urlsafe(48)
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=24)

    transfer = OrganizationOwnershipTransfer(
        org_id=org_id,
        requested_by_user_id=requester_sub,
        requested_by_email=_normalize_email(user.get("email")),
        target_member_id=target_member.id,
        target_user_id=target_member.user_id,
        target_email=target_email,
        token_hash=_hash_transfer_token(raw_token),
        status="pending",
        expires_at=expires_at,
    )
    session.add(transfer)
    session.flush()

    web_origin = _resolve_public_web_origin(request)
    verify_url = f"{web_origin}/dashboard/ownership-transfer?token={raw_token}"

    try:
        _send_ownership_transfer_email(
            to_email=target_email,
            company_name=org.name,
            verify_url=verify_url,
            expires_at=expires_at,
        )
    except EmailConfigError:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail="Ownership transfer email is not configured on the server",
        )
    except Exception:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to send ownership transfer verification email",
        )

    session.commit()
    session.refresh(transfer)

    return OwnershipTransferRequestRead(
        id=transfer.id,
        target_member_id=transfer.target_member_id,
        target_email=transfer.target_email,
        status=transfer.status,
        created_at=transfer.created_at,
        expires_at=transfer.expires_at,
    )


@router.post("/ownership-transfer/verify", response_model=OwnershipTransferVerifyRead)
def verify_ownership_transfer(
    payload: OwnershipTransferVerifyRequest,
    session: SessionDep,
    user: UserDep,
):
    raw_token = payload.token.strip()
    if not raw_token:
        raise HTTPException(status_code=400, detail="Token is required")

    transfer = session.exec(
        select(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.token_hash == _hash_transfer_token(raw_token)
        )
    ).first()
    if not transfer or transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid or already-used ownership transfer token")

    now = datetime.utcnow()
    if transfer.expires_at < now:
        transfer.status = "expired"
        session.add(transfer)
        session.commit()
        raise HTTPException(status_code=400, detail="Ownership transfer token has expired")

    org = session.get(Organization, transfer.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != transfer.requested_by_user_id:
        transfer.status = "cancelled"
        session.add(transfer)
        session.commit()
        raise HTTPException(status_code=400, detail="Ownership changed before this transfer was verified")

    user_sub = user.get("sub")
    user_email = _normalize_email(user.get("email"))
    target_email = _normalize_email(transfer.target_email)
    if not user_sub:
        raise HTTPException(status_code=401, detail="Authenticated user ID is required")

    is_target_user = bool(transfer.target_user_id and transfer.target_user_id == user_sub)
    is_target_email = bool(user_email and target_email and user_email == target_email)
    if not (is_target_user or is_target_email):
        raise HTTPException(
            status_code=403,
            detail="This ownership transfer link is not for your account",
        )

    target_member = session.get(OrganizationMember, transfer.target_member_id)
    if not target_member or target_member.org_id != org.id:
        raise HTTPException(status_code=400, detail="Target member no longer exists in this organization")

    previous_owner_id = org.owner_id
    previous_owner_email = _normalize_email(transfer.requested_by_email)

    org.owner_id = user_sub
    target_member.user_id = user_sub
    if target_email:
        target_member.email = target_email
    target_member.role = "owner"
    target_member.can_manage_availability = True
    target_member.can_edit_items = True
    target_member.can_manage_menus = True
    target_member.can_manage_users = True

    previous_owner_member = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org.id,
            OrganizationMember.user_id == previous_owner_id,
            OrganizationMember.id != target_member.id,
        )
    ).first()
    if not previous_owner_member and previous_owner_email:
        previous_owner_member = session.exec(
            select(OrganizationMember).where(
                OrganizationMember.org_id == org.id,
                OrganizationMember.email == previous_owner_email,
                OrganizationMember.id != target_member.id,
            )
        ).first()

    if previous_owner_member:
        previous_owner_member.role = "member"
        previous_owner_member.can_manage_users = False
        previous_owner_member.user_id = previous_owner_id
        session.add(previous_owner_member)
    elif previous_owner_email:
        session.add(
            OrganizationMember(
                org_id=org.id,
                user_id=previous_owner_id,
                email=previous_owner_email,
                role="member",
                can_manage_availability=True,
                can_edit_items=True,
                can_manage_menus=True,
                can_manage_users=False,
            )
        )

    legacy_owner_members = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org.id,
            OrganizationMember.role == "owner",
            OrganizationMember.id != target_member.id,
        )
    ).all()
    for member in legacy_owner_members:
        member.role = "member"
        member.can_manage_users = False
        session.add(member)

    transfer.status = "completed"
    transfer.target_user_id = user_sub
    transfer.verified_at = now
    session.add(transfer)
    session.add(org)
    session.add(target_member)

    other_pending = session.exec(
        select(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.org_id == org.id,
            OrganizationOwnershipTransfer.status == "pending",
            OrganizationOwnershipTransfer.id != transfer.id,
        )
    ).all()
    for pending in other_pending:
        pending.status = "cancelled"
        session.add(pending)

    session.commit()

    return OwnershipTransferVerifyRead(
        ok=True,
        detail=f"Ownership transferred to {target_member.email}",
        org_id=org.id,
        org_name=org.name,
        new_owner_email=target_member.email,
    )


@router.get("/{org_id}/permissions", response_model=OrgPermissionsRead)
def get_organization_permissions(org_id: uuid.UUID, session: SessionDep, user: UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    perms = get_org_permissions(session, org_id, user)
    if not perms.can_view:
        raise HTTPException(status_code=403, detail="Not authorized")

    return OrgPermissionsRead(
        is_owner=perms.is_owner,
        can_view=perms.can_view,
        can_manage_availability=perms.can_manage_availability,
        can_edit_items=perms.can_edit_items,
        can_manage_menus=perms.can_manage_menus,
        can_manage_users=perms.can_manage_users,
    )

@router.patch("/{org_id}", response_model=Organization)
def update_organization(org_id: uuid.UUID, org_update: OrganizationUpdate, session: SessionDep, user: UserDep):
    user_id = user["sub"]
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = org_update.model_dump(exclude_unset=True)
    if "slug" in update_data:
        existing_org = session.exec(select(Organization).where(Organization.slug == update_data["slug"])).first()
        if existing_org and existing_org.id != org_id:
            raise HTTPException(status_code=400, detail="Organization slug already taken")

    for key, value in update_data.items():
        setattr(org, key, value)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.delete("/{org_id}")
def delete_organization(org_id: uuid.UUID, session: SessionDep, user: UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    menu_ids = session.exec(select(Menu.id).where(Menu.org_id == org_id)).all()
    menu_ids = [row[0] if isinstance(row, tuple) else row for row in menu_ids]
    if menu_ids:
        category_ids = session.exec(select(Category.id).where(Category.menu_id.in_(menu_ids))).all()
        category_ids = [row[0] if isinstance(row, tuple) else row for row in category_ids]
        if category_ids:
            item_ids = session.exec(select(Item.id).where(Item.category_id.in_(category_ids))).all()
            item_ids = [row[0] if isinstance(row, tuple) else row for row in item_ids]
            if item_ids:
                session.exec(delete(ItemPhoto).where(ItemPhoto.item_id.in_(item_ids)))
                session.exec(delete(ItemDietaryTagLink).where(ItemDietaryTagLink.item_id.in_(item_ids)))
                session.exec(delete(ItemAllergenLink).where(ItemAllergenLink.item_id.in_(item_ids)))
                session.exec(delete(Item).where(Item.id.in_(item_ids)))
            session.exec(delete(Category).where(Category.id.in_(category_ids)))
        session.exec(delete(Menu).where(Menu.id.in_(menu_ids)))

    session.exec(delete(OrganizationOwnershipTransfer).where(OrganizationOwnershipTransfer.org_id == org_id))
    session.exec(delete(OrganizationMember).where(OrganizationMember.org_id == org_id))
    session.delete(org)
    session.commit()
    return {"ok": True}


@router.get("/{org_id}/members", response_model=List[OrganizationMemberRead])
def list_org_members(org_id: uuid.UUID, session: SessionDep, user: UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, org_id, user)
    if not perms.can_manage_users:
        raise HTTPException(status_code=403, detail="Not authorized")

    return session.exec(
        select(OrganizationMember).where(OrganizationMember.org_id == org_id)
    ).all()


@router.post("/{org_id}/members", response_model=OrganizationMemberRead)
def add_org_member(org_id: uuid.UUID, member: OrganizationMemberCreate, session: SessionDep, user: UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, org_id, user)
    if not perms.can_manage_users:
        raise HTTPException(status_code=403, detail="Not authorized")

    email = member.email.strip().lower()

    existing = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id,
            OrganizationMember.email == email,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Member already exists")

    db_member = OrganizationMember(
        org_id=org_id,
        email=email,
        can_manage_availability=member.can_manage_availability,
        can_edit_items=member.can_edit_items,
        can_manage_menus=member.can_manage_menus,
        # User management stays admin-only; don't grant to members.
        can_manage_users=False,
    )
    session.add(db_member)
    session.commit()
    session.refresh(db_member)
    return db_member


@router.patch("/{org_id}/members/{member_id}", response_model=OrganizationMemberRead)
def update_org_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    member_update: OrganizationMemberUpdate,
    session: SessionDep,
    user: UserDep,
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, org_id, user)
    if not perms.can_manage_users:
        raise HTTPException(status_code=403, detail="Not authorized")

    db_member = session.get(OrganizationMember, member_id)
    if not db_member or db_member.org_id != org_id:
        raise HTTPException(status_code=404, detail="Member not found")

    data = member_update.model_dump(exclude_unset=True)
    if "email" in data and data["email"]:
        normalized = str(data["email"]).strip().lower()
        existing = session.exec(
            select(OrganizationMember).where(
                OrganizationMember.org_id == org_id,
                OrganizationMember.email == normalized,
                OrganizationMember.id != member_id,
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        data["email"] = normalized

    for key, value in data.items():
        if key == "can_manage_users":
            continue
        setattr(db_member, key, value)

    if "email" in data:
        pending_transfers = session.exec(
            select(OrganizationOwnershipTransfer).where(
                OrganizationOwnershipTransfer.target_member_id == member_id,
                OrganizationOwnershipTransfer.status == "pending",
            )
        ).all()
        for transfer in pending_transfers:
            transfer.target_email = data["email"]
            session.add(transfer)

    session.add(db_member)
    session.commit()
    session.refresh(db_member)
    return db_member


@router.delete("/{org_id}/members/{member_id}")
def delete_org_member(org_id: uuid.UUID, member_id: uuid.UUID, session: SessionDep, user: UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = get_org_permissions(session, org_id, user)
    if not perms.can_manage_users:
        raise HTTPException(status_code=403, detail="Not authorized")

    db_member = session.get(OrganizationMember, member_id)
    if not db_member or db_member.org_id != org_id:
        raise HTTPException(status_code=404, detail="Member not found")

    session.exec(
        delete(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.target_member_id == member_id
        )
    )
    session.delete(db_member)
    session.commit()
    return {"ok": True}
