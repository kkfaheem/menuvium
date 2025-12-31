import uuid
from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class Organization(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    owner_id: str = Field(index=True) # Cognito sub
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    locations: List["Location"] = Relationship(back_populates="organization")

class Location(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    org_id: uuid.UUID = Field(foreign_key="organization.id")
    name: str
    address: str
    phone: Optional[str] = None
    operating_hours: Optional[str] = None # Stores JSON string
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    organization: Organization = Relationship(back_populates="locations")
    menus: List["Menu"] = Relationship(back_populates="location")


# Base Models
class MenuBase(SQLModel):
    name: str
    slug: Optional[str] = Field(default=None, index=True) # Optional now, mostly for internal display
    is_active: bool = Field(default=True)
    location_id: uuid.UUID = Field(foreign_key="location.id", index=True)

class CategoryBase(SQLModel):
    name: str
    rank: int = Field(default=0)
    menu_id: uuid.UUID = Field(foreign_key="menu.id", index=True)

class ItemBase(SQLModel):
    name: str
    description: Optional[str] = None
    price: float
    is_sold_out: bool = Field(default=False)
    position: int = Field(default=0)
    category_id: uuid.UUID = Field(foreign_key="category.id", index=True)

class ItemPhotoBase(SQLModel):
    s3_key: str
    url: str
    item_id: uuid.UUID = Field(foreign_key="item.id", index=True)

class DietaryTagBase(SQLModel):
    name: str = Field(unique=True)
    icon: Optional[str] = None

class AllergenBase(SQLModel):
    name: str = Field(unique=True)

# Table Models
class Menu(MenuBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    location: Optional["Location"] = Relationship(back_populates="menus")
    categories: List["Category"] = Relationship(back_populates="menu")


class Category(CategoryBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    
    menu: Menu = Relationship(back_populates="categories")
    items: List["Item"] = Relationship(back_populates="category")

# Many-to-Many Link Models
class ItemDietaryTagLink(SQLModel, table=True):
    item_id: uuid.UUID = Field(foreign_key="item.id", primary_key=True)
    tag_id: uuid.UUID = Field(foreign_key="dietarytag.id", primary_key=True)

class ItemAllergenLink(SQLModel, table=True):
    item_id: uuid.UUID = Field(foreign_key="item.id", primary_key=True)
    allergen_id: uuid.UUID = Field(foreign_key="allergen.id", primary_key=True)

class DietaryTag(DietaryTagBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    items: List["Item"] = Relationship(back_populates="dietary_tags", link_model=ItemDietaryTagLink)

class Allergen(AllergenBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    items: List["Item"] = Relationship(back_populates="allergens", link_model=ItemAllergenLink)

class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    category: Category = Relationship(back_populates="items")
    photos: List["ItemPhoto"] = Relationship(back_populates="item")
    
    dietary_tags: List[DietaryTag] = Relationship(back_populates="items", link_model=ItemDietaryTagLink)
    allergens: List[Allergen] = Relationship(back_populates="items", link_model=ItemAllergenLink)

class ItemPhoto(ItemPhotoBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item: Item = Relationship(back_populates="photos")

# Pydantic Schemas for API
class ItemCreate(ItemBase):
    dietary_tag_ids: List[uuid.UUID] = []
    allergen_ids: List[uuid.UUID] = []

class ItemUpdate(SQLModel):
    category_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    is_sold_out: Optional[bool] = None
    position: Optional[int] = None
    dietary_tag_ids: Optional[List[uuid.UUID]] = None
    allergen_ids: Optional[List[uuid.UUID]] = None

class ItemRead(ItemBase):
    id: uuid.UUID
    dietary_tags: List[DietaryTagBase] = []
    allergens: List[AllergenBase] = []
    photos: List[ItemPhotoBase] = []

class CategoryRead(CategoryBase):
    id: uuid.UUID
    items: List[ItemRead] = []

class MenuRead(MenuBase):
    id: uuid.UUID
    categories: List[CategoryRead] = []
