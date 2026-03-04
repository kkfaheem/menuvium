"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Building2, ChevronDown, ArrowRight, QrCode, Copy, Check, ExternalLink, X } from "lucide-react";
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
    const [baseOrigin, setBaseOrigin] = useState("https://menuvium.com");
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrMenuId, setQrMenuId] = useState("");
    const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);

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

    useEffect(() => {
        if (typeof window === "undefined") return;
        setBaseOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        if (!isQrModalOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsQrModalOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isQrModalOpen]);

    useEffect(() => {
        if (!isQrModalOpen) return;
        if (menus.length === 0) {
            setIsQrModalOpen(false);
            setQrMenuId("");
            return;
        }
        if (!menus.some((menu) => menu.id === qrMenuId)) {
            const fallbackMenu = menus.find((menu) => menu.is_active) || menus[0];
            setQrMenuId(fallbackMenu.id);
        }
    }, [isQrModalOpen, menus, qrMenuId]);

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
    const canOpenQrModal = Boolean(selectedOrg) && !waitingForMenus && menus.length > 0;
    const selectedQrMenu = menus.find((menu) => menu.id === qrMenuId) || null;
    const publicMenuUrl = selectedQrMenu ? `${baseOrigin}/r/${selectedQrMenu.id}` : "";
    const qrImageUrl = selectedQrMenu
        ? `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(publicMenuUrl)}`
        : "";

    const openQrModal = () => {
        if (!menus.length) return;
        const defaultMenu = menus.find((menu) => menu.is_active) || menus[0];
        setQrMenuId(defaultMenu.id);
        setCopiedPublicUrl(false);
        setIsQrModalOpen(true);
    };

    const closeQrModal = () => {
        setIsQrModalOpen(false);
        setCopiedPublicUrl(false);
    };

    const copyQrPublicUrl = async () => {
        if (!publicMenuUrl) return;
        try {
            await navigator.clipboard.writeText(publicMenuUrl);
            setCopiedPublicUrl(true);
            setTimeout(() => setCopiedPublicUrl(false), 1800);
        } catch {
            setCopiedPublicUrl(false);
        }
    };

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
                    <button
                        type="button"
                        onClick={openQrModal}
                        disabled={!canOpenQrModal}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground transition-colors hover:bg-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 disabled:cursor-not-allowed disabled:opacity-60 w-full sm:w-auto"
                    >
                        <QrCode className="h-4 w-4" />
                        QR Code
                    </button>
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

            {isQrModalOpen && selectedQrMenu && (
                <div
                    className="fixed inset-0 cms-modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in motion-reduce:animate-none"
                    onClick={(event) => {
                        if (event.target === event.currentTarget) closeQrModal();
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="menu-qr-modal-title"
                        className="cms-modal-shell ring-1 ring-[var(--cms-border)] w-full max-w-xl rounded-[28px] max-h-[90vh] flex flex-col backdrop-blur-xl animate-fade-in-scale motion-reduce:animate-none"
                    >
                        <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex items-start justify-between border-b border-[var(--cms-border)] rounded-t-[28px]">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[var(--cms-muted)]">Publish</p>
                                <h2 id="menu-qr-modal-title" className="mt-1 text-xl font-bold tracking-tight">
                                    Menu QR Code
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeQrModal}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-panel-strong)] hover:text-[var(--cms-text)]"
                                aria-label="Close QR popup"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 pt-5 space-y-5 overflow-y-auto">
                            {menus.length > 1 ? (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-muted">Menu</label>
                                    <div className="relative">
                                        <select
                                            value={qrMenuId}
                                            onChange={(event) => {
                                                setQrMenuId(event.target.value);
                                                setCopiedPublicUrl(false);
                                            }}
                                            className="h-11 w-full appearance-none rounded-xl border border-border bg-panel pl-4 pr-10 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)]"
                                        >
                                            {menus.map((menu) => (
                                                <option key={menu.id} value={menu.id}>
                                                    {menu.name}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
                                            <ChevronDown className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="rounded-2xl border border-border bg-panelStrong p-5 flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={qrImageUrl}
                                    alt={`QR code for ${selectedQrMenu.name}`}
                                    className="h-64 w-64 max-w-full rounded-xl bg-white p-2"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-muted">Public URL</label>
                                <div className="flex items-center gap-2 rounded-xl border border-border bg-panelStrong px-3 py-2.5">
                                    <span className="truncate text-sm text-foreground">{publicMenuUrl}</span>
                                    <button
                                        type="button"
                                        onClick={copyQrPublicUrl}
                                        className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-pill hover:text-foreground"
                                        aria-label="Copy public URL"
                                    >
                                        {copiedPublicUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        {copiedPublicUrl ? "Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="cms-modal-footer p-6 pt-4 border-t border-[var(--cms-border)] flex flex-col gap-3 sm:flex-row sm:justify-end flex-shrink-0 rounded-b-[28px]">
                            <a
                                href={publicMenuUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground transition-colors hover:bg-pill"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Open Menu
                            </a>
                            <a
                                href={qrImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]"
                            >
                                <QrCode className="h-4 w-4" />
                                Open QR Image
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
