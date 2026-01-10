from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import uuid

from sqlmodel import Session, select

from models import Organization, OrganizationMember


@dataclass(frozen=True)
class OrgPermissions:
    is_owner: bool
    can_manage_availability: bool
    can_edit_items: bool
    can_manage_menus: bool
    can_manage_users: bool

    @property
    def can_view(self) -> bool:
        return self.is_owner or any(
            [
                self.can_manage_availability,
                self.can_edit_items,
                self.can_manage_menus,
                self.can_manage_users,
            ]
        )


def get_org_permissions(session: Session, org_id: uuid.UUID, user: dict) -> OrgPermissions:
    org = session.get(Organization, org_id)
    if not org:
        raise ValueError("Organization not found")

    user_sub = user.get("sub")
    if user_sub and org.owner_id == user_sub:
        return OrgPermissions(
            is_owner=True,
            can_manage_availability=True,
            can_edit_items=True,
            can_manage_menus=True,
            can_manage_users=True,
        )

    email: Optional[str] = user.get("email")
    if isinstance(email, str):
        email = email.strip().lower() or None
    if not email:
        return OrgPermissions(
            is_owner=False,
            can_manage_availability=False,
            can_edit_items=False,
            can_manage_menus=False,
            can_manage_users=False,
        )

    member = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org_id, OrganizationMember.email == email
        )
    ).first()

    if not member:
        return OrgPermissions(
            is_owner=False,
            can_manage_availability=False,
            can_edit_items=False,
            can_manage_menus=False,
            can_manage_users=False,
        )

    return OrgPermissions(
        is_owner=False,
        can_manage_availability=member.can_manage_availability or member.can_edit_items,
        can_edit_items=member.can_edit_items,
        can_manage_menus=member.can_manage_menus,
        can_manage_users=member.can_manage_users,
    )
