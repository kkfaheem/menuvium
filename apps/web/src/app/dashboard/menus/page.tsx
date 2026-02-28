"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Building2, ChevronDown, ArrowRight } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { getCachedOrFetch, getCachedValue } from "@/lib/dashboardCache";
import type { Menu, Organization, OrgPermissions } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

type OrgCachePayload = {
    visibleOrgs: Organization[];
    hiddenByMode: boolean;
};

const ORG_CACHE_TTL_MS = 45_000;
const MENUS_CACHE_TTL_MS = 20_000;
const ORG_PERMISSIONS_CACHE_TTL_MS = 20_000;

export default function MenusPage() {
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);
    const [menusError, setMenusError] = useState<string | null>(null);
    const [orgError, setOrgError] = useState<string | null>(null);
    const [orgsHiddenByMode, setOrgsHiddenByMode] = useState(false);

    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>("");
    const [menusLoadedOrgId, setMenusLoadedOrgId] = useState<string | null>(null);
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const [modeReady, setModeReady] = useState(false);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setMode((localStorage.getItem("menuvium_user_mode") as "admin" | "manager" | null) || null);
        setModeReady(true);
    }, []);

    useEffect(() => {
        if (!user || !modeReady || !mode) return;
        void fetchOrganizations();
    }, [user, modeReady, mode]);

    useEffect(() => {
        if (selectedOrg) {
            void fetchMenus(selectedOrg);
            void fetchPermissions(selectedOrg);
        } else {
            setMenus([]);
            setMenusLoadedOrgId(null);
            setOrgPermissions(null);
        }
    }, [selectedOrg]);

    useEffect(() => {
        if (!selectedOrg || typeof window === "undefined") return;
        localStorage.setItem("menuvium_last_org_id", selectedOrg);
    }, [selectedOrg]);

    const applyOrganizations = (visibleOrgs: Organization[], hiddenByMode: boolean) => {
        setOrgsHiddenByMode(hiddenByMode);
        if (visibleOrgs.length === 0) {
            setOrganizations([]);
            setSelectedOrg("");
            setMenusLoadedOrgId(null);
            return;
        }

        const preferredOrgId =
            typeof window !== "undefined" ? localStorage.getItem("menuvium_last_org_id") : null;

        setOrganizations(visibleOrgs);
        setSelectedOrg((current) => {
            if (current && visibleOrgs.some((org) => org.id === current)) {
                return current;
            }
            if (preferredOrgId && visibleOrgs.some((org) => org.id === preferredOrgId)) {
                return preferredOrgId;
            }
            return visibleOrgs[0].id;
        });
    };

    const fetchOrganizations = async () => {
        if (!mode) return;

        setOrgError(null);
        setOrgsHiddenByMode(false);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const userSub = getJwtSub(token) || "unknown";
            const orgCacheKey = `dashboard:orgs:${mode}:${userSub}`;
            const cached = getCachedValue<OrgCachePayload>(orgCacheKey, ORG_CACHE_TTL_MS);

            if (!cached) {
                setLoading(true);
            } else {
                applyOrganizations(cached.visibleOrgs, cached.hiddenByMode);
                setLoading(false);
            }

            const { value: orgPayload } = await getCachedOrFetch<OrgCachePayload>(
                orgCacheKey,
                async () => {
                    const orgRes = await fetch(`${apiBase}/organizations/`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!orgRes.ok) {
                        throw new Error("Failed to load organizations");
                    }
                    const orgs = (await orgRes.json()) as Organization[];
                    const isAdminMode = mode === "admin";
                    const visibleOrgs = isAdminMode ? orgs.filter((org) => org.owner_id === userSub) : orgs;
                    return {
                        visibleOrgs,
                        hiddenByMode: isAdminMode && orgs.length > 0 && visibleOrgs.length === 0,
                    };
                },
                ORG_CACHE_TTL_MS
            );

            applyOrganizations(orgPayload.visibleOrgs, orgPayload.hiddenByMode);
        } catch (e) {
            console.error(e);
            setOrganizations([]);
            setSelectedOrg("");
            setMenusLoadedOrgId(null);
            setOrgError("Could not load companies. Please refresh and try again.");
        } finally {
            setLoading(false);
        }
    };

    const fetchPermissions = async (orgId: string) => {
        if (!orgId || mode !== "admin") {
            setOrgPermissions(null);
            return;
        }
        const permissionsCacheKey = `dashboard:org-perms:${orgId}`;
        const cachedPermissions = getCachedValue<OrgPermissions>(permissionsCacheKey, ORG_PERMISSIONS_CACHE_TTL_MS);
        if (cachedPermissions) {
            setOrgPermissions(cachedPermissions);
            return;
        }

        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const { value: perms } = await getCachedOrFetch<OrgPermissions>(
                permissionsCacheKey,
                () => fetchOrgPermissions({ apiBase, token, orgId }),
                ORG_PERMISSIONS_CACHE_TTL_MS
            );
            setOrgPermissions(perms);
        } catch (e) {
            console.error(e);
            setOrgPermissions(null);
        }
    };

    const fetchMenus = async (orgId: string) => {
        if (!orgId) return;

        setMenusError(null);
        const menusCacheKey = `dashboard:menus:${orgId}`;
        const cachedMenus = getCachedValue<Menu[]>(menusCacheKey, MENUS_CACHE_TTL_MS);
        if (cachedMenus) {
            setMenus(cachedMenus);
            setMenusLoadedOrgId(orgId);
            return;
        }

        setMenusLoadedOrgId(null);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const { value: data } = await getCachedOrFetch<Menu[]>(
                menusCacheKey,
                async () => {
                    const res = await fetch(`${apiBase}/menus/?org_id=${orgId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) {
                        throw new Error("Failed to load menus");
                    }
                    return (await res.json()) as Menu[];
                },
                MENUS_CACHE_TTL_MS
            );
            setMenus(data);
        } catch (e) {
            console.error(e);
            setMenus([]);
            setMenusError("Could not reach the API. Make sure the backend is running.");
        } finally {
            setMenusLoadedOrgId(orgId);
        }
    };

    const waitingForMenus = Boolean(selectedOrg) && menusLoadedOrgId !== selectedOrg;

    if (loading && !selectedOrg) return <div className="text-muted">Loading context...</div>;

    const isManager = mode === "manager";
    const canCreateMenu = mode === "admin" && Boolean(orgPermissions?.can_manage_menus);

    if (!loading && organizations.length === 0) {
        return (
            <div className="max-w-2xl space-y-6">
                <header className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight">Menus</h1>
                    <p className="text-muted">
                        {orgError
                            ? orgError
                            : orgsHiddenByMode
                                ? "You’re in Admin mode. Admin mode only shows companies you own."
                                : isManager
                                    ? "You don’t have access to any companies yet."
                                    : "Create your first company to start building menus."}
                    </p>
                </header>

                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle>No companies available</CardTitle>
                            <CardDescription>
                                {orgError
                                    ? "If you’re running locally, confirm the backend is running and you’re logged in."
                                    : orgsHiddenByMode
                                        ? "Switch to Manager mode to see companies you’ve been invited to."
                                        : isManager
                                            ? "Ask an admin to invite your email under Team & permissions."
                                            : "Finish onboarding to create a company and your first menu."}
                            </CardDescription>
                        </div>
                        <button
                            onClick={() => router.push("/dashboard/mode")}
                            className="shrink-0 text-sm font-semibold text-muted hover:text-foreground underline underline-offset-4"
                        >
                            Switch mode
                        </button>
                    </CardHeader>
                    {!isManager ? (
                        <CardContent className="pt-0">
                            <button
                                onClick={() => router.push("/onboarding")}
                                className="inline-flex items-center gap-2 rounded-xl bg-[var(--cms-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                            >
                                Continue onboarding <ArrowRight className="h-4 w-4" />
                            </button>
                        </CardContent>
                    ) : null}
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight">Menus</h1>
                    <p className="text-muted">Manage your restaurant's menus.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {organizations.length > 0 && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            <span className="text-sm font-semibold text-muted">Company</span>
                            <div className="relative w-full sm:w-auto">
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => setSelectedOrg(e.target.value)}
                                    className="h-10 w-full appearance-none rounded-xl border border-border bg-panel pl-10 pr-10 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] sm:min-w-[240px]"
                                >
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
                                    <ChevronDown className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    )}
                    {canCreateMenu && (
                        <Link
                            href={`/dashboard/menus/new?org_id=${encodeURIComponent(selectedOrg)}`}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 w-full sm:w-auto"
                        >
                            Create Menu
                        </Link>
                    )}
                </div>
            </header>

            {!loading && menusLoadedOrgId === selectedOrg && menus.length === 0 && selectedOrg && (
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle>No menus yet</CardTitle>
                            <CardDescription>
                                {menusError
                                    ? menusError
                                    : isManager
                                        ? "This company doesn’t have any menus assigned to you yet."
                                        : "Create your first menu for this company."}
                            </CardDescription>
                        </div>
                        {canCreateMenu ? (
                            <Link
                                href={`/dashboard/menus/new?org_id=${encodeURIComponent(selectedOrg)}`}
                                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                            >
                                Create menu
                            </Link>
                        ) : null}
                    </CardHeader>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {waitingForMenus
                    ? Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="rounded-2xl border border-border bg-panel p-6 shadow-sm">
                            <div className="h-12 w-12 rounded-2xl bg-pill animate-pulse" />
                            <div className="mt-4 h-6 w-32 rounded bg-pill animate-pulse" />
                            <div className="mt-2 h-4 w-20 rounded bg-pill animate-pulse" />
                        </div>
                    ))
                    : menus.map(menu => (
                        <Link
                            key={menu.id}
                            href={`/dashboard/menus/${menu.id}`}
                            className="group block rounded-2xl border border-border bg-panel p-6 shadow-sm transition-colors hover:bg-panelStrong"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pill text-lg font-bold text-foreground">
                                    {menu.name[0]}
                                </div>
                                <Badge variant={menu.is_active ? "success" : "outline"}>
                                    {menu.is_active ? "Active" : "Inactive"}
                                </Badge>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold tracking-tight group-hover:text-foreground">
                                {menu.name}
                            </h3>
                            <p className="mt-1 text-sm text-muted">Open editor</p>
                        </Link>
                    ))}
            </div>
        </div>
    );
}
