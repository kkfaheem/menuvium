import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, func

from ar_pipeline import (
    AR_CAPTURE_MODE_PHOTO_SCAN,
    AR_PROVIDER_KIRI,
    kiri_enabled,
    queue_conversion_from_existing_usdz,
    queue_kiri_generation,
    update_item_ar_metadata,
)
from database import get_session
from dependencies import get_admin_user
from models import (
    ArCaptureAsset,
    Organization, Menu, Item, ImportJob, OrganizationMember,
    Category, ItemPhoto, ItemDietaryTagLink, ItemAllergenLink
)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_admin_user)])

# ---- Schemas ----

class AdminAnalyticsResponse(BaseModel):
    total_organizations: int
    total_menus: int
    total_items: int
    total_jobs: int
    total_ai_tokens: int = 0
    ar_ready: int = 0
    ar_pending: int = 0
    ar_processing: int = 0
    ar_failed: int = 0


class AdminMemberRead(BaseModel):
    id: uuid.UUID
    email: str
    role: Optional[str]
    user_id: Optional[str]

class AdminOrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_id: str
    owner_email: Optional[str] = None
    created_at: datetime
    menu_count: int
    member_count: int
    members: List[AdminMemberRead] = []

class AdminCompanyDetail(AdminOrganizationRead):
    item_count: int
    total_ai_tokens: int
    ar_ready: int
    ar_pending: int
    ar_processing: int
    ar_failed: int
    recent_jobs: List[ImportJob]


class AdminOrganizationsResponse(BaseModel):
    items: List[AdminOrganizationRead]
    total: int
    page: int
    size: int


class AdminMenuRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: Optional[str]
    is_active: bool
    theme: str
    created_at: datetime
    org_id: uuid.UUID
    org_name: str
    org_slug: str
    created_by_user_id: str
    created_by_email: Optional[str] = None
    category_count: int
    item_count: int


class AdminMenusResponse(BaseModel):
    items: List[AdminMenuRead]
    total: int
    page: int
    size: int


class AdminJobsResponse(BaseModel):
    items: List[ImportJob]
    total: int
    page: int
    size: int


class AdminARJobRead(BaseModel):
    id: uuid.UUID
    name: str
    restaurant_name: str
    ar_status: Optional[str]
    ar_error_message: Optional[str]
    ar_created_at: Optional[datetime]
    ar_updated_at: Optional[datetime]
    ar_stage: Optional[str]
    ar_stage_detail: Optional[str]
    ar_progress: Optional[float]
    ar_job_id: Optional[uuid.UUID]


class AdminARJobsResponse(BaseModel):
    items: List[AdminARJobRead]
    total: int
    page: int
    size: int


def _resolve_cognito_user_email(username: Optional[str]) -> Optional[str]:
    """Best-effort Cognito email lookup by username/sub."""
    if not username:
        return None

    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        return None

    try:
        client = get_cognito_client()
        response = client.admin_get_user(UserPoolId=user_pool_id, Username=username)
        attrs = response.get("UserAttributes", [])
        email = next(
            (
                attr.get("Value")
                for attr in attrs
                if attr.get("Name") == "email" and isinstance(attr.get("Value"), str)
            ),
            None,
        )
        return email.strip() if isinstance(email, str) and email.strip() else None
    except Exception:
        return None


# ---- Endpoints ----

@router.get("/analytics", response_model=AdminAnalyticsResponse)
def get_global_analytics(session: Session = Depends(get_session)):
    """Get high-level statistics across the entire platform."""
    org_count = session.exec(select(func.count(Organization.id))).one()
    menu_count = session.exec(select(func.count(Menu.id))).one()
    item_count = session.exec(select(func.count(Item.id))).one()
    job_count = session.exec(select(func.count(ImportJob.id))).one()
    
    # Calculate total AI tokens
    jobs_meta = session.exec(select(ImportJob.metadata_json).where(ImportJob.metadata_json != None)).all()
    # Handle cases where metadata might be a string (SQLite) instead of a dict (Postgres JSONB)
    total_ai_tokens = 0
    import json
    for meta in jobs_meta:
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except:
                meta = {}
        if isinstance(meta, dict):
            total_ai_tokens += meta.get("ai_tokens", 0)

    # AR Stats
    ar_ready = session.exec(select(func.count(Item.id)).where(Item.ar_status == "ready")).one()
    ar_pending = session.exec(select(func.count(Item.id)).where(Item.ar_status == "pending")).one()
    ar_processing = session.exec(select(func.count(Item.id)).where(Item.ar_status == "processing")).one()
    ar_failed = session.exec(select(func.count(Item.id)).where(Item.ar_status == "failed")).one()
    
    return AdminAnalyticsResponse(
        total_organizations=org_count,
        total_menus=menu_count,
        total_items=item_count,
        total_jobs=job_count,
        total_ai_tokens=total_ai_tokens,
        ar_ready=ar_ready,
        ar_pending=ar_pending,
        ar_processing=ar_processing,
        ar_failed=ar_failed,
    )


