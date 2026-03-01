import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from dependencies import get_admin_user
from models import Organization, Menu, Item, ImportJob, OrganizationMember

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_admin_user)])

# ---- Schemas ----

class AdminAnalyticsResponse(BaseModel):
    total_organizations: int
    total_menus: int
    total_items: int
    total_jobs: int


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
    
    return AdminAnalyticsResponse(
        total_organizations=org_count,
        total_menus=menu_count,
        total_items=item_count,
        total_jobs=job_count,
    )


@router.get("/organizations", response_model=AdminOrganizationsResponse)
def list_organizations(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_session)
):
    """List all organizations with aggregated counts."""
    offset = (page - 1) * size
    
    total = session.exec(select(func.count(Organization.id))).one()
    orgs = session.exec(
        select(Organization).order_by(Organization.created_at.desc()).offset(offset).limit(size)
    ).all()
    
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
