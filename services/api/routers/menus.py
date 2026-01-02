import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select, delete
from sqlalchemy.orm import selectinload
from database import get_session
from models import (
    Menu,
    Organization,
    MenuRead,
    MenuUpdate,
    Category,
    Item,
    ItemPhoto,
    ItemDietaryTagLink,
    ItemAllergenLink,
)
from dependencies import get_current_user

router = APIRouter(prefix="/menus", tags=["menus"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

@router.post("/", response_model=Menu)
def create_menu(menu: Menu, session: Session = SessionDep, user: dict = UserDep):
    user_id = user["sub"]
    
    org = session.get(Organization, menu.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this organization")

    # If slug is provided, check uniqueness globally for now.
    if menu.slug:
        existing = session.exec(select(Menu).where(Menu.slug == menu.slug)).first()
        if existing:
            # simple slug check, might want to scope by org eventually
            raise HTTPException(status_code=400, detail="Menu slug already taken")
    else:
        # Auto-generate internal slug
        menu.slug = str(uuid.uuid4())[:8]

    session.add(menu)
    session.commit()
    session.refresh(menu)
    return menu

@router.get("/", response_model=List[Menu])
def list_menus(org_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    menus = session.exec(select(Menu).where(Menu.org_id == org_id)).all()
    return menus

@router.get("/{menu_id}", response_model=Menu)
def get_menu(menu_id: uuid.UUID, session: Session = SessionDep):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    return menu

@router.patch("/{menu_id}", response_model=Menu)
def update_menu(menu_id: uuid.UUID, menu_update: MenuUpdate, session: Session = SessionDep, user: dict = UserDep):
    db_menu = session.get(Menu, menu_id)
    if not db_menu:
        raise HTTPException(status_code=404, detail="Menu not found")
        
    # Owner check
    org = session.get(Organization, db_menu.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    menu_data = menu_update.model_dump(exclude_unset=True)
    for key, value in menu_data.items():
        setattr(db_menu, key, value)

    session.add(db_menu)
    session.commit()
    session.refresh(db_menu)
    return db_menu

@router.delete("/{menu_id}")
def delete_menu(menu_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    db_menu = session.get(Menu, menu_id)
    if not db_menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Owner check
    org = session.get(Organization, db_menu.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    categories = session.exec(select(Category.id).where(Category.menu_id == menu_id)).all()
    category_ids = [row[0] if isinstance(row, tuple) else row for row in categories]
    if category_ids:
        item_ids = session.exec(select(Item.id).where(Item.category_id.in_(category_ids))).all()
        item_ids = [row[0] if isinstance(row, tuple) else row for row in item_ids]
        if item_ids:
            session.exec(delete(ItemPhoto).where(ItemPhoto.item_id.in_(item_ids)))
            session.exec(delete(ItemDietaryTagLink).where(ItemDietaryTagLink.item_id.in_(item_ids)))
            session.exec(delete(ItemAllergenLink).where(ItemAllergenLink.item_id.in_(item_ids)))
            session.exec(delete(Item).where(Item.id.in_(item_ids)))
        session.exec(delete(Category).where(Category.id.in_(category_ids)))

    session.delete(db_menu)
    session.commit()
    return {"ok": True}

@router.get("/public/{menu_id}", response_model=MenuRead)
def get_public_menu(menu_id: uuid.UUID, session: Session = SessionDep):
    # Fetch by ID now
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    
    # Check Active
    if not menu.is_active:
        raise HTTPException(status_code=404, detail="Menu is not active")

    categories = session.exec(
        select(Category)
        .where(Category.menu_id == menu_id)
        .order_by(Category.rank)
        .options(selectinload(Category.items))
    ).all()
    for cat in categories:
        cat.items = sorted(cat.items or [], key=lambda item: item.position)
    menu.categories = categories

    return menu