@router.get("/organizations", response_model=AdminOrganizationsResponse)
def list_organizations(
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """List all organizations with aggregated counts."""
    offset = (page - 1) * size
    
    query = select(Organization)
    if q:
        search_filter = Organization.name.ilike(f"%{q}%") | Organization.slug.ilike(f"%{q}%")
        query = query.where(search_filter)
        total_query = select(func.count(Organization.id)).where(search_filter)
    else:
        total_query = select(func.count(Organization.id))
        
    total = session.exec(total_query).one()
    orgs = session.exec(query.order_by(Organization.created_at.desc()).offset(offset).limit(size)).all()
    
    results = []
    for org in orgs:
        # Get counts for this org
        menu_count = session.exec(select(func.count(Menu.id)).where(Menu.org_id == org.id)).one()
        all_members = session.exec(select(OrganizationMember).where(OrganizationMember.org_id == org.id)).all()
        
        member_reads = [
            AdminMemberRead(
                id=m.id,
                email=m.email,
                role=m.role,
                user_id=m.user_id
            ) for m in all_members
        ]
        
        # Try to find owner's email
        owner_email = next((m.email for m in all_members if m.user_id == org.owner_id or m.role == "owner"), None)
        
        # Ensure the owner always appears in the members list
        owner_in_members = any(m.user_id == org.owner_id or m.role == "owner" for m in all_members)
        if not owner_in_members and org.owner_id:
            # Owner doesn't have a membership record — add a synthetic entry
            member_reads.insert(0, AdminMemberRead(
                id=uuid.UUID(int=0),
                email=owner_email or org.owner_id,
                role="owner",
                user_id=org.owner_id
            ))
        
        results.append(AdminOrganizationRead(
            id=org.id,
            name=org.name,
            slug=org.slug,
            owner_id=org.owner_id,
            owner_email=owner_email,
            created_at=org.created_at,
            menu_count=menu_count,
            member_count=len(member_reads),
            members=member_reads
        ))
        
    return AdminOrganizationsResponse(
        items=results,
        total=total,
        page=page,
        size=size
    )


@router.get("/menus", response_model=AdminMenusResponse)
def list_admin_menus(
    q: Optional[str] = Query(None),
    org_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session),
):
    """List all menus across organizations for super-admin review."""
    offset = (page - 1) * size

    query = select(Menu, Organization.name, Organization.slug, Organization.owner_id).join(
        Organization, Menu.org_id == Organization.id
    )
    total_query = select(func.count(Menu.id)).join(Organization, Menu.org_id == Organization.id)

    if org_id:
        query = query.where(Menu.org_id == org_id)
        total_query = total_query.where(Menu.org_id == org_id)

    if q:
        search_filter = (
            Menu.name.ilike(f"%{q}%")
            | Menu.slug.ilike(f"%{q}%")
            | Organization.name.ilike(f"%{q}%")
            | Organization.slug.ilike(f"%{q}%")
            | Organization.owner_id.ilike(f"%{q}%")
        )
        query = query.where(search_filter)
        total_query = total_query.where(search_filter)

    total = session.exec(total_query).one()
    rows = session.exec(
        query.order_by(Menu.created_at.desc()).offset(offset).limit(size)
    ).all()

    menu_ids = [menu.id for menu, _, _, _ in rows]
    org_ids = [menu.org_id for menu, _, _, _ in rows]

    category_count_map: dict[uuid.UUID, int] = {}
    item_count_map: dict[uuid.UUID, int] = {}
    owner_email_map: dict[uuid.UUID, Optional[str]] = {}

    if menu_ids:
        category_count_rows = session.exec(
            select(Category.menu_id, func.count(Category.id))
            .where(Category.menu_id.in_(menu_ids))
            .group_by(Category.menu_id)
        ).all()
        category_count_map = {
            menu_id: count
            for menu_id, count in category_count_rows
        }

        item_count_rows = session.exec(
            select(Category.menu_id, func.count(Item.id))
            .join(Item, Item.category_id == Category.id)
            .where(Category.menu_id.in_(menu_ids))
            .group_by(Category.menu_id)
        ).all()
        item_count_map = {
            menu_id: count
            for menu_id, count in item_count_rows
        }

    if org_ids:
        memberships = session.exec(
            select(OrganizationMember).where(OrganizationMember.org_id.in_(org_ids))
        ).all()
        members_by_org: dict[uuid.UUID, list[OrganizationMember]] = {}
        for member in memberships:
            members_by_org.setdefault(member.org_id, []).append(member)

        # pick owner email by matching owner user_id first, fallback to role=owner.
        for menu, _, _, owner_id in rows:
            org_members = members_by_org.get(menu.org_id, [])
            owner_email = next((m.email for m in org_members if m.user_id == owner_id), None)
            if not owner_email:
                owner_email = next((m.email for m in org_members if m.role == "owner"), None)
            if not owner_email:
                owner_email = _resolve_cognito_user_email(owner_id)
            owner_email_map[menu.org_id] = owner_email

    items: List[AdminMenuRead] = []
    for menu, org_name, org_slug, owner_id in rows:
        items.append(
            AdminMenuRead(
                id=menu.id,
                name=menu.name,
                slug=menu.slug,
                is_active=menu.is_active,
                theme=menu.theme,
                created_at=menu.created_at,
                org_id=menu.org_id,
                org_name=org_name,
                org_slug=org_slug,
                created_by_user_id=owner_id,
                created_by_email=owner_email_map.get(menu.org_id),
                category_count=category_count_map.get(menu.id, 0),
                item_count=item_count_map.get(menu.id, 0),
            )
        )

    return AdminMenusResponse(
        items=items,
        total=total,
        page=page,
        size=size,
    )

