"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { useEffect, useMemo, useState } from "react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";

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
        <div>
            <header className="mb-8 sm:mb-12">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                    Welcome back, <span className="text-[var(--cms-text)]">{displayName}</span>
                </h1>
                <p className="text-[var(--cms-muted)]">Here is an overview of your restaurant.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl shadow-sm">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Companies</p>
                    <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{companyCount}</p>
                </div>
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl shadow-sm">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Menus</p>
                    <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{menuCount}</p>
                    <p className="text-xs text-[var(--cms-muted)] mt-2">{activeMenuCount} active</p>
                </div>
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl shadow-sm">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Menu items</p>
                    <p className={`text-3xl font-bold ${loading ? "opacity-40 animate-pulse" : ""}`}>{itemCount}</p>
                </div>
            </div>

            {hasMenus ? (
                <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[1.3fr] gap-6">
                    <div className="p-8 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-[32px]">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-bold">Recently updated menus</h3>
                                <p className="text-sm text-[var(--cms-muted)]">Jump back into what you were editing.</p>
                            </div>
                            <Link href="/dashboard/menus" className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-2">
                                View all
                            </Link>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            {recentMenus.map((menu) => (
                                <Link
                                    key={menu.id}
                                    href={`/dashboard/menus/${menu.id}`}
                                    className="p-4 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] hover:shadow-md transition-all"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-lg">{menu.name}</h4>
                                        <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full ${menu.is_active ? "bg-emerald-500/15 text-emerald-500" : "bg-[var(--cms-pill)] text-[var(--cms-muted)]"}`}>
                                            {menu.is_active ? "Active" : "Paused"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--cms-muted)]">Open menu editor</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-12 p-12 border-2 border-dashed border-[var(--cms-border)] rounded-[40px] flex flex-col items-center justify-center text-center bg-[var(--cms-panel-strong)]">
                    <div className="w-16 h-16 bg-[var(--cms-pill)] rounded-2xl flex items-center justify-center mb-6">
                        <LayoutDashboard className="w-8 h-8 text-[var(--cms-text)]" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">{emptyStateTitle}</h3>
                    <p className="text-[var(--cms-muted)] max-w-sm mb-8">{emptyStateCopy}</p>
                    <Link
                        href={companyCount ? "/dashboard/menus/new" : "/onboarding"}
                        className="px-8 py-3 bg-[var(--cms-text)] text-[var(--cms-bg)] font-bold rounded-xl hover:scale-105 transition-all inline-block"
                    >
                        {companyCount ? "Create Menu" : "Start Onboarding"}
                    </Link>
                </div>
            )}
        </div>
    );
}
