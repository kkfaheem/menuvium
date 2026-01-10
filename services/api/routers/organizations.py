from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, delete
from typing import List, Annotated
import uuid

from database import get_session
from models import (
    Organization,
    OrganizationUpdate,
    OrganizationMember,
    OrganizationMemberCreate,
    OrganizationMemberRead,
    OrganizationMemberUpdate,
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

    session.delete(db_member)
    session.commit()
    return {"ok": True}
