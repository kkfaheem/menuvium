"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Users as UsersIcon, Search, Shield, ShieldOff, Key, UserCheck, LogOut, Trash2 } from "lucide-react";
import { adminApi, AdminUser } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function AdminUsersPage() {
    const router = useRouter();
    const { user: currentUser } = useAuthenticator((context) => [context.user]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Check if we are currently impersonating
    const [isImpersonating, setIsImpersonating] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setIsImpersonating(!!window.localStorage.getItem("menuvium_impersonation_token"));
        }
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await adminApi.getUsers();
            setUsers(data.items);
        } catch (err: any) {
            console.error("Failed to load users", err);
            const msg = err.detail ? `${err.message}: ${err.detail}` : (err.message || "Failed to load users");
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!currentUser) return;
        void fetchUsers();
    }, [currentUser]);

    const handleDisable = async (username: string) => {
        if (!window.confirm("Are you sure you want to disable this user? They will be unable to log in.")) return;
        try {
            await adminApi.disableUser(username);
            setUsers(items => items.map(u => u.username === username ? { ...u, enabled: false } : u));
        } catch (err: any) {
            alert("Failed to disable user: " + (err.message || "Unknown error"));
        }
    };

    const handleEnable = async (username: string) => {
        try {
            await adminApi.enableUser(username);
            setUsers(items => items.map(u => u.username === username ? { ...u, enabled: true } : u));
        } catch (err: any) {
            alert("Failed to enable user: " + (err.message || "Unknown error"));
        }
    };

    const handleResetPassword = async (username: string) => {
        if (!window.confirm("This will trigger the Cognito 'Forgot Password' flow for the user. Continue?")) return;
        try {
            await adminApi.resetUserPassword(username);
            alert("Password reset email triggered.");
        } catch (err: any) {
            alert("Failed to trigger reset: " + (err.message || "Unknown error"));
        }
    };

    const handleImpersonate = async (username: string) => {
        if (!window.confirm(`You are about to impersonate ${username}. This will overwrite your session until you clear the impersonation. Continue?`)) return;
        try {
            const { access_token } = await adminApi.impersonateUser(username);
            window.localStorage.setItem("menuvium_impersonation_token", access_token);
            window.location.href = "/dashboard";
        } catch (err: any) {
            alert("Failed to impersonate: " + (err.message || "Unknown error"));
        }
    };

    const handleDelete = async (username: string, email: string) => {
        if (!window.confirm(
            `Are you absolutely sure you want to permanently delete this user?\n\n` +
            `Email: ${email}\nUsername: ${username}\n\n` +
            `This will:\n` +
            `• Delete their account from Cognito\n` +
            `• Remove all company memberships\n\n` +
            `This action CANNOT be undone.`
        )) return;
        try {
            await adminApi.deleteUser(username);
            setUsers(items => items.filter(u => u.username !== username));
        } catch (err: any) {
            alert("Failed to delete user: " + (err.detail || err.message || "Unknown error"));
        }
    };

    const stopImpersonating = () => {
        window.localStorage.removeItem("menuvium_impersonation_token");
        window.location.reload();
    };

    const filteredUsers = users.filter(u =>
        (u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <UsersIcon className="w-8 h-8 text-[var(--cms-accent)]" />
                        Users
                    </h1>
                    <p className="text-muted">Manage all platform accounts, employees, and restaurant owners.</p>
                </div>
                <div className="relative w-full max-w-sm flex items-center gap-3">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted">
                            <Search className="w-4 h-4" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, or username..."
                            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>
                    {isImpersonating && (
                        <button
                            onClick={stopImpersonating}
                            className="flex items-center gap-2 px-3 py-1.5 h-9 bg-red-500/10 text-red-500 border border-red-500/20 rounded-md text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Stop Impersonation
                        </button>
                    )}
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
                                    <th className="p-4 font-semibold text-muted">User</th>
                                    <th className="p-4 font-semibold text-muted">Status</th>
                                    <th className="p-4 font-semibold text-muted">Account</th>
                                    <th className="p-4 font-semibold text-muted">Joined</th>
                                    <th className="p-4 font-semibold text-muted">Last Modified</th>
                                    <th className="p-4 font-semibold text-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            Loading user directory...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            No users found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <tr
                                            key={u.username}
                                            className="border-b border-border last:border-0 hover:bg-panelStrong/50 transition-colors cursor-pointer"
                                            onClick={() => router.push(`/dashboard/admin/users/${u.username}`)}
                                        >
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-foreground">{u.name || "Unnamed User"}</span>
                                                    <span className="text-xs text-muted">{u.email}</span>
                                                    <span className="text-[10px] text-muted font-mono">{u.username}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <Badge variant={u.status === "CONFIRMED" ? "success" : "warning"}>
                                                    {u.status}
                                                </Badge>
                                            </td>
                                            <td className="p-4">
                                                {u.enabled ? (
                                                    <Badge variant="accent" className="bg-green-500/10 text-green-500">Enabled</Badge>
                                                ) : (
                                                    <Badge variant="danger">Disabled</Badge>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-foreground">{new Date(u.created_at).toLocaleDateString()}</span>
                                                    <span className="text-[10px] text-muted">{new Date(u.created_at).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-foreground">{new Date(u.updated_at).toLocaleDateString()}</span>
                                                    <span className="text-[10px] text-muted">{new Date(u.updated_at).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleResetPassword(u.username)}
                                                        className="p-2 text-muted hover:bg-panelStrong rounded-md transition-colors"
                                                        title="Trigger Password Reset"
                                                    >
                                                        <Key className="w-4 h-4" />
                                                    </button>

                                                    {u.enabled ? (
                                                        <button
                                                            onClick={() => handleDisable(u.username)}
                                                            className="p-2 text-muted hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
                                                            title="Disable Account"
                                                        >
                                                            <ShieldOff className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleEnable(u.username)}
                                                            className="p-2 text-muted hover:bg-green-500/10 hover:text-green-500 rounded-md transition-colors"
                                                            title="Enable Account"
                                                        >
                                                            <Shield className="w-4 h-4" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => handleDelete(u.username, u.email)}
                                                        className="p-2 text-muted hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        onClick={() => handleImpersonate(u.username)}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-md text-xs font-semibold hover:bg-blue-500/20 transition-colors"
                                                    >
                                                        <UserCheck className="w-3.5 h-3.5" />
                                                        Impersonate
                                                    </button>
                                                </div>
                                            </td>
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
