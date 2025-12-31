import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database import get_session
from models import Menu, Organization, MenuRead
from dependencies import get_current_user

router = APIRouter(prefix="/menus", tags=["menus"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

@router.post("/", response_model=Menu)
def create_menu(menu: Menu, session: Session = SessionDep, user: dict = UserDep):
    user_id = user["sub"]
    
    # Check if location exists and belongs to user's org
    from models import Location
    location = session.get(Location, menu.location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
        
    org = session.get(Organization, location.org_id)
    print(f"DEBUG: create_menu user_id={user_id} loc_id={menu.location_id} loc={location} org={org}")
    if not org:
        print("DEBUG: Org not found via location.org_id")
        # raise HTTPException(status_code=404, detail="Organization not found") 
        # Wait, if I uncomment this, I can see if it matches. 
        # But earlier I thought it was 403.
        # Let's keep existing logic but add print.
    
    if not org or org.owner_id != user_id:
         raise HTTPException(status_code=403, detail="Not authorized for this location")

    # If slug is provided, check uniqueness within location? Or globally?
    # For now, let's keep slug unique per location or just generate if null
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
def list_menus(location_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    # Security: Ensure user owns org of the location
    from models import Location
    location = session.get(Location, location_id)
    if not location:
        # Return empty or error? Error is safer for debugging
        raise HTTPException(status_code=404, detail="Location not found")
        
    org = session.get(Organization, location.org_id)
    if not org or org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    menus = session.exec(select(Menu).where(Menu.location_id == location_id)).all()
    return menus

@router.get("/{menu_id}", response_model=Menu)
def get_menu(menu_id: uuid.UUID, session: Session = SessionDep):
    menu = session.get(Menu, menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")
    return menu

@router.patch("/{menu_id}", response_model=Menu)
def update_menu(menu_id: uuid.UUID, menu_update: Menu, session: Session = SessionDep, user: dict = UserDep):
    db_menu = session.get(Menu, menu_id)
    if not db_menu:
        raise HTTPException(status_code=404, detail="Menu not found")
        
    # Owner check
    from models import Location
    location = session.get(Location, db_menu.location_id)
    org = session.get(Organization, location.org_id)
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
    from models import Location
    location = session.get(Location, db_menu.location_id)
    org = session.get(Organization, location.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # TODO: Cascade delete items/categories? SQLModel might handle if configured, 
    # but strictly we should ensure cleanup.
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

    return menu
