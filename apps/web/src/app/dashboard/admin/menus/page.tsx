"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
    UtensilsCrossed,
    Search,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Building2,
    UserCircle,
} from "lucide-react";
import { adminApi, AdminMenu } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function AdminMenusPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [menus, setMenus] = useState<AdminMenu[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (!user) return;

        const fetchMenus = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await adminApi.getMenus(page, 20, searchQuery);
                setMenus(data.items);
                setTotal(data.total);
            } catch (err: any) {
                console.error("Failed to load admin menus", err);
                setError(err.message || "Failed to load menus");
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(() => {
            void fetchMenus();
        }, 300);

        return () => clearTimeout(timer);
    }, [user, page, searchQuery]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery]);

    const formatDateTime = (dateStr: string) =>
        new Date(dateStr).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <UtensilsCrossed className="w-8 h-8 text-[var(--cms-accent)]" />
                        Menus
                    </h1>
                    <p className="text-muted">
                        Review all menus across companies, including ownership and creation details.
                    </p>
                </div>
                <div className="relative w-full max-w-sm">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted">
                        <Search className="w-4 h-4" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search menus, companies, owners..."
                        className="h-9 w-full rounded-xl border border-border bg-panel px-3 py-1 pl-9 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                    />
                </div>
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm font-semibold">
                    {error}
                </div>
            )}

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-border bg-panelStrong/50">
                                    <th className="p-4 font-semibold text-muted">Menu Details</th>
                                    <th className="p-4 font-semibold text-muted">Company</th>
                                    <th className="p-4 font-semibold text-muted">Created By</th>
                                    <th className="p-4 font-semibold text-muted">Created At</th>
                                    <th className="p-4 font-semibold text-muted">Status</th>
                                    <th className="p-4 font-semibold text-muted">Counts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && menus.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            Loading menus...
                                        </td>
                                    </tr>
                                ) : menus.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            No menus found.
                                        </td>
                                    </tr>
                                ) : (
                                    menus.map((menu) => {
                                        const userHref = `/dashboard/admin/users/${encodeURIComponent(menu.created_by_user_id)}`;
                                        const companyHref = `/dashboard/admin/organizations/${menu.org_id}`;
                                        const menuHref = `/dashboard/menus/${menu.id}`;

                                        return (
                                            <tr key={menu.id} className="border-b border-border last:border-0 hover:bg-panelStrong/50 transition-colors">
                                                <td className="p-4 align-top">
                                                    <Link
                                                        href={menuHref}
                                                        className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-[var(--cms-accent)] transition-colors"
                                                    >
                                                        {menu.name}
                                                        <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                                                    </Link>
                                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                                                        <span className="font-mono">{menu.slug || "no-slug"}</span>
                                                        <span>•</span>
                                                        <span className="capitalize">{menu.theme}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Link
                                                        href={companyHref}
                                                        className="inline-flex items-center gap-1.5 text-foreground hover:text-[var(--cms-accent)] transition-colors font-medium"
                                                    >
                                                        <Building2 className="w-3.5 h-3.5 text-muted" />
                                                        {menu.org_name}
                                                    </Link>
                                                    <div className="mt-1 text-[11px] text-muted font-mono">{menu.org_slug}</div>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Link
                                                        href={userHref}
                                                        className="inline-flex items-center gap-1.5 text-foreground hover:text-[var(--cms-accent)] transition-colors"
                                                    >
                                                        <UserCircle className="w-3.5 h-3.5 text-muted" />
                                                        {menu.created_by_email || menu.created_by_user_id}
                                                    </Link>
                                                    {menu.created_by_email ? (
                                                        <div className="mt-1">
                                                            <Link
                                                                href={userHref}
                                                                className="text-[11px] text-muted font-mono hover:text-[var(--cms-text)] transition-colors"
                                                            >
                                                                {menu.created_by_user_id}
                                                            </Link>
                                                        </div>
                                                    ) : null}
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Link
                                                        href={menuHref}
                                                        className="text-foreground hover:text-[var(--cms-accent)] transition-colors"
                                                    >
                                                        {formatDateTime(menu.created_at)}
                                                    </Link>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <Badge
                                                        variant={menu.is_active ? "success" : "outline"}
                                                        className={menu.is_active ? "" : "text-muted"}
                                                    >
                                                        {menu.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 align-top">
                                                    <div className="flex flex-col gap-1 text-xs text-muted">
                                                        <span>{menu.category_count} categories</span>
                                                        <span>{menu.item_count} items</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {total > 0 ? (
                        <div className="flex items-center justify-between p-4 border-t border-border">
                            <div className="text-sm text-muted">
                                Showing <span className="font-medium text-foreground">{menus.length}</span> of{" "}
                                <span className="font-medium text-foreground">{total}</span> menus
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                    className="p-2 border border-border rounded-md hover:bg-panelStrong disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={page * 20 >= total || loading}
                                    className="p-2 border border-border rounded-md hover:bg-panelStrong disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}

