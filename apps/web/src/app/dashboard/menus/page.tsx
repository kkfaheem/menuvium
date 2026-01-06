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
import type { Menu, Organization, OrgPermissions } from "@/types";

export default function MenusPage() {
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);

    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>("");
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);

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
            fetchPermissions();
        }
    }, [selectedOrg]);

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
                return;
            }
            const orgs = (await orgRes.json()) as Organization[];
            const userSub = getJwtSub(token);
            const isAdminMode = mode === "admin";
            const visibleOrgs = isAdminMode && userSub ? orgs.filter((org) => org.owner_id === userSub) : orgs;

            if (visibleOrgs.length === 0) {
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

    const fetchPermissions = async () => {
        if (!selectedOrg) return;
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const perms = await fetchOrgPermissions({ apiBase, token, orgId: selectedOrg });
            setOrgPermissions(perms);
        } catch (e) {
            console.error(e);
            setOrgPermissions(null);
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
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !menus.length && !selectedOrg) return <div className="text-[var(--cms-muted)]">Loading context...</div>;

    const isManager = mode === "manager";
    const canCreateMenu = mode === "admin" && Boolean(orgPermissions?.can_manage_menus);

    if (!loading && organizations.length === 0) {
        return (
            <div className="max-w-2xl space-y-6">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Menus</h1>
                    <p className="text-[var(--cms-muted)]">
                        {isManager
                            ? "You don’t have access to any companies yet."
                            : "Create your first company to start building menus."}
                    </p>
                </header>

                <div className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                            <p className="text-sm text-[var(--cms-muted)]">
                                {isManager
                                    ? "Ask an admin to invite your email under Team & permissions. Once invited, you’ll see your assigned menus here."
                                    : "Finish onboarding to create a company and your first menu."}
                            </p>
                        </div>
                        <button
                            onClick={() => router.push("/dashboard/mode")}
                            className="shrink-0 text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] underline underline-offset-4"
                        >
                            Switch mode
                        </button>
                    </div>

                    {!isManager && (
                        <button
                            onClick={() => router.push("/onboarding")}
                            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--cms-text)] px-5 py-3 font-semibold text-[var(--cms-bg)] hover:opacity-90"
                        >
                            Continue onboarding <ArrowRight className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div>
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-1">Menus</h1>
                    <p className="text-[var(--cms-muted)]">Manage your restaurant's menus.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {organizations.length > 0 && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            <span className="text-sm text-[var(--cms-muted)]">Company</span>
                            <div className="relative w-full sm:w-auto">
                                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--cms-muted)]">
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => setSelectedOrg(e.target.value)}
                                    className="w-full appearance-none bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-full pl-10 pr-10 py-2 text-sm text-[var(--cms-text)] focus:outline-none focus:border-[var(--cms-text)] transition-colors sm:min-w-[220px]"
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
                    {canCreateMenu && (
                        <Link
                            href="/dashboard/menus/new"
                            className="bg-[var(--cms-text)] text-[var(--cms-bg)] px-4 py-2 rounded-lg font-bold hover:opacity-90 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                        >
                            Create Menu
                        </Link>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                {menus.map(menu => (
                    <Link
                        key={menu.id}
                        href={`/dashboard/menus/${menu.id}`}
                        className={`group block bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6 transition-all hover:scale-[1.02] ${menu.is_active ? 'hover:bg-[var(--cms-panel-strong)]' : 'opacity-70 hover:opacity-90'}`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-full bg-[var(--cms-pill)] flex items-center justify-center text-[var(--cms-text)] font-bold text-xl">
                                {menu.name[0]}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`px-2 py-1 rounded text-xs font-bold ${menu.is_active ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]'}`}>
                                    {menu.is_active ? 'ACTIVE' : 'INACTIVE'}
                                </div>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold mb-1 group-hover:text-[var(--cms-text)] transition-colors">{menu.name}</h3>

                    </Link>
                ))}
            </div>
        </div>
    );
}