class AdminOrganizationCreate(BaseModel):
    name: str
    owner_id: str

@router.post("/organizations", response_model=AdminOrganizationRead)
def create_organization(data: AdminOrganizationCreate, session: Session = Depends(get_session)):
    """Super Admin endpoint to manually create a new company/organization."""
    import uuid
    from importer.utils import slugify

    slug = slugify(data.name)
    base_slug = slug
    counter = 1
    while session.exec(select(Organization).where(Organization.slug == slug)).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(
        id=uuid.uuid4(),
        name=data.name,
        slug=slug,
        owner_id=data.owner_id,
        created_at=datetime.utcnow()
    )
    session.add(org)
    session.commit()
    session.refresh(org)
    
    # Auto-add the owner as a member
    member = OrganizationMember(
        id=uuid.uuid4(),
        org_id=org.id,
        user_id=data.owner_id,
        role="owner",
        created_at=datetime.utcnow()
    )
    session.add(member)
    session.commit()

    return AdminOrganizationRead(
        id=org.id,
        name=org.name,
        slug=org.slug,
        owner_id=org.owner_id,
        created_at=org.created_at,
        menu_count=0,
        member_count=1
    )

class AdminOrganizationUpdate(BaseModel):
    name: Optional[str] = None
    owner_id: Optional[str] = None

