import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import UniqueConstraint, Column, JSON, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import SQLModel, Field, Relationship

class Organization(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    owner_id: str = Field(index=True) # Cognito sub
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    menus: List["Menu"] = Relationship(back_populates="organization")
    members: List["OrganizationMember"] = Relationship(back_populates="organization")


class OrganizationMemberBase(SQLModel):
    org_id: uuid.UUID = Field(foreign_key="organization.id", index=True)
    email: str = Field(index=True)
    can_manage_availability: bool = Field(default=False)
    can_edit_items: bool = Field(default=False)
    can_manage_menus: bool = Field(default=False)
    can_manage_users: bool = Field(default=False)


class OrganizationMember(OrganizationMemberBase, table=True):
    __table_args__ = (UniqueConstraint("org_id", "email"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    organization: Optional["Organization"] = Relationship(back_populates="members")


# Base Models
class MenuBase(SQLModel):
    name: str
    slug: Optional[str] = Field(default=None, index=True) # Optional now, mostly for internal display
    is_active: bool = Field(default=True)
    theme: str = Field(default="noir")
    show_item_images: bool = Field(default=True)  # Whether to show item images on public page
    banner_url: Optional[str] = None
    logo_url: Optional[str] = None
    title_design_config: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
    org_id: uuid.UUID = Field(foreign_key="organization.id", index=True)

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
    
    organization: Optional["Organization"] = Relationship(back_populates="menus")
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
    ar_status: Optional[str] = Field(default=None, index=True)
    ar_error_message: Optional[str] = None
    ar_luma_capture_id: Optional[str] = None
    ar_created_at: Optional[datetime] = None
    ar_updated_at: Optional[datetime] = None
    ar_stage: Optional[str] = None
    ar_stage_detail: Optional[str] = None
    ar_progress: Optional[float] = None
    ar_job_id: Optional[uuid.UUID] = Field(default=None, index=True)
    ar_video_s3_key: Optional[str] = None
    ar_video_url: Optional[str] = None
    ar_model_glb_s3_key: Optional[str] = None
    ar_model_glb_url: Optional[str] = None
    ar_model_usdz_s3_key: Optional[str] = None
    ar_model_usdz_url: Optional[str] = None
    ar_model_poster_s3_key: Optional[str] = None
    ar_model_poster_url: Optional[str] = None
    
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

class DietaryTagRead(DietaryTagBase):
    id: uuid.UUID

class AllergenRead(AllergenBase):
    id: uuid.UUID

class ItemRead(ItemBase):
    id: uuid.UUID
    dietary_tags: List[DietaryTagRead] = []
    allergens: List[AllergenRead] = []
    photos: List[ItemPhotoBase] = []
    ar_status: Optional[str] = None
    ar_error_message: Optional[str] = None
    ar_video_url: Optional[str] = None
    ar_model_glb_url: Optional[str] = None
    ar_model_usdz_url: Optional[str] = None
    ar_model_poster_url: Optional[str] = None
    ar_created_at: Optional[datetime] = None
    ar_updated_at: Optional[datetime] = None
    ar_stage: Optional[str] = None
    ar_stage_detail: Optional[str] = None
    ar_progress: Optional[float] = None

class CategoryRead(CategoryBase):
    id: uuid.UUID
    items: List[ItemRead] = []

class MenuRead(MenuBase):
    id: uuid.UUID
    categories: List[CategoryRead] = []

class MenuUpdate(SQLModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    theme: Optional[str] = None
    show_item_images: Optional[bool] = None
    banner_url: Optional[str] = None
    logo_url: Optional[str] = None
    title_design_config: Optional[dict] = None

class OrganizationUpdate(SQLModel):
    name: Optional[str] = None
    slug: Optional[str] = None


class OrganizationMemberCreate(SQLModel):
    email: str
    can_manage_availability: bool = False
    can_edit_items: bool = False
    can_manage_menus: bool = False
    can_manage_users: bool = False


class OrganizationMemberUpdate(SQLModel):
    email: Optional[str] = None
    can_manage_availability: Optional[bool] = None
    can_edit_items: Optional[bool] = None
    can_manage_menus: Optional[bool] = None
    can_manage_users: Optional[bool] = None


class OrganizationMemberRead(OrganizationMemberBase):
    id: uuid.UUID
    created_at: datetime


class OrgPermissionsRead(SQLModel):
    is_owner: bool
    can_view: bool
    can_manage_availability: bool
    can_edit_items: bool
    can_manage_menus: bool
    can_manage_users: bool


# ================== Menu Importer Job ==================


class ImportJob(SQLModel, table=True):
    __tablename__ = "importjob"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    restaurant_name: str
    location_hint: Optional[str] = None
    website_override: Optional[str] = None
    status: str = Field(default="QUEUED", index=True)
    progress: int = Field(default=0)
    current_step: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result_zip_key: Optional[str] = None
    error_message: Optional[str] = None
    logs: Optional[str] = Field(default="[]", sa_column=Column(Text))
    metadata_json: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
    created_by: str = Field(index=True)


class ImportJobCreate(SQLModel):
    restaurant_name: str
    location_hint: Optional[str] = None
    website_override: Optional[str] = None


class ImportJobRead(SQLModel):
    id: uuid.UUID
    restaurant_name: str
    location_hint: Optional[str] = None
    website_override: Optional[str] = None
    status: str
    progress: int
    current_step: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result_zip_key: Optional[str] = None
    error_message: Optional[str] = None
    logs: Optional[str] = None
    metadata_json: Optional[dict] = None
    created_by: str
