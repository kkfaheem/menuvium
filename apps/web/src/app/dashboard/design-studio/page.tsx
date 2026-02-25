"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Building2, ChevronDown, Palette, ArrowRight, Loader2 } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import type { Menu, Organization } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

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
            <div className="text-muted flex items-center gap-2">
                <Loader2 className="animate-spin w-5 h-5" /> Loading...
            </div>
        );
    }

    const hasNoOrgs = !loading && organizations.length === 0;
    const hasNoMenus = !loading && selectedOrg && menus.length === 0;

    return (
        <div className="max-w-3xl space-y-8">
            <header className="space-y-2">
                <Badge variant="outline">Design</Badge>
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pill">
                        <Palette className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Design Studio</h1>
                        <p className="text-sm text-muted">Customize your menu's branding and visual theme.</p>
                    </div>
                </div>
            </header>

            {hasNoOrgs ? (
                <Card className="text-center">
                    <CardHeader>
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pill">
                            <Building2 className="h-7 w-7 text-muted" />
                        </div>
                        <CardTitle className="mt-2">No companies found</CardTitle>
                        <CardDescription>Create a company first to start designing your menus.</CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Select a menu</CardTitle>
                        <CardDescription>Choose the menu you want to customize with branding and themes.</CardDescription>
                    </CardHeader>

                    {/* Organization Selector */}
                    {organizations.length > 1 && (
                        <CardContent className="pt-0 space-y-2">
                            <label className="text-sm font-semibold text-muted">Company</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => {
                                        setSelectedOrg(e.target.value);
                                        setSelectedMenu("");
                                    }}
                                    className="h-11 w-full appearance-none rounded-xl border border-border bg-panel pl-10 pr-10 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)]"
                                >
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </CardContent>
                    )}

                    {/* Menu Selector */}
                    <CardContent className="pt-0">
                        {hasNoMenus ? (
                            <div className="rounded-2xl border border-dashed border-border bg-panelStrong p-6 text-center">
                                <p className="text-sm text-muted">No menus found for this company. Create a menu first.</p>
                                <button
                                    onClick={() => router.push(`/dashboard/menus/new?org_id=${encodeURIComponent(selectedOrg)}`)}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--cms-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                >
                                    Create menu <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-muted">Menu</label>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {menus.map(menu => (
                                        <button
                                            key={menu.id}
                                            onClick={() => setSelectedMenu(menu.id)}
                                            className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-panelStrong p-4 text-left transition-colors hover:bg-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/25"
                                        >
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pill text-base font-bold">
                                                {menu.name[0]}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold">{menu.name}</p>
                                                <p className="mt-0.5 text-xs text-muted">{menu.is_active ? "Active" : "Inactive"}</p>
                                            </div>
                                            <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