@router.patch("/organizations/{org_id}", response_model=AdminOrganizationRead)
def update_organization(org_id: uuid.UUID, data: AdminOrganizationUpdate, session: Session = Depends(get_session)):
    """Super Admin endpoint to update an organization."""
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    if data.name:
        org.name = data.name
    if data.owner_id:
        requested_owner_id = data.owner_id.strip()
        if not requested_owner_id:
            raise HTTPException(status_code=400, detail="owner_id cannot be empty")

        if requested_owner_id != org.owner_id:
            previous_owner_id = org.owner_id
            all_members = session.exec(
                select(OrganizationMember).where(OrganizationMember.org_id == org.id)
            ).all()

            new_owner_member = next((m for m in all_members if m.user_id == requested_owner_id), None)
            resolved_owner_email = _resolve_cognito_user_email(requested_owner_id)

            if not new_owner_member and resolved_owner_email:
                new_owner_member = next(
                    (
                        m
                        for m in all_members
                        if isinstance(m.email, str) and m.email.lower() == resolved_owner_email.lower()
                    ),
                    None,
                )
                if new_owner_member:
                    new_owner_member.user_id = requested_owner_id

            if not new_owner_member:
                new_owner_member = OrganizationMember(
                    id=uuid.uuid4(),
                    org_id=org.id,
                    user_id=requested_owner_id,
                    email=resolved_owner_email or requested_owner_id,
                    role="owner",
                    can_manage_availability=True,
                    can_edit_items=True,
                    can_manage_menus=True,
                    can_manage_users=True,
                    created_at=datetime.utcnow(),
                )
                session.add(new_owner_member)
                all_members.append(new_owner_member)

            new_owner_member.user_id = requested_owner_id
            new_owner_member.role = "owner"
            new_owner_member.can_manage_availability = True
            new_owner_member.can_edit_items = True
            new_owner_member.can_manage_menus = True
            new_owner_member.can_manage_users = True
            session.add(new_owner_member)

            for member in all_members:
                if member.id == new_owner_member.id:
                    continue

                was_owner = (
                    (previous_owner_id and member.user_id == previous_owner_id)
                    or (member.role == "owner" and member.user_id != requested_owner_id)
                )
                if not was_owner:
                    continue

                member.role = "manager"
                member.can_manage_availability = True
                member.can_edit_items = True
                member.can_manage_menus = True
                member.can_manage_users = True
                session.add(member)

            org.owner_id = requested_owner_id
        
    session.add(org)
    session.commit()
    session.refresh(org)
    
    menu_count = session.exec(select(func.count(Menu.id)).where(Menu.org_id == org.id)).one()
    all_members = session.exec(select(OrganizationMember).where(OrganizationMember.org_id == org.id)).all()
    member_reads = [
        AdminMemberRead(
            id=m.id,
            email=m.email,
            role=m.role,
            user_id=m.user_id,
        )
        for m in all_members
    ]
    owner_email = next((m.email for m in all_members if m.user_id == org.owner_id), None)
    if not owner_email:
        owner_email = next((m.email for m in all_members if m.role == "owner"), None)
    if not owner_email:
        owner_email = _resolve_cognito_user_email(org.owner_id)
    
    return AdminOrganizationRead(
        id=org.id,
        name=org.name,
        slug=org.slug,
        owner_id=org.owner_id,
        owner_email=owner_email,
        created_at=org.created_at,
        menu_count=menu_count,
        member_count=len(member_reads),
        members=member_reads,
    )


