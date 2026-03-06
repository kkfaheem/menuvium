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

export interface VisibilityRule {
  id?: string;
  kind: "include" | "exclude";
  days_of_week: number[];
  start_time_local: string;
  end_time_local: string;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  priority: number;
}

export interface ItemOption {
  id?: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  badge?: string | null;
  position: number;
  is_default: boolean;
  is_active: boolean;
  visibility_rules?: VisibilityRule[];
}

export interface ItemOptionGroup {
  id?: string;
  name: string;
  description?: string | null;
  selection_mode: "single" | "multiple";
  min_select: number;
  max_select?: number | null;
  display_style: "chips" | "list" | "cards";
  position: number;
  is_active: boolean;
  options: ItemOption[];
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
  ar_status?: "none" | "pending" | "processing" | "ready" | "failed";
  ar_error_message?: string | null;
  ar_video_url?: string | null;
  ar_model_glb_url?: string | null;
  ar_model_usdz_url?: string | null;
  ar_model_poster_url?: string | null;
  ar_created_at?: string;
  ar_updated_at?: string;
  ar_stage?: string | null;
  ar_stage_detail?: string | null;
  ar_progress?: number | null; // 0.0 - 1.0
  option_groups?: ItemOptionGroup[];
  visibility_rules?: VisibilityRule[];
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
  /** Array of up to 3 uploaded logo URLs */
  logos?: (string | null)[];
  /** Index of the selected logo in the logos array, null/-1 = none */
  selectedLogoIndex?: number | null;
  /** How the logo appears in the header relative to menu name */
  logoPlacement?: "replace" | "left" | "above";
  /** Title font size in px (default ~20) */
  titleFontSize?: number;
}

export interface Menu {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
  theme?: string;
  timezone?: string;
  show_item_images?: boolean;
  banner_url?: string | null;
  logo_url?: string | null;
  logo_qr_url?: string | null;
  logo_qr_generated_at?: string | null;
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
  address?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_province?: string | null;
  country?: string | null;
  postal_code?: string | null;
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
  show_item_images?: boolean;
  banner_url?: string | null;
  logo_url?: string | null;
  logo_qr_url?: string | null;
  logo_qr_generated_at?: string | null;
  title_design_config?: TitleDesignConfig | null;
}
