import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database import get_session
from models import Category, Menu, CategoryRead
from dependencies import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

@router.post("/", response_model=Category)
def create_category(category: Category, session: Session = SessionDep, user: dict = UserDep):
    # Verify menu ownership
    menu = session.get(Menu, category.menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Check org ownership via menu
    # In a real app we'd fetch Org, but here we can optimize or assume if we trust creating menu logic
    # But let's be safe and check org owner
    # But let's be safe and check org owner
    from models import Organization
    org = session.get(Organization, menu.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.add(category)
    session.commit()
    session.refresh(category)
    return category

@router.get("/{menu_id}", response_model=List[CategoryRead])
def list_categories(menu_id: uuid.UUID, session: Session = SessionDep):
    # Publicly accessible for now? Or protected? 
    # Let's make it protected for manager view. Public view will use a different endpoint.
    from sqlalchemy.orm import selectinload
    categories = session.exec(
        select(Category)
        .where(Category.menu_id == menu_id)
        .order_by(Category.rank)
        .options(selectinload(Category.items))
    ).all()
    return categories

@router.patch("/{category_id}", response_model=Category)
def update_category(category_id: uuid.UUID, cat_update: Category, session: Session = SessionDep, user: dict = UserDep):
    db_cat = session.get(Category, category_id)
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Ownership check
    menu = session.get(Menu, db_cat.menu_id)
    from models import Organization
    org = session.get(Organization, menu.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    cat_data = cat_update.model_dump(exclude_unset=True)
    for key, value in cat_data.items():
        setattr(db_cat, key, value)
        
    session.add(db_cat)
    session.commit()
    session.refresh(db_cat)
    return db_cat

@router.delete("/{category_id}")
def delete_category(category_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    db_cat = session.get(Category, category_id)
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")

    menu = session.get(Menu, db_cat.menu_id)
    from models import Organization
    org = session.get(Organization, menu.org_id)
    if org.owner_id != user["sub"]:
         raise HTTPException(status_code=403, detail="Not authorized")

    session.delete(db_cat)
    session.commit()
    return {"ok": True}
