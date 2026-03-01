/**
 * Centralized API Client for Menuvium
 * Provides typed API functions with built-in auth and error handling
 */

import { getAuthToken } from "./authToken";
import { getApiBase } from "./apiBase";
import type {
    Menu,
    Category,
    Item,
    DietaryTag,
    Allergen,
    OrgPermissions,
    ItemFormData,
    UploadUrlResponse
} from "@/types";

// ============================================================================
// Error Handling
// ============================================================================

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public detail?: string
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let detail: string | undefined;
        try {
            const errorData = await response.json();
            detail = errorData.detail;
        } catch {
            // Ignore JSON parse errors
        }
        throw new ApiError(
            `API request failed with status ${response.status}`,
            response.status,
            detail
        );
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
}

// ============================================================================
// Request Helpers
// ============================================================================

interface RequestOptions {
    auth?: boolean;
    body?: unknown;
}

async function apiRequest<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
): Promise<T> {
    const { auth = true, body } = options;
    const apiBase = getApiBase();

    const headers: Record<string, string> = {};

    if (auth) {
        const token = await getAuthToken();
        headers["Authorization"] = `Bearer ${token}`;
    }

    if (body) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${apiBase}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    return handleResponse<T>(response);
}

// Convenience methods
const api = {
    get: <T>(path: string, auth = true) =>
        apiRequest<T>("GET", path, { auth }),

    post: <T>(path: string, body?: unknown, auth = true) =>
        apiRequest<T>("POST", path, { auth, body }),

    patch: <T>(path: string, body?: unknown, auth = true) =>
        apiRequest<T>("PATCH", path, { auth, body }),

    delete: <T>(path: string, auth = true) =>
        apiRequest<T>("DELETE", path, { auth })
};

// ============================================================================
// Menu API
// ============================================================================

export const menuApi = {
    /** Get a menu by ID (authenticated) */
    getById: (id: string) =>
        api.get<Menu>(`/menus/${id}`),

    /** Get a public menu by ID/slug (unauthenticated) */
    getPublic: (id: string) =>
        api.get<Menu>(`/menus/public/${id}`, false),

    /** Update a menu */
    update: (id: string, data: Partial<Menu>) =>
        api.patch<Menu>(`/menus/${id}`, data),

    /** Delete a menu */
    delete: (id: string) =>
        api.delete<void>(`/menus/${id}`),

    /** Create a new menu */
    create: (data: { name: string; org_id: string }) =>
        api.post<Menu>("/menus/", data)
};

// ============================================================================
// Category API
// ============================================================================

export const categoryApi = {
    /** Get categories for a menu */
    getByMenuId: (menuId: string) =>
        api.get<Category[]>(`/categories/${menuId}`),

    /** Create a category */
    create: (data: { name: string; menu_id: string; rank: number }) =>
        api.post<Category>("/categories/", data),

    /** Update a category */
    update: (id: string, data: { id: string; name: string; rank: number; menu_id: string }) =>
        api.patch<Category>(`/categories/${id}`, data),

    /** Delete a category */
    delete: (id: string) =>
        api.delete<void>(`/categories/${id}`)
};

// ============================================================================
// Item API
// ============================================================================