@router.get("/companies/{org_id}", response_model=AdminCompanyDetail)
def get_company_detail(org_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get detailed information about a single company."""
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Company not found")

    # Aggregated Counts
    menu_count = session.exec(select(func.count(Menu.id)).where(Menu.org_id == org.id)).one()
    item_count = session.exec(
        select(func.count(Item.id))
        .join(Category, Item.category_id == Category.id)
        .join(Menu, Category.menu_id == Menu.id)
        .where(Menu.org_id == org.id)
    ).one()

    # Members
    all_members = session.exec(select(OrganizationMember).where(OrganizationMember.org_id == org.id)).all()
    member_reads = [
        AdminMemberRead(
            id=m.id,
            email=m.email,
            role=m.role,
            user_id=org.owner_id if (m.role == "owner" and not m.user_id) else m.user_id
        ) for m in all_members
    ]
    owner_email = next((m.email for m in all_members if m.user_id == org.owner_id), None)
    if not owner_email:
        owner_email = next((m.email for m in all_members if m.role == "owner"), None)
    if not owner_email:
        owner_email = _resolve_cognito_user_email(org.owner_id)

    # Ensure owner is always represented in team members, even without a membership row.
    owner_in_members = any(m.user_id == org.owner_id or m.role == "owner" for m in all_members)
    if not owner_in_members and org.owner_id:
        member_reads.insert(0, AdminMemberRead(
            id=uuid.UUID(int=0),
            email=owner_email or org.owner_id,
            role="owner",
            user_id=org.owner_id,
        ))

    # AR Stats
    ar_ready = session.exec(
        select(func.count(Item.id))
        .join(Category, Item.category_id == Category.id)
        .join(Menu, Category.menu_id == Menu.id)
        .where(Menu.org_id == org.id, Item.ar_status == "ready")
    ).one()
    ar_pending = session.exec(
        select(func.count(Item.id))
        .join(Category, Item.category_id == Category.id)
        .join(Menu, Category.menu_id == Menu.id)
        .where(Menu.org_id == org.id, Item.ar_status == "pending")
    ).one()
    ar_processing = session.exec(
        select(func.count(Item.id))
        .join(Category, Item.category_id == Category.id)
        .join(Menu, Category.menu_id == Menu.id)
        .where(Menu.org_id == org.id, Item.ar_status == "processing")
    ).one()
    ar_failed = session.exec(
        select(func.count(Item.id))
        .join(Category, Item.category_id == Category.id)
        .join(Menu, Category.menu_id == Menu.id)
        .where(Menu.org_id == org.id, Item.ar_status == "failed")
    ).one()

    # AI Tokens (from jobs)
    # Note: ImportJob doesn't have org_id directly, but we can search for jobs where restaurant_name matches or recent jobs.
    # For now, let's get recent jobs related to this company.
    # A better way would be to link ImportJob to Organization, but for now we'll use restaurant_name heuristic or just skip tokens for detail if unsure.
    # Let's try to find jobs with restaurant_name ilike org.name
    recent_jobs = session.exec(
        select(ImportJob)
        .where(ImportJob.restaurant_name.ilike(f"%{org.name}%"))
        .order_by(ImportJob.created_at.desc())
        .limit(10)
    ).all()

    total_ai_tokens = 0
    import json
    for job in recent_jobs:
        meta = job.metadata_json
        if isinstance(meta, str):
            try: meta = json.loads(meta)
            except: meta = {}
        if isinstance(meta, dict):
            total_ai_tokens += meta.get("ai_tokens", 0)

    return AdminCompanyDetail(
        id=org.id,
        name=org.name,
        slug=org.slug,
        owner_id=org.owner_id,
        owner_email=owner_email,
        created_at=org.created_at,
        menu_count=menu_count,
        member_count=len(member_reads),
        members=member_reads,
        item_count=item_count,
        total_ai_tokens=total_ai_tokens,
        ar_ready=ar_ready,
        ar_pending=ar_pending,
        ar_processing=ar_processing,
        ar_failed=ar_failed,
        recent_jobs=recent_jobs
    )


@router.delete("/organizations/{org_id}")
def delete_organization(org_id: uuid.UUID, session: Session = Depends(get_session)):
    """Super Admin endpoint to completely delete an organization and all cascading data."""
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    from sqlmodel import delete

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


@router.get("/jobs", response_model=AdminJobsResponse)
def list_import_jobs(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """List all menu importer jobs with optional status filter."""
    offset = (page - 1) * size
    
    query = select(ImportJob)
    if status:
        query = query.where(ImportJob.status == status.upper())
        total_query = select(func.count(ImportJob.id)).where(ImportJob.status == status.upper())
    else:
        total_query = select(func.count(ImportJob.id))
        
    total = session.exec(total_query).one()
    jobs = session.exec(
        query.order_by(ImportJob.created_at.desc()).offset(offset).limit(size)
    ).all()
    
    return AdminJobsResponse(
        items=jobs,
        total=total,
        page=page,
        size=size
    )


@router.get("/jobs/{job_id}", response_model=ImportJob)
def get_job_details(job_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get detailed view of a specific import job, including logs."""
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

# ---- AR Jobs Endpoints ----

@router.get("/ar-jobs", response_model=AdminARJobsResponse)
def list_ar_jobs(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """List all AR jobs (items with ar_status)."""
    offset = (page - 1) * size
    
    query = select(Item, Organization.name).join(Category, Item.category_id == Category.id).join(Menu, Category.menu_id == Menu.id).join(Organization, Menu.org_id == Organization.id).where(Item.ar_status != None)
    total_query = select(func.count(Item.id)).where(Item.ar_status != None)
    
    if status and status.upper() != "ALL":
        query = query.where(Item.ar_status == status.lower())
        total_query = total_query.where(Item.ar_status == status.lower())
        
    total = session.exec(total_query).one()
    results = session.exec(
        query.order_by(Item.ar_updated_at.desc()).offset(offset).limit(size)
    ).all()
    
    ar_jobs = []
    for item, org_name in results:
        ar_jobs.append(AdminARJobRead(
            id=item.id,
            name=item.name,
            restaurant_name=org_name,
            ar_status=item.ar_status,
            ar_error_message=item.ar_error_message,
            ar_created_at=item.ar_created_at,
            ar_updated_at=item.ar_updated_at,
            ar_stage=item.ar_stage,
            ar_stage_detail=item.ar_stage_detail,
            ar_progress=item.ar_progress,
            ar_job_id=item.ar_job_id
        ))
        
    return AdminARJobsResponse(
        items=ar_jobs,
        total=total,
        page=page,
        size=size
    )

@router.post("/ar-jobs/{item_id}/retry")
def retry_ar_job(item_id: uuid.UUID, session: Session = Depends(get_session)):
    """Retry a failed or stalled AR job."""
    item = session.get(Item, item_id)
    if not item or not item.ar_status:
        raise HTTPException(status_code=404, detail="AR job not found")

    if item.ar_provider == AR_PROVIDER_KIRI and item.ar_model_usdz_s3_key and item.ar_model_usdz_url and not item.ar_model_glb_s3_key:
        queue_conversion_from_existing_usdz(
            session=session,
            item=item,
            detail="Retried by admin",
        )
    else:
        if not kiri_enabled():
            raise HTTPException(status_code=503, detail="AR generation is not configured")

        captures = session.exec(
            select(ArCaptureAsset).where(ArCaptureAsset.item_id == item_id)
        ).all()
        if not captures:
            raise HTTPException(status_code=400, detail="No AR captures available for retry")

        queue_kiri_generation(
            session=session,
            item=item,
            capture_mode=item.ar_capture_mode or AR_CAPTURE_MODE_PHOTO_SCAN,
            detail="Retried by admin",
        )
    session.commit()
    return {"ok": True}

@router.post("/ar-jobs/{item_id}/cancel")
def cancel_ar_job(item_id: uuid.UUID, session: Session = Depends(get_session)):
    """Cancel a pending or processing AR job."""
    item = session.get(Item, item_id)
    if not item or not item.ar_status:
        raise HTTPException(status_code=404, detail="AR job not found")
        
    if item.ar_status not in ("pending", "processing"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel AR job with status '{item.ar_status}'."
        )
        
    item.ar_status = "failed"
    item.ar_error_message = "Canceled by admin"
    item.ar_stage = "canceled"
    item.ar_stage_detail = "Canceled by admin"
    item.ar_progress = None
    item.ar_job_id = None
    item.ar_updated_at = datetime.utcnow()
    update_item_ar_metadata(item, canceled_at=datetime.utcnow().isoformat())

    session.add(item)
    session.commit()
    return {"ok": True}

# ---- User Management (Cognito) ----

import boto3
import os

def get_cognito_client():
    return boto3.client("cognito-idp", region_name=os.getenv("AWS_REGION", "us-east-1"))

class AdminUserRead(BaseModel):
    username: str
    name: Optional[str] = None
    email: str
    status: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

class UserCompanyAffiliation(BaseModel):
    org_id: uuid.UUID
    org_name: str
    role: Optional[str]

class AdminUserDetail(AdminUserRead):
    companies: List[UserCompanyAffiliation]
    recent_jobs: List[ImportJob]

class AdminUsersResponse(BaseModel):
    items: List[AdminUserRead]
    # Pagination might be tricky with Cognito's PaginationToken, so doing simple approach


def _get_attr(attributes: List[dict], key: str) -> Optional[str]:
    value = next((attr.get("Value") for attr in attributes if attr.get("Name") == key), None)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _derive_user_name(attributes: List[dict]) -> Optional[str]:
    direct_name = _get_attr(attributes, "name")
    if direct_name:
        return direct_name
    given = _get_attr(attributes, "given_name")
    family = _get_attr(attributes, "family_name")
    combined = " ".join([part for part in [given, family] if part]).strip()
    if combined:
        return combined
    preferred = _get_attr(attributes, "preferred_username")
    return preferred


@router.get("/users", response_model=AdminUsersResponse)
def list_users():
    """List users from Cognito User Pool."""
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")
        
    client = get_cognito_client()
    try:
        # Note: In a real app with many users, implement proper PaginationToken handling.
        response = client.list_users(UserPoolId=user_pool_id, Limit=60)
        users = []
        from datetime import timezone
        for u in response.get("Users", []):
            attributes = u.get("Attributes", [])
            email = _get_attr(attributes, "email") or u["Username"]
            name = _derive_user_name(attributes)
            users.append(AdminUserRead(
                username=u["Username"],
                name=name,
                email=email,
                status=u.get("UserStatus", "UNKNOWN"),
                enabled=u.get("Enabled", False),
                created_at=u.get("UserCreateDate", datetime.now(timezone.utc)),
                updated_at=u.get("UserLastModifiedDate", datetime.now(timezone.utc))
            ))
        # Sort by creation date descending
        users.sort(key=lambda x: x.created_at, reverse=True)
        return AdminUsersResponse(items=users)
    except Exception as e:
        print(f"DEBUG: Cognito Error in list_users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Cognito error: {str(e)}")

@router.get("/users/{username}", response_model=AdminUserDetail)
def get_user_detail(username: str, session: Session = Depends(get_session)):
    """Get detailed information about a single user from Cognito and DB."""
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    client = get_cognito_client()
    
    try:
        response = client.admin_get_user(UserPoolId=user_pool_id, Username=username)
        attributes = response.get("UserAttributes", [])
        email = _get_attr(attributes, "email") or username
        name = _derive_user_name(attributes)
        
        user_read = AdminUserRead(
            username=response["Username"],
            name=name,
            email=email,
            status=response.get("UserStatus", "UNKNOWN"),
            enabled=response.get("Enabled", False),
            created_at=response.get("UserCreateDate", datetime.utcnow()),
            updated_at=response.get("UserLastModifiedDate", datetime.utcnow())
        )
        
        # Find company affiliations
        memberships = session.exec(
            select(OrganizationMember, Organization.name)
            .join(Organization, OrganizationMember.org_id == Organization.id)
            .where((OrganizationMember.user_id == response["Username"]) | (OrganizationMember.email == email))
        ).all()
        
        affiliations = [
            UserCompanyAffiliation(
                org_id=m.org_id,
                org_name=org_name,
                role=m.role
            ) for m, org_name in memberships
        ]
        
        # Recent jobs by this user
        recent_jobs = session.exec(
            select(ImportJob)
            .where(ImportJob.created_by == email)
            .order_by(ImportJob.created_at.desc())
            .limit(10)
        ).all()
        
        return AdminUserDetail(
            **user_read.model_dump(),
            companies=affiliations,
            recent_jobs=recent_jobs
        )
    except Exception as e:
        print(f"DEBUG: Cognito Error in get_user_detail: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user: {str(e)}")

@router.post("/users/{username}/disable")
def disable_user(username: str):
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")
        
    client = get_cognito_client()
    try:
        client.admin_disable_user(UserPoolId=user_pool_id, Username=username)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cognito error: {str(e)}")

@router.post("/users/{username}/enable")
def enable_user(username: str):
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")
        
    client = get_cognito_client()
    try:
        client.admin_enable_user(UserPoolId=user_pool_id, Username=username)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cognito error: {str(e)}")

@router.post("/users/{username}/reset-password")
def reset_user_password(username: str):
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")
        
    client = get_cognito_client()
    try:
        client.admin_reset_user_password(UserPoolId=user_pool_id, Username=username)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cognito error: {str(e)}")

@router.delete("/users/{username}")
def delete_user(username: str, session: Session = Depends(get_session)):
    """Permanently delete a user from Cognito and remove all their DB memberships."""
    print(f"DEBUG: delete_user called for username={username}")
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")

    client = get_cognito_client()

    # 1. Get user email before deletion (for DB cleanup)
    try:
        response = client.admin_get_user(UserPoolId=user_pool_id, Username=username)
        email = next((attr["Value"] for attr in response.get("UserAttributes", []) if attr["Name"] == "email"), username)
        print(f"DEBUG: Found user email={email}")
    except Exception as e:
        print(f"DEBUG: admin_get_user failed: {e}")
        raise HTTPException(status_code=404, detail=f"User not found in Cognito: {e}")

    # 2. Delete from Cognito
    try:
        client.admin_delete_user(UserPoolId=user_pool_id, Username=username)
        print(f"DEBUG: Deleted user {username} from Cognito")
    except Exception as e:
        print(f"DEBUG: admin_delete_user failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete from Cognito: {e}")

    # 3. Delete organizations owned by this user
    orgs_deleted = 0
    try:
        owned_orgs = session.exec(
            select(Organization).where(Organization.owner_id == username)
        ).all()
        for org in owned_orgs:
            # Delete all menus and their nested data
            menus = session.exec(select(Menu).where(Menu.org_id == org.id)).all()
            for menu in menus:
                categories = session.exec(select(Category).where(Category.menu_id == menu.id)).all()
                for cat in categories:
                    items = session.exec(select(Item).where(Item.category_id == cat.id)).all()
                    for item in items:
                        # Delete item photos, dietary tag links, allergen links
                        for photo in session.exec(select(ItemPhoto).where(ItemPhoto.item_id == item.id)).all():
                            session.delete(photo)
                        for link in session.exec(select(ItemDietaryTagLink).where(ItemDietaryTagLink.item_id == item.id)).all():
                            session.delete(link)
                        for link in session.exec(select(ItemAllergenLink).where(ItemAllergenLink.item_id == item.id)).all():
                            session.delete(link)
                        session.delete(item)
                    session.delete(cat)
                session.delete(menu)
            # Delete org members
            for m in session.exec(select(OrganizationMember).where(OrganizationMember.org_id == org.id)).all():
                session.delete(m)
            session.delete(org)
            orgs_deleted += 1
        session.commit()
        print(f"DEBUG: Deleted {orgs_deleted} owned organizations for {username}")
    except Exception as e:
        print(f"DEBUG: Org cascade delete failed for {username}: {e}")
        session.rollback()

    # 4. Clean up remaining DB memberships (where user was a member, not owner)
    removed_count = 0
    try:
        memberships = session.exec(
            select(OrganizationMember).where(
                (OrganizationMember.user_id == username) | (OrganizationMember.email == email)
            )
        ).all()
        removed_count = len(memberships)
        for m in memberships:
            session.delete(m)
        session.commit()
        print(f"DEBUG: Removed {removed_count} remaining memberships for {username}")
    except Exception as e:
        print(f"DEBUG: DB cleanup failed for {username}: {e}")

    return {"ok": True, "detail": f"User {username} deleted, {orgs_deleted} companies removed, {removed_count} memberships cleaned up."}

@router.post("/users/{username}/impersonate")
def impersonate_user(username: str, session: Session = Depends(get_session)):
    """Generate a valid backend-signed JWT acting as the specified Cognito user."""
    impersonation_secret = os.getenv("IMPERSONATION_SECRET")
    client_id = os.getenv("COGNITO_CLIENT_ID")
    if not impersonation_secret:
        raise HTTPException(status_code=500, detail="Impersonation not configured on backend")
        
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")

    # Fetch email from Cognito to embed in the token
    client = get_cognito_client()
    try:
        response = client.admin_get_user(UserPoolId=user_pool_id, Username=username)
        email = next((attr["Value"] for attr in response.get("UserAttributes", []) if attr["Name"] == "email"), username)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"User not found in Cognito: {e}")

    import time
    from jose import jwt
    
    # Generate an HS256 token valid for 1 hour
    now = int(time.time())
    payload = {
        "sub": username,
        "email": email,
        "aud": client_id,
        "iss": f"https://cognito-idp.{os.getenv('AWS_REGION', 'us-east-1')}.amazonaws.com/{user_pool_id}",
        "exp": now + 3600,
        "iat": now,
        "auth_time": now,
        "impersonated": True
    }
    
    token = jwt.encode(payload, impersonation_secret, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600}
