/**
 * Shared type definitions for Menuvium
 * These types are used across the frontend and align with backend Pydantic schemas
 */

// Menu-related types
export interface DietaryTag {
    id: string;
    name: string;
    icon?: string;
}

export interface Allergen {
    id: string;
    name: string;
}

export interface ItemPhoto {
    url: string;
    s3_key?: string;
}

export interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_sold_out: boolean;
    position?: number;
    photo_url?: string;
    photos?: ItemPhoto[];
    dietary_tags?: DietaryTag[];
    allergens?: Allergen[];
}

export interface Category {
    id: string;
    name: string;
    rank?: number;
    menu_id?: string;
    items: Item[];
}

export interface TitleDesignConfig {
    enabled?: boolean;
    logoPosition?: "left" | "center" | "right";
    logoScale?: number;
    spacing?: {
        top: number;
        bottom: number;
        horizontal: number;
    };
    layout?: "logo-only" | "logo-with-text";
    textPosition?: "beside" | "below" | "none";
    dominantColors?: string[];
    recommendation?: string;
    generatedAt?: string;
    logoUrl?: string;
}

export interface Menu {
    id: string;
    name: string;
    slug: string;
    is_active?: boolean;
    theme?: string;
    banner_url?: string | null;
    logo_url?: string | null;
    title_design_config?: TitleDesignConfig | null;
    currency?: string;
    org_id?: string;
    categories: Category[];
}

// Organization types
export interface Organization {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
}

export interface OrgPermissions {
    is_owner: boolean;
    can_view: boolean;
    can_manage_availability: boolean;
    can_edit_items: boolean;
    can_manage_menus: boolean;
    can_manage_users: boolean;
}

export interface OrganizationMember {
    id: string;
    email: string;
    org_id: string;
    can_manage_availability: boolean;
    can_edit_items: boolean;
    can_manage_menus: boolean;
    can_manage_users: boolean;
}

// API Response types
export interface ApiError {
    detail: string;
}

export interface UploadUrlResponse {
    upload_url: string;
    s3_key: string;
    public_url: string;
}

// Form/Edit types
export interface ItemFormData extends Partial<Item> {
    categoryId?: string;
    dietary_tag_ids?: string[];
    allergen_ids?: string[];
}

export interface CategoryFormData {
    name: string;
    menu_id: string;
    rank?: number;
}

export interface MenuFormData {
    name: string;
    is_active?: boolean;
    theme?: string;
    banner_url?: string | null;
    logo_url?: string | null;
    title_design_config?: TitleDesignConfig | null;
}