export const itemApi = {
    /** Create a new item */
    create: (data: ItemFormData & { category_id: string }) =>
        api.post<Item>("/items/", data),

    /** Update an item */
    update: (id: string, data: Partial<ItemFormData>) =>
        api.patch<Item>(`/items/${id}`, data),

    /** Delete an item */
    delete: (id: string) =>
        api.delete<void>(`/items/${id}`),

    /** Get upload URL for item photo */
    getUploadUrl: (data: { filename: string; content_type: string }) =>
        api.post<UploadUrlResponse>("/items/upload-url", data),

    /** Upload a file to S3 using presigned URL */
    uploadToS3: async (uploadUrl: string, file: File) => {
        const response = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type }
        });
        if (!response.ok) {
            throw new ApiError("Failed to upload file", response.status);
        }
    },

    /** Add a photo to an item */
    addPhoto: (itemId: string, data: { s3_key: string; url: string }) =>
        api.post<void>(`/items/${itemId}/photos`, data),

    /** Delete item photos */
    deletePhotos: (itemId: string) =>
        api.delete<void>(`/items/${itemId}/photos`),

    /** Upload and attach a photo to an item */
    uploadPhoto: async (itemId: string, file: File) => {
        const { upload_url, s3_key, public_url } = await itemApi.getUploadUrl({
            filename: file.name,
            content_type: file.type
        });
        await itemApi.uploadToS3(upload_url, file);
        await itemApi.addPhoto(itemId, { s3_key, url: public_url });
        return { s3_key, public_url };
    }
};

// ============================================================================
// Metadata API
// ============================================================================

export const metadataApi = {
    /** Get all dietary tags */
    getDietaryTags: () =>
        api.get<DietaryTag[]>("/metadata/dietary-tags", false),

    /** Get all allergens */
    getAllergens: () =>
        api.get<Allergen[]>("/metadata/allergens", false),

    /** Create a dietary tag */
    createDietaryTag: (name: string) =>
        api.post<DietaryTag>("/metadata/dietary-tags", { name }),

    /** Create an allergen */
    createAllergen: (name: string) =>
        api.post<Allergen>("/metadata/allergens", { name }),

    /** Delete a dietary tag */
    deleteDietaryTag: (id: string) =>
        api.delete<void>(`/metadata/dietary-tags/${id}`),

    /** Delete an allergen */
    deleteAllergen: (id: string) =>
        api.delete<void>(`/metadata/allergens/${id}`)
};

// ============================================================================
// Organization API
// ============================================================================

export interface Organization {
    id: string;
    name: string;
    slug: string;
    owner_id?: string;
}

export const organizationApi = {
    /** Get all organizations for the current user */
    getAll: () =>
        api.get<Organization[]>("/organizations/"),

    /** Get a single organization */
    getById: (id: string) =>
        api.get<Organization>(`/organizations/${id}`),

    /** Get menus for an organization */
    getMenus: (orgId: string) =>
        api.get<Menu[]>(`/organizations/${orgId}/menus`),

    /** Get permissions for an organization */
    getPermissions: (orgId: string) =>
        api.get<OrgPermissions>(`/organizations/${orgId}/permissions`),

    /** Update an organization */
    update: (id: string, data: { name?: string; slug?: string }) =>
        api.patch<Organization>(`/organizations/${id}`, data),

    /** Delete an organization */
    delete: (id: string) =>
        api.delete<void>(`/organizations/${id}`)
};

// ============================================================================
// Default Export
// ============================================================================

export default {
    menu: menuApi,
    category: categoryApi,
    item: itemApi,
    metadata: metadataApi,
    organization: organizationApi
};

// ============================================================================
// Admin API
// ============================================================================

export interface AdminAnalytics {
    total_organizations: number;
    total_menus: number;
    total_items: number;
    total_jobs: number;
}

export interface AdminOrganization {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    created_at: string;
    menu_count: number;
    member_count: number;
}

export interface AdminJob {
    id: string;
    restaurant_name: string;
    status: string;
    progress: number;
    current_step: string | null;
    created_at: string;
    started_at?: string;
    finished_at?: string;
}

export const adminApi = {
    getAnalytics: () => api.get<AdminAnalytics>("/admin/analytics"),
    getOrganizations: (page = 1, size = 20) => api.get<{ items: AdminOrganization[], total: number, page: number, size: number }>(`/admin/organizations?page=${page}&size=${size}`),
    getJobs: (page = 1, size = 20) => api.get<{ items: AdminJob[], total: number, page: number, size: number }>(`/admin/jobs?page=${page}&size=${size}`),
    getJobDetails: (id: string) => api.get<any>(`/admin/jobs/${id}`),
};
