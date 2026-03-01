"use client";

import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Users } from "lucide-react";
import { adminApi, AdminOrganization } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";

export default function AdminOrganizationsPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Placeholder for pagination
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (!user) return;

        const fetchOrgs = async () => {
            try {
                setLoading(true);
                const data = await adminApi.getOrganizations(page, 50);
                setOrganizations(data.items);
                setTotal(data.total);
            } catch (err: any) {
                console.error("Failed to load organizations", err);
                setError(err.message || "Failed to load organizations");
            } finally {
                setLoading(false);
            }
        };

        void fetchOrgs();
    }, [user, page]);

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
            </header>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm font-semibold">
                    {error}
                </div>
            )}

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-border bg-panelStrong/50">
                                    <th className="p-4 font-semibold text-muted">Company Name</th>
                                    <th className="p-4 font-semibold text-muted">Slug</th>
                                    <th className="p-4 font-semibold text-muted">Created At</th>
                                    <th className="p-4 font-semibold text-muted">Members</th>
                                    <th className="p-4 font-semibold text-muted">Menus</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && organizations.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted">
                                            Loading organizations...
                                        </td>
                                    </tr>
                                ) : organizations.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted">
                                            No organizations found.
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
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
