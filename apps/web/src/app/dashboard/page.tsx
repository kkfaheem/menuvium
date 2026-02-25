"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function DashboardPage() {
    const { user } = useAuthenticator(context => [context.user]);
    const [displayName, setDisplayName] = useState("User");
    const [loading, setLoading] = useState(true);
    const [companyCount, setCompanyCount] = useState(0);
    const [menuCount, setMenuCount] = useState(0);
    const [activeMenuCount, setActiveMenuCount] = useState(0);
    const [itemCount, setItemCount] = useState(0);
    const [recentMenus, setRecentMenus] = useState<{ id: string; name: string; is_active: boolean }[]>([]);

    useEffect(() => {
        const loadOverview = async () => {
            if (!user) return;
            setLoading(true);
            try {
                const apiBase = getApiBase();
                const token = await getAuthToken();
                const orgRes = await fetch(`${apiBase}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) return;
                const orgs = await orgRes.json();
                const userSub = getJwtSub(token);
                const ownedOrgs = userSub ? orgs.filter((org: { owner_id?: string }) => org.owner_id === userSub) : [];
                setCompanyCount(ownedOrgs.length);
                if (!ownedOrgs.length) {
                    setMenuCount(0);
                    setActiveMenuCount(0);
                    setItemCount(0);
                    setRecentMenus([]);
                    return;
                }

                const menuLists = await Promise.all(
                    ownedOrgs.map((org: { id: string }) =>
                        fetch(`${apiBase}/menus/?org_id=${org.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then((res) => (res.ok ? res.json() : []))
                    )
                );
                const menus = menuLists.flat();
                setMenuCount(menus.length);
                setActiveMenuCount(menus.filter((menu: { is_active: boolean }) => menu.is_active).length);
                setRecentMenus(menus.slice(0, 4));

                const categoryLists = await Promise.all(
                    menus.map((menu: { id: string }) =>
                        fetch(`${apiBase}/categories/${menu.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then((res) => (res.ok ? res.json() : []))
                    )
                );
                const categories = categoryLists.flat();
                const totalItems = categories.reduce((sum: number, category: { items?: any[] }) => {
                    return sum + (category.items?.length || 0);
                }, 0);
                setItemCount(totalItems);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadOverview();
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
                <Badge variant="outline">Overview</Badge>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    Welcome back, <span className="text-[var(--cms-accent-strong)]">{displayName}</span>
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
                        <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{companyCount}</p>
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
                        <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{menuCount}</p>
                        <p className="mt-2 text-xs text-muted">{activeMenuCount} active</p>
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
                        <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{itemCount}</p>
                    </CardContent>
                </Card>
            </div>

            {hasMenus ? (
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
