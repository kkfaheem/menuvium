from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Annotated

from database import get_session
from models import Organization
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
