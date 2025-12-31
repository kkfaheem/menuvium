from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from typing import List, Annotated
import uuid

from database import get_session
from models import Organization, Location
from dependencies import get_current_user

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
    # Simple query for now
    statement = select(Organization).where(Organization.owner_id == user_id)
    results = session.exec(statement).all()
    return results

@router.post("/{org_id}/locations", response_model=Location)
def create_location(org_id: uuid.UUID, location: Location, session: SessionDep, user: UserDep):
    user_id = user["sub"]
    
    # Verify org belongs to user
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to add location to this organization")
    
    location.org_id = org_id
    session.add(location)
    session.commit()
    session.refresh(location)
    session.refresh(location)
    return location

@router.get("/{org_id}/locations", response_model=List[Location])
def list_locations(org_id: uuid.UUID, session: SessionDep, user: UserDep):
    user_id = user["sub"]
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Eager load not strictly needed if we just filter by org_id on Location table
    statement = select(Location).where(Location.org_id == org_id)
    results = session.exec(statement).all()
    return results
