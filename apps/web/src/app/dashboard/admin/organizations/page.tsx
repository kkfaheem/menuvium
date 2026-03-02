"use client";

import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Users, Search, Trash2, ChevronLeft, ChevronRight, Plus, Edit } from "lucide-react";
import { adminApi, AdminOrganization } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export default function AdminOrganizationsPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");

    // Create/Edit state
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState("");
    const [newOwnerId, setNewOwnerId] = useState("");
    const [editingOrg, setEditingOrg] = useState<AdminOrganization | null>(null);

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

    const handleCreate = async () => {
        try {
            setLoading(true);
            if (editingOrg) {
                const updated = await adminApi.updateOrganization(editingOrg.id, {
                    name: newName,
                    owner_id: newOwnerId
                });
                setOrganizations(orgs => orgs.map(o => o.id === editingOrg.id ? updated : o));
            } else {
                const created = await adminApi.createOrganization({
                    name: newName,
                    owner_id: newOwnerId
                });
                setOrganizations(orgs => [created, ...orgs]);
                setTotal(t => t + 1);
            }
            setShowAddModal(false);
            setNewName("");
            setNewOwnerId("");
            setEditingOrg(null);
        } catch (err: any) {
            alert("Failed to save organization: " + (err.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (org: AdminOrganization) => {
        setEditingOrg(org);
        setNewName(org.name);
        setNewOwnerId(org.owner_id);
        setShowAddModal(true);
    };

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
                <div className="relative w-full max-w-sm flex items-center gap-3">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="h-9 px-4 rounded-md bg-[var(--cms-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                        New Organization
                    </button>
                    <div className="relative flex-1">
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
                </div>
            </header>

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-foreground">
                    <Card className="w-full max-w-md shadow-2xl">
                        <CardHeader>
                            <CardTitle>{editingOrg ? "Edit Organization" : "Create New Organization"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Company Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g. Italian Bistro"
                                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Owner Cognito ID (sub)</label>
                                <input
                                    type="text"
                                    value={newOwnerId}
                                    onChange={(e) => setNewOwnerId(e.target.value)}
                                    placeholder="UUID from Cognito"
                                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 rounded-md border border-border hover:bg-panelStrong transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!newName || !newOwnerId || loading}
                                    className="px-4 py-2 rounded-md bg-[var(--cms-accent)] text-white font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
                                >
                                    {loading ? "Creating..." : "Create Organization"}
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

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
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleEdit(org)}
                                                        className="p-2 text-muted hover:bg-panelStrong rounded-md transition-colors"
                                                        title="Edit Organization"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(org.id, org.name)}
                                                        className="p-2 text-muted hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
                                                        title="Delete Organization"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
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
