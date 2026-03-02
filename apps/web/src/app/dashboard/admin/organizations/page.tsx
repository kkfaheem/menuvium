"use client";

import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Users, Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { adminApi, AdminOrganization } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";

export default function AdminOrganizationsPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        if (!user) return;

        const fetchOrgs = async () => {
            try {
                setLoading(true);
                const data = await adminApi.getOrganizations(page, 20, searchQuery);
                setOrganizations(data.items);
                setTotal(data.total);
            } catch (err: any) {
                console.error("Failed to load organizations", err);
                setError(err.message || "Failed to load organizations");
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(() => {
            void fetchOrgs();
        }, 300);

        return () => clearTimeout(timer);
    }, [user, page, searchQuery]);

    // Reset page to 1 when search query changes
    useEffect(() => {
        setPage(1);
    }, [searchQuery]);

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you absolutely sure you want to delete ${name}?\n\nThis will completely wipe all of their menus, categories, items, and team members. This action cannot be undone.`)) {
            return;
        }

        try {
            await adminApi.deleteOrganization(id);
            setOrganizations(orgs => orgs.filter(o => o.id !== id));
            setTotal(t => t - 1);
        } catch (err: any) {
            alert("Failed to delete organization: " + (err.message || "Unknown error"));
        }
    };

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Users className="w-8 h-8 text-[var(--cms-accent)]" />
                        Organizations
                    </h1>
                    <p className="text-muted">Manage all onboarded companies.</p>
                </div>
                <div className="relative w-full max-w-sm">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted">
                        <Search className="w-4 h-4" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or slug..."
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                                    <th className="p-4 font-semibold text-muted">Company Name</th>
                                    <th className="p-4 font-semibold text-muted">Slug</th>
                                    <th className="p-4 font-semibold text-muted">Created At</th>
                                    <th className="p-4 font-semibold text-muted">Members</th>
                                    <th className="p-4 font-semibold text-muted">Menus</th>
                                    <th className="p-4 font-semibold text-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && organizations.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            Loading organizations...
                                        </td>
                                    </tr>
                                ) : organizations.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            No organizations found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    organizations.map((org) => (
                                        <tr key={org.id} className="border-b border-border last:border-0 hover:bg-panelStrong/50 transition-colors">
                                            <td className="p-4 font-medium text-foreground">{org.name}</td>
                                            <td className="p-4 text-muted font-mono text-xs">{org.slug}</td>
                                            <td className="p-4 text-muted">
                                                {new Date(org.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-muted">{org.member_count}</td>
                                            <td className="p-4 text-muted">{org.menu_count}</td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleDelete(org.id, org.name)}
                                                    className="p-2 text-muted hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
                                                    title="Delete Organization"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {total > 0 && (
                        <div className="flex items-center justify-between p-4 border-t border-border">
                            <div className="text-sm text-muted">
                                Showing <span className="font-medium text-foreground">{organizations.length}</span> of <span className="font-medium text-foreground">{total}</span> organizations
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1 || loading}
                                    className="p-2 border border-border rounded-md hover:bg-panelStrong disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page * 20 >= total || loading}
                                    className="p-2 border border-border rounded-md hover:bg-panelStrong disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
