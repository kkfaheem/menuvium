import uuid
import os
import boto3
from botocore.exceptions import ClientError
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from database import get_session
from models import Item, Category, Menu, ItemPhoto, Organization, ItemCreate, ItemUpdate, ItemRead, DietaryTag, Allergen
from dependencies import get_current_user

router = APIRouter(prefix="/items", tags=["items"])
SessionDep = Depends(get_session)
UserDep = Depends(get_current_user)

class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str

class PresignedUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    public_url: str

@router.post("/upload-url", response_model=PresignedUrlResponse)
def generate_upload_url(req: PresignedUrlRequest, user: dict = UserDep):
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        # Fallback for local dev if no bucket - maybe just return a dummy URL or error
        # For now, let's error if strictly needed, or handle mock mode
        if os.getenv("AUTH_MODE") == "MOCK":
             # Mock upload flow
             key = f"mock/{uuid.uuid4()}-{req.filename}"
             return {
                 "upload_url": "http://localhost:8000/mock-upload", # We'd need to mock this too
                 "s3_key": key,
                 "public_url": f"https://mock-s3.com/{key}"
             }
        raise HTTPException(status_code=500, detail="S3 configuration missing")

    s3_client = boto3.client('s3')
    
    # Generate unique key: org_id/items/uuid-filename ?? 
    # specific structure: items/{uuid}-{filename}
    key = f"items/{uuid.uuid4()}-{req.filename}"
    
    try:
        response = s3_client.generate_presigned_url('put_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': key,
                                                            'ContentType': req.content_type},
                                                    ExpiresIn=3600)
    except ClientError as e:
        print(e)
        raise HTTPException(status_code=500, detail="Could not generate upload URL")

    return {
        "upload_url": response,
        "s3_key": key,
        "public_url": f"https://{bucket_name}.s3.amazonaws.com/{key}"
    }

@router.post("/", response_model=ItemRead)
def create_item(item_in: ItemCreate, session: Session = SessionDep, user: dict = UserDep):
    # Authz check
    category = session.get(Category, item_in.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    menu = session.get(Menu, category.menu_id)
    menu = session.get(Menu, category.menu_id)
    # Fix: Traverse via location
    from models import Location
    location = session.get(Location, menu.location_id)
    org = session.get(Organization, location.org_id)
    
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Create Item
    item = Item.model_validate(item_in)
    session.add(item)
    
    # Link Tags
    if item_in.dietary_tag_ids:
        for tag_id in item_in.dietary_tag_ids:
            tag = session.get(DietaryTag, tag_id)
            if tag:
                item.dietary_tags.append(tag)
    
    # Link Allergens
    if item_in.allergen_ids:
        for alg_id in item_in.allergen_ids:
            alg = session.get(Allergen, alg_id)
            if alg:
                item.allergens.append(alg)

    session.commit()
    session.refresh(item)
    return item

@router.post("/{item_id}/photos", response_model=ItemPhoto)
def add_item_photo(item_id: uuid.UUID, photo: ItemPhoto, session: Session = SessionDep, user: dict = UserDep):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Verify ownership
    category = session.get(Category, item.category_id)
    menu = session.get(Menu, category.menu_id)
    category = session.get(Category, item.category_id)
    menu = session.get(Menu, category.menu_id)
    from models import Location
    location = session.get(Location, menu.location_id)
    org = session.get(Organization, location.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    photo.item_id = item_id
    session.add(photo)
    session.commit()
    session.refresh(photo)
    return photo

@router.patch("/{item_id}", response_model=ItemRead)
def update_item(item_id: uuid.UUID, item_update: ItemUpdate, session: Session = SessionDep, user: dict = UserDep):
    db_item = session.get(Item, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    from models import Location
    location = session.get(Location, menu.location_id)
    org = session.get(Organization, location.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    item_data = item_update.model_dump(exclude_unset=True)
    
    # Update scalar fields
    for key, value in item_data.items():
        if key not in ["dietary_tag_ids", "allergen_ids"]:
            setattr(db_item, key, value)
    
    # Update Relationships if provided
    if item_update.dietary_tag_ids is not None:
        db_item.dietary_tags = [] # Clear existing
        for tag_id in item_update.dietary_tag_ids:
            tag = session.get(DietaryTag, tag_id)
            if tag:
                db_item.dietary_tags.append(tag)
                
    if item_update.allergen_ids is not None:
        db_item.allergens = [] # Clear existing
        for alg_id in item_update.allergen_ids:
            alg = session.get(Allergen, alg_id)
            if alg:
                db_item.allergens.append(alg)
        
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item

@router.delete("/{item_id}")
def delete_item(item_id: uuid.UUID, session: Session = SessionDep, user: dict = UserDep):
    db_item = session.get(Item, item_id)
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")

    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    category = session.get(Category, db_item.category_id)
    menu = session.get(Menu, category.menu_id)
    from models import Location
    location = session.get(Location, menu.location_id)
    org = session.get(Organization, location.org_id)
    if org.owner_id != user["sub"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    session.delete(db_item)
    session.commit()
    return {"ok": True}
