from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, delete
from pydantic import BaseModel
from database import get_session
from models import DietaryTag, Allergen, ItemDietaryTagLink, ItemAllergenLink

router = APIRouter(prefix="/metadata", tags=["metadata"])
SessionDep = Depends(get_session)

class DietaryTagCreate(BaseModel):
    name: str
    icon: str | None = None

class AllergenCreate(BaseModel):
    name: str

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

@router.post("/dietary-tags", response_model=DietaryTag, status_code=201)
def create_dietary_tag(payload: DietaryTagCreate, session: Session = SessionDep):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = session.exec(select(DietaryTag).where(DietaryTag.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    tag = DietaryTag(name=name, icon=payload.icon)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return tag

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

@router.post("/allergens", response_model=Allergen, status_code=201)
def create_allergen(payload: AllergenCreate, session: Session = SessionDep):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    existing = session.exec(select(Allergen).where(Allergen.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Allergen already exists")
    allergen = Allergen(name=name)
    session.add(allergen)
    session.commit()
    session.refresh(allergen)
    return allergen

@router.delete("/dietary-tags/{tag_id}", status_code=204)
def delete_dietary_tag(tag_id: str, session: Session = SessionDep):
    tag = session.get(DietaryTag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    session.exec(delete(ItemDietaryTagLink).where(ItemDietaryTagLink.tag_id == tag_id))
    session.delete(tag)
    session.commit()

@router.delete("/allergens/{allergen_id}", status_code=204)
def delete_allergen(allergen_id: str, session: Session = SessionDep):
    allergen = session.get(Allergen, allergen_id)
    if not allergen:
        raise HTTPException(status_code=404, detail="Allergen not found")
    session.exec(delete(ItemAllergenLink).where(ItemAllergenLink.allergen_id == allergen_id))
    session.delete(allergen)
    session.commit()
