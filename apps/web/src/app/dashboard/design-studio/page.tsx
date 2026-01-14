"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Building2, ChevronDown, Palette, ArrowRight, Loader2 } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import type { Menu, Organization } from "@/types";

export default function DesignStudioPage() {
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>("");
    const [selectedMenu, setSelectedMenu] = useState<string>("");
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setMode((localStorage.getItem("menuvium_user_mode") as "admin" | "manager" | null) || null);
    }, []);

    useEffect(() => {
        fetchOrganizations();
    }, [user, mode]);

    useEffect(() => {
        if (selectedOrg) {
            fetchMenus();
        }
    }, [selectedOrg]);

    // Auto-navigate when menu is selected
    useEffect(() => {
        if (selectedMenu) {
            router.push(`/dashboard/menus/${selectedMenu}/themes`);
        }
    }, [selectedMenu, router]);

    // Persist last selected org
    useEffect(() => {
        if (!selectedOrg || typeof window === "undefined") return;
        localStorage.setItem("menuvium_last_org_id", selectedOrg);
    }, [selectedOrg]);

    const fetchOrganizations = async () => {
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const orgRes = await fetch(`${apiBase}/organizations/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!orgRes.ok) {
                setOrganizations([]);
                setSelectedOrg("");
                return;
            }
            const orgs = (await orgRes.json()) as Organization[];
            const userSub = getJwtSub(token);
            const isAdminMode = mode === "admin";
            const visibleOrgs = isAdminMode && userSub ? orgs.filter((org) => org.owner_id === userSub) : orgs;

            if (visibleOrgs.length === 0) {
                setOrganizations([]);
                setSelectedOrg("");
                return;
            }
            const preferredOrgId =
                typeof window !== "undefined" ? localStorage.getItem("menuvium_last_org_id") : null;

            setOrganizations(visibleOrgs);
            if (visibleOrgs.length > 0) {
                const preferredOrg = preferredOrgId
                    ? visibleOrgs.find((org) => org.id === preferredOrgId)
                    : null;
                setSelectedOrg(preferredOrg ? preferredOrg.id : visibleOrgs[0].id);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchMenus = async () => {
        if (!selectedOrg) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/?org_id=${selectedOrg}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMenus(data);
                return;
            }
            setMenus([]);
        } catch (e) {
            console.error(e);
            setMenus([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !organizations.length) {
        return (
            <div className="text-[var(--cms-muted)] flex items-center gap-2">
                <Loader2 className="animate-spin w-5 h-5" /> Loading...
            </div>
        );
    }

    const hasNoOrgs = !loading && organizations.length === 0;
    const hasNoMenus = !loading && selectedOrg && menus.length === 0;

    return (
        <div className="max-w-3xl space-y-8">
            <header className="space-y-2">
                <div className="inline-flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <Palette className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Design Studio</h1>
                        <p className="text-sm text-[var(--cms-muted)]">
                            Customize your menu's branding and visual theme.
                        </p>
                    </div>
                </div>
            </header>

            {hasNoOrgs ? (
                <div className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                        <Building2 className="w-8 h-8 text-[var(--cms-muted)]" />
                    </div>
                    <p className="text-lg font-semibold mb-2">No companies found</p>
                    <p className="text-sm text-[var(--cms-muted)]">
                        Create a company first to start designing your menus.
                    </p>
                </div>
            ) : (
                <div className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-6 space-y-6">
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold">Select a Menu to Customize</h2>
                        <p className="text-sm text-[var(--cms-muted)]">
                            Choose the menu you want to customize with branding and themes.
                        </p>
                    </div>

                    {/* Organization Selector */}
                    {organizations.length > 1 && (
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-[var(--cms-muted)]">Company</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--cms-muted)]">
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => {
                                        setSelectedOrg(e.target.value);
                                        setSelectedMenu("");
                                    }}
                                    className="w-full appearance-none bg-[var(--cms-bg)] border border-[var(--cms-border)] rounded-xl pl-10 pr-10 py-3 text-sm text-[var(--cms-text)] focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                                >
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--cms-muted)]">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Menu Selector */}
                    {hasNoMenus ? (
                        <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-6 text-center">
                            <p className="text-sm text-[var(--cms-muted)]">
                                No menus found for this company. Create a menu first.
                            </p>
                            <button
                                onClick={() => router.push(`/dashboard/menus/new?org_id=${encodeURIComponent(selectedOrg)}`)}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--cms-text)] px-5 py-2.5 text-sm font-semibold text-[var(--cms-bg)] hover:opacity-90"
                            >
                                Create Menu <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-[var(--cms-muted)]">Menu</label>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {menus.map(menu => (
                                    <button
                                        key={menu.id}
                                        onClick={() => setSelectedMenu(menu.id)}
                                        className="group flex items-center gap-4 p-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-bg)] hover:border-[var(--cms-text)] hover:bg-[var(--cms-pill)] transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[var(--cms-pill)] flex items-center justify-center text-[var(--cms-text)] font-bold text-lg group-hover:bg-[var(--cms-panel)]">
                                            {menu.name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate">{menu.name}</p>
                                            <p className="text-xs text-[var(--cms-muted)]">
                                                {menu.is_active ? 'Active' : 'Inactive'}
                                            </p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] group-hover:translate-x-1 transition-all" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
