import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from dependencies import get_admin_user
from models import (
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


class AdminOrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    owner_id: str
    created_at: datetime
    menu_count: int
    member_count: int


class AdminOrganizationsResponse(BaseModel):
    items: List[AdminOrganizationRead]
    total: int
    page: int
    size: int


class AdminJobsResponse(BaseModel):
    items: List[ImportJob]
    total: int
    page: int
    size: int


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
    
    return AdminAnalyticsResponse(
        total_organizations=org_count,
        total_menus=menu_count,
        total_items=item_count,
        total_jobs=job_count,
        total_ai_tokens=total_ai_tokens,
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
        member_count = session.exec(select(func.count(OrganizationMember.id)).where(OrganizationMember.org_id == org.id)).one()
        
        results.append(AdminOrganizationRead(
            id=org.id,
            name=org.name,
            slug=org.slug,
            owner_id=org.owner_id,
            created_at=org.created_at,
            menu_count=menu_count,
            member_count=member_count,
        ))
        
    return AdminOrganizationsResponse(
        items=results,
        total=total,
        page=page,
        size=size
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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """List all menu importer jobs."""
    offset = (page - 1) * size
    
    total = session.exec(select(func.count(ImportJob.id))).one()
    jobs = session.exec(
        select(ImportJob).order_by(ImportJob.created_at.desc()).offset(offset).limit(size)
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
