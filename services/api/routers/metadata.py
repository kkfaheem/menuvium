from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import DietaryTag, Allergen

router = APIRouter(prefix="/metadata", tags=["metadata"])
SessionDep = Depends(get_session)

@router.get("/dietary-tags", response_model=List[DietaryTag])
def list_dietary_tags(session: Session = SessionDep):
    tags = session.exec(select(DietaryTag)).all()
    # Seed if empty?
    if not tags:
        seed_tags = ["Vegan", "Vegetarian", "Gluten-Free", "Spicy", "Nut-Free"]
        for t in seed_tags:
            tag = DietaryTag(name=t)
            session.add(tag)
        session.commit()
        tags = session.exec(select(DietaryTag)).all()
    return tags

@router.get("/allergens", response_model=List[Allergen])
def list_allergens(session: Session = SessionDep):
    allergens = session.exec(select(Allergen)).all()
    if not allergens:
        seed_allergens = ["Peanuts", "Tree Nuts", "Milk", "Egg", "Wheat", "Soy", "Fish", "Shellfish"]
        for a in seed_allergens:
            al = Allergen(name=a)
            session.add(al)
        session.commit()
        allergens = session.exec(select(Allergen)).all()
    return allergens
