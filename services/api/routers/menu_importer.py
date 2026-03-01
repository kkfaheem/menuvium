"""
Admin Menu Importer API routes.

All endpoints require admin authentication via ADMIN_EMAILS allowlist.
"""

import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlmodel import Session, select, col

from database import get_session
from dependencies import get_admin_user
from models import ImportJob, ImportJobCreate, ImportJobRead

from importer.zipper import get_zip_data
from importer.utils import slugify

router = APIRouter(prefix="/admin/menu-importer", tags=["admin-menu-importer"])
SessionDep = Depends(get_session)
AdminDep = Depends(get_admin_user)


@router.post("/jobs", response_model=ImportJobRead)
async def create_job(
    payload: ImportJobCreate,
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """Create a new menu import job. It will be picked up by the background worker."""
    job = ImportJob(
        restaurant_name=payload.restaurant_name.strip(),
        location_hint=payload.location_hint.strip() if payload.location_hint else None,
        website_override=payload.website_override.strip() if payload.website_override else None,
        status="QUEUED",
        progress=0,
        current_step="Queued",
        created_by=user.get("sub", ""),
        logs="[]",
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.get("/jobs", response_model=List[ImportJobRead])
async def list_jobs(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, le=200),
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """List all import jobs, newest first. Optionally filter by status."""
    query = select(ImportJob).order_by(col(ImportJob.created_at).desc()).limit(limit)
    if status_filter:
        allowed = {"QUEUED", "RUNNING", "NEEDS_INPUT", "FAILED", "COMPLETED", "CANCELED"}
        if status_filter.upper() in allowed:
            query = query.where(ImportJob.status == status_filter.upper())
    jobs = session.exec(query).all()
    return jobs


@router.get("/jobs/{job_id}", response_model=ImportJobRead)
async def get_job(
    job_id: uuid.UUID,
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """Get full details of a specific import job."""
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=ImportJobRead)
async def cancel_job(
    job_id: uuid.UUID,
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """Cancel a QUEUED or RUNNING job."""
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("QUEUED", "RUNNING"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status '{job.status}'. Only QUEUED or RUNNING jobs can be canceled.",
        )
    job.status = "CANCELED"
    job.finished_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()

    # Append cancel log
    try:
        logs = json.loads(job.logs or "[]")
    except (json.JSONDecodeError, TypeError):
        logs = []
    logs.append({"time": datetime.utcnow().isoformat(), "message": "Job canceled by admin"})
    job.logs = json.dumps(logs)

    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.post("/jobs/{job_id}/retry", response_model=ImportJobRead)
async def retry_job(
    job_id: uuid.UUID,
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """Retry a FAILED, CANCELED, or NEEDS_INPUT job by resetting it to QUEUED."""
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("FAILED", "CANCELED", "NEEDS_INPUT", "COMPLETED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot retry job with status '{job.status}'. Only FAILED, CANCELED, NEEDS_INPUT, or COMPLETED jobs can be retried.",
        )
    job.status = "QUEUED"
    job.progress = 0
    job.current_step = "Queued (retry)"
    job.error_message = None
    job.started_at = None
    job.finished_at = None
    job.updated_at = datetime.utcnow()

    # Append retry log
    try:
        logs = json.loads(job.logs or "[]")
    except (json.JSONDecodeError, TypeError):
        logs = []
    logs.append({"time": datetime.utcnow().isoformat(), "message": "Job retried by admin"})
    job.logs = json.dumps(logs)

    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.get("/jobs/{job_id}/download")
async def download_zip(
    job_id: uuid.UUID,
    session: Session = SessionDep,
    user: dict = AdminDep,
):
    """Download the result zip file for a completed job."""
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "COMPLETED" or not job.result_zip_key:
        raise HTTPException(status_code=400, detail="Job has no downloadable result")

    data = get_zip_data(job.result_zip_key)
    if not data:
        raise HTTPException(status_code=404, detail="Zip file not found in storage")

    filename = f"{slugify(job.restaurant_name)}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
        },
    )
