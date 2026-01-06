import type { OrgPermissions } from "@/types";

// Re-export for convenience
export type { OrgPermissions } from "@/types";

export const FULL_PERMISSIONS: OrgPermissions = {
    is_owner: true,
    can_view: true,
    can_manage_availability: true,
    can_edit_items: true,
    can_manage_menus: true,
    can_manage_users: true
};

export async function fetchOrgPermissions(args: {
    apiBase: string;
    token: string;
    orgId: string;
}): Promise<OrgPermissions> {
    const res = await fetch(`${args.apiBase}/organizations/${args.orgId}/permissions`, {
        headers: { Authorization: `Bearer ${args.token}` }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load permissions");
    }
    return res.json();
}

