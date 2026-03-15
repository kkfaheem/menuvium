import uuid
from datetime import date, datetime, time
from typing import Optional, List
from sqlalchemy import UniqueConstraint, Column, JSON, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import SQLModel, Field, Relationship

class Organization(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)
    owner_id: str = Field(index=True) # Cognito sub
    address: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    menus: List["Menu"] = Relationship(back_populates="organization")
    members: List["OrganizationMember"] = Relationship(back_populates="organization")


class OrganizationMemberBase(SQLModel):
    org_id: uuid.UUID = Field(foreign_key="organization.id", index=True)
    user_id: Optional[str] = Field(default=None, index=True) # Cognito sub
    email: str = Field(index=True)
    role: Optional[str] = Field(default="member") # owner, manager, member
    can_manage_availability: bool = Field(default=False)
    can_edit_items: bool = Field(default=False)
    can_manage_menus: bool = Field(default=False)
    can_manage_users: bool = Field(default=False)


class OrganizationMember(OrganizationMemberBase, table=True):
    __table_args__ = (UniqueConstraint("org_id", "email"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    organization: Optional["Organization"] = Relationship(back_populates="members")


class OrganizationOwnershipTransfer(SQLModel, table=True):
    org_id: uuid.UUID = Field(foreign_key="organization.id", index=True)
    requested_by_user_id: str = Field(index=True)
    requested_by_email: Optional[str] = Field(default=None, index=True)
    target_member_id: uuid.UUID = Field(foreign_key="organizationmember.id", index=True)
    target_user_id: Optional[str] = Field(default=None, index=True)
    target_email: str = Field(index=True)
    token_hash: str = Field(unique=True)
    status: str = Field(default="pending", index=True)  # pending, completed, cancelled, expired
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    target_read_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


# Base Models
class MenuBase(SQLModel):
    name: str
    slug: Optional[str] = Field(default=None, index=True) # Optional now, mostly for internal display
    is_active: bool = Field(default=True)
    theme: str = Field(default="noir")
    timezone: str = Field(default="UTC")
    show_item_images: bool = Field(default=True)  # Whether to show item images on public page
    banner_url: Optional[str] = None
    logo_url: Optional[str] = None
    logo_qr_url: Optional[str] = None
    logo_qr_generated_at: Optional[datetime] = None
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
    ar_provider: Optional[str] = Field(default=None, index=True)
    ar_capture_mode: Optional[str] = None
    ar_metadata_json: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
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
    option_groups: List["ItemOptionGroup"] = Relationship(
        back_populates="item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    visibility_rules: List["VisibilityRule"] = Relationship(
        back_populates="item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    ar_capture_assets: List["ArCaptureAsset"] = Relationship(
        back_populates="item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    ar_conversion_jobs: List["ArConversionJob"] = Relationship(
        back_populates="item",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    dietary_tags: List[DietaryTag] = Relationship(back_populates="items", link_model=ItemDietaryTagLink)
    allergens: List[Allergen] = Relationship(back_populates="items", link_model=ItemAllergenLink)

class ItemPhoto(ItemPhotoBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item: Item = Relationship(back_populates="photos")


class ArCaptureAsset(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", index=True)
    kind: str = Field(index=True)
    position: int = Field(default=0)
    s3_key: str
    url: str
    metadata_json: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)

    item: Optional["Item"] = Relationship(back_populates="ar_capture_assets")


class ArConversionJob(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: uuid.UUID = Field(foreign_key="item.id", index=True)
    status: str = Field(default="queued", index=True)
    error_message: Optional[str] = None
    usdz_s3_key: str
    usdz_url: str
    glb_s3_key: Optional[str] = None
    glb_url: Optional[str] = None
    attempts: int = Field(default=0)
    metadata_json: Optional[dict] = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    item: Optional["Item"] = Relationship(back_populates="ar_conversion_jobs")


class ItemOptionGroupBase(SQLModel):
    item_id: uuid.UUID = Field(foreign_key="item.id", index=True)
    name: str
    description: Optional[str] = None
    selection_mode: str = Field(default="single")  # single, multiple
    min_select: int = Field(default=0)
    max_select: Optional[int] = None
    display_style: str = Field(default="chips")  # chips, list, cards
    position: int = Field(default=0)
    is_active: bool = Field(default=True)


class ItemOptionBase(SQLModel):
    group_id: uuid.UUID = Field(foreign_key="itemoptiongroup.id", index=True)
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    badge: Optional[str] = None
    position: int = Field(default=0)
    is_default: bool = Field(default=False)
    is_active: bool = Field(default=True)


class VisibilityRuleBase(SQLModel):
    kind: str = Field(default="include")  # include, exclude
    days_of_week: List[int] = Field(
        default_factory=list,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql")),
    )
    start_time_local: time
    end_time_local: time
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = Field(default=True)


class ItemOptionGroup(ItemOptionGroupBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    item: Optional["Item"] = Relationship(back_populates="option_groups")
    options: List["ItemOption"] = Relationship(
        back_populates="group",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class ItemOption(ItemOptionBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    group: Optional[ItemOptionGroup] = Relationship(back_populates="options")
    visibility_rules: List["VisibilityRule"] = Relationship(
        back_populates="option",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class VisibilityRule(VisibilityRuleBase, table=True):
    __table_args__ = (
        CheckConstraint(
            "(item_id IS NOT NULL AND option_id IS NULL) OR (item_id IS NULL AND option_id IS NOT NULL)",
            name="ck_visibilityrule_single_target",
        ),
        CheckConstraint(
            "kind IN ('include', 'exclude')",
            name="ck_visibilityrule_kind",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    item_id: Optional[uuid.UUID] = Field(default=None, foreign_key="item.id", index=True)
    option_id: Optional[uuid.UUID] = Field(default=None, foreign_key="itemoption.id", index=True)

    item: Optional[Item] = Relationship(back_populates="visibility_rules")
    option: Optional[ItemOption] = Relationship(back_populates="visibility_rules")

# Pydantic Schemas for API
class VisibilityRuleInput(VisibilityRuleBase):
    pass


class ItemOptionInput(SQLModel):
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    badge: Optional[str] = None
    position: int = 0
    is_default: bool = False
    is_active: bool = True
    visibility_rules: List[VisibilityRuleInput] = []


class ItemOptionGroupInput(SQLModel):
    name: str
    description: Optional[str] = None
    selection_mode: str = "single"
    min_select: int = 0
    max_select: Optional[int] = None
    display_style: str = "chips"
    position: int = 0
    is_active: bool = True
    options: List[ItemOptionInput] = []


class ItemCreate(ItemBase):
    dietary_tag_ids: List[uuid.UUID] = []
    allergen_ids: List[uuid.UUID] = []
    option_groups: List[ItemOptionGroupInput] = []
    visibility_rules: List[VisibilityRuleInput] = []

class ItemUpdate(SQLModel):
    category_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    is_sold_out: Optional[bool] = None
    position: Optional[int] = None
    dietary_tag_ids: Optional[List[uuid.UUID]] = None
    allergen_ids: Optional[List[uuid.UUID]] = None
    option_groups: Optional[List[ItemOptionGroupInput]] = None
    visibility_rules: Optional[List[VisibilityRuleInput]] = None


class VisibilityRuleRead(VisibilityRuleBase):
    id: uuid.UUID


class ItemOptionRead(SQLModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    badge: Optional[str] = None
    position: int = 0
    is_default: bool = False
    is_active: bool = True
    visibility_rules: List[VisibilityRuleRead] = []


class ItemOptionGroupRead(SQLModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    selection_mode: str = "single"
    min_select: int = 0
    max_select: Optional[int] = None
    display_style: str = "chips"
    position: int = 0
    is_active: bool = True
    options: List[ItemOptionRead] = []

class DietaryTagRead(DietaryTagBase):
    id: uuid.UUID

class AllergenRead(AllergenBase):
    id: uuid.UUID

class ItemRead(ItemBase):
    id: uuid.UUID
    dietary_tags: List[DietaryTagRead] = []
    allergens: List[AllergenRead] = []
    photos: List[ItemPhotoBase] = []
    option_groups: List[ItemOptionGroupRead] = []
    visibility_rules: List[VisibilityRuleRead] = []
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
    timezone: Optional[str] = None
    show_item_images: Optional[bool] = None
    banner_url: Optional[str] = None
    logo_url: Optional[str] = None
    title_design_config: Optional[dict] = None

class OrganizationUpdate(SQLModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    address: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


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


class OwnershipTransferRequestCreate(SQLModel):
    member_id: uuid.UUID


class OwnershipTransferRequestRead(SQLModel):
    id: uuid.UUID
    target_member_id: uuid.UUID
    target_email: str
    status: str
    created_at: datetime
    expires_at: datetime


class OwnershipTransferVerifyRequest(SQLModel):
    token: str


class OwnershipTransferVerifyRead(SQLModel):
    ok: bool
    detail: str
    org_id: uuid.UUID
    org_name: str
    new_owner_email: str


class OwnershipTransferNotificationRead(SQLModel):
    id: uuid.UUID
    org_id: uuid.UUID
    org_name: str
    requested_by_email: Optional[str] = None
    target_email: str
    created_at: datetime
    expires_at: datetime
    is_read: bool


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
    org_id: Optional[uuid.UUID] = Field(default=None, foreign_key="organization.id", index=True)
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
    org_id: Optional[uuid.UUID] = None
    restaurant_name: str
    location_hint: Optional[str] = None
    website_override: Optional[str] = None


class ImportJobRead(SQLModel):
    id: uuid.UUID
    org_id: Optional[uuid.UUID] = None
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
