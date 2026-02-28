"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { getCachedOrFetch, getCachedValue } from "@/lib/dashboardCache";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

type OverviewData = {
    companyCount: number;
    menuCount: number;
    activeMenuCount: number;
    itemCount: number;
    recentMenus: { id: string; name: string; is_active: boolean }[];
};

const OVERVIEW_CACHE_TTL_MS = 20_000;

export default function DashboardPage() {
    const { user } = useAuthenticator(context => [context.user]);
    const [displayName, setDisplayName] = useState("");
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<OverviewData | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadOverview = async () => {
            if (!user) return;
            try {
                const apiBase = getApiBase();
                const token = await getAuthToken();
                const userSub = getJwtSub(token);
                const overviewCacheKey = `dashboard:overview:${userSub || "unknown"}`;
                const cached = getCachedValue<OverviewData>(overviewCacheKey, OVERVIEW_CACHE_TTL_MS);
                if (cached) {
                    if (!cancelled) {
                        setOverview(cached);
                        setLoading(false);
                    }
                    return;
                }

                if (!cancelled) {
                    setLoading(true);
                }

                const { value: nextOverview } = await getCachedOrFetch<OverviewData>(
                    overviewCacheKey,
                    async () => {
                        const orgRes = await fetch(`${apiBase}/organizations/`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        if (!orgRes.ok) {
                            throw new Error("Failed to load organizations");
                        }
                        const orgs = (await orgRes.json()) as { id: string; owner_id?: string }[];
                        const ownedOrgs = userSub ? orgs.filter((org) => org.owner_id === userSub) : [];
                        const nextCompanyCount = ownedOrgs.length;
                        if (!ownedOrgs.length) {
                            return {
                                companyCount: nextCompanyCount,
                                menuCount: 0,
                                activeMenuCount: 0,
                                itemCount: 0,
                                recentMenus: [],
                            };
                        }

                        const menuLists = await Promise.all(
                            ownedOrgs.map((org) =>
                                fetch(`${apiBase}/menus/?org_id=${org.id}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                }).then((res) => (res.ok ? (res.json() as Promise<{ id: string; name: string; is_active: boolean }[]>) : []))
                            )
                        );
                        const menus = menuLists.flat();
                        const nextMenuCount = menus.length;
                        const nextActiveMenuCount = menus.filter((menu) => menu.is_active).length;
                        const nextRecentMenus = menus.slice(0, 4);

                        const categoryLists = await Promise.all(
                            menus.map((menu) =>
                                fetch(`${apiBase}/categories/${menu.id}`, {
                                    headers: { Authorization: `Bearer ${token}` }
                                }).then((res) => (res.ok ? (res.json() as Promise<{ items?: unknown[] }[]>) : []))
                            )
                        );
                        const categories = categoryLists.flat();
                        const totalItems = categories.reduce((sum, category) => {
                            return sum + (Array.isArray(category.items) ? category.items.length : 0);
                        }, 0);

                        return {
                            companyCount: nextCompanyCount,
                            menuCount: nextMenuCount,
                            activeMenuCount: nextActiveMenuCount,
                            itemCount: totalItems,
                            recentMenus: nextRecentMenus,
                        };
                    },
                    OVERVIEW_CACHE_TTL_MS
                );

                if (!cancelled) {
                    setOverview(nextOverview);
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setOverview((current) => current || {
                        companyCount: 0,
                        menuCount: 0,
                        activeMenuCount: 0,
                        itemCount: 0,
                        recentMenus: [],
                    });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        void loadOverview();

        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;
            try {
                const attrs = await fetchUserAttributes();
                const name = attrs.name || attrs.preferred_username || attrs.email || user.username;
                setDisplayName(name || "User");
            } catch {
                setDisplayName(user.username || "User");
            }
        };
        loadProfile();
    }, [user]);

    const companyCount = overview?.companyCount ?? 0;
    const menuCount = overview?.menuCount ?? 0;
    const activeMenuCount = overview?.activeMenuCount ?? 0;
    const itemCount = overview?.itemCount ?? 0;
    const recentMenus = overview?.recentMenus ?? [];
    const isInitialLoading = loading && overview === null;
    const hasMenus = menuCount > 0;
    const emptyStateTitle = useMemo(
        () => (companyCount ? "Create your first menu" : "Create your company"),
        [companyCount]
    );
    const emptyStateCopy = useMemo(
        () =>
            companyCount
                ? "Start building your menu to generate your first QR code."
                : "Set up your company details to unlock menus, themes, and QR links.",
        [companyCount]
    );

    return (
        <div className="space-y-8">
            <header className="space-y-2">
                <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                    Welcome back,{" "}
                    {displayName ? (
                        <span className="text-[var(--cms-accent-strong)]">{displayName}</span>
                    ) : (
                        <span className="inline-block h-[1.1em] w-28 animate-pulse rounded-lg bg-pill align-middle" aria-hidden />
                    )}
                </h1>
                <p className="text-muted">A quick snapshot of what’s happening across your menus.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">
                            Companies
                        </CardTitle>
                        <CardDescription className="sr-only">Total companies you own</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isInitialLoading ? (
                            <div className="h-9 w-12 rounded-lg bg-pill animate-pulse" />
                        ) : (
                            <p className="text-3xl font-bold">{companyCount}</p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">
                            Menus
                        </CardTitle>
                        <CardDescription className="sr-only">Total menus</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isInitialLoading ? (
                            <>
                                <div className="h-9 w-14 rounded-lg bg-pill animate-pulse" />
                                <div className="mt-2 h-3 w-16 rounded bg-pill animate-pulse" />
                            </>
                        ) : (
                            <>
                                <p className="text-3xl font-bold">{menuCount}</p>
                                <p className="mt-2 text-xs text-muted">{activeMenuCount} active</p>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">
                            Menu items
                        </CardTitle>
                        <CardDescription className="sr-only">Total menu items</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isInitialLoading ? (
                            <div className="h-9 w-16 rounded-lg bg-pill animate-pulse" />
                        ) : (
                            <p className="text-3xl font-bold">{itemCount}</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {isInitialLoading ? (
                <Card className="mt-2">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="space-y-2">
                            <div className="h-5 w-48 rounded bg-pill animate-pulse" />
                            <div className="h-4 w-56 rounded bg-pill animate-pulse" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {Array.from({ length: 2 }).map((_, idx) => (
                                <div key={idx} className="rounded-2xl border border-border bg-panelStrong p-4">
                                    <div className="h-5 w-40 rounded bg-pill animate-pulse" />
                                    <div className="mt-2 h-3 w-24 rounded bg-pill animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : hasMenus ? (
                <Card className="mt-2">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle className="text-lg">Recently updated menus</CardTitle>
                            <CardDescription>Jump back into what you were editing.</CardDescription>
                        </div>
                        <Link href="/dashboard/menus" className="text-sm font-semibold text-muted hover:text-foreground">
                            View all
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {recentMenus.map((menu) => (
                                <Link
                                    key={menu.id}
                                    href={`/dashboard/menus/${menu.id}`}
                                    className="group rounded-2xl border border-border bg-panelStrong p-4 transition-colors hover:bg-pill"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h4 className="truncate text-base font-semibold">{menu.name}</h4>
                                            <p className="mt-1 text-xs text-muted">Open menu editor</p>
                                        </div>
                                        <Badge variant={menu.is_active ? "success" : "outline"}>
                                            {menu.is_active ? "Active" : "Paused"}
                                        </Badge>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="mt-2 rounded-2xl border border-dashed border-border bg-panelStrong p-10 text-center">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-pill">
                        <LayoutDashboard className="w-8 h-8 text-[var(--cms-text)]" />
                    </div>
                    <h3 className="text-xl font-bold">{emptyStateTitle}</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted">{emptyStateCopy}</p>
                    <div className="mt-6">
                        <Link
                            href={companyCount ? "/dashboard/menus/new" : "/onboarding"}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--cms-accent)] px-5 text-base font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            {companyCount ? "Create menu" : "Start onboarding"}
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
