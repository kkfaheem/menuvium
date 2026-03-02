"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Users as UsersIcon, Mail, Shield, ShieldOff, Key, UserCheck, ArrowLeft, Calendar, Building2, Fingerprint, Activity } from "lucide-react";
import { adminApi, AdminUserDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export default function UserProfilePage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDetail = async () => {
        try {
            setLoading(true);
            const data = await adminApi.getUserDetail(id);
            setUserDetail(data);
        } catch (err: any) {
            console.error("Failed to load user details", err);
            setError(err.message || "Failed to load user details");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchDetail();
    }, [id]);

    const handleAction = async (action: () => Promise<any>, successMsg?: string) => {
        try {
            await action();
            if (successMsg) alert(successMsg);
            void fetchDetail();
        } catch (err: any) {
            alert("Action failed: " + (err.message || "Unknown error"));
        }
    };

    if (loading) return <div className="p-8 text-center text-muted">Loading user profile...</div>;
    if (error || !userDetail) return <div className="p-8 text-center text-red-500">{error || "User not found"}</div>;

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors w-fit"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Users
                </button>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-panelStrong flex items-center justify-center">
                            <UsersIcon className="w-8 h-8 text-[var(--cms-accent)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight font-heading">{userDetail.email}</h1>
                            <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                <span className="font-mono text-xs">{userDetail.username}</span>
                                <span>•</span>
                                <Badge variant={userDetail.enabled ? 'success' : 'danger'} className="text-[10px] py-0">
                                    {userDetail.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Created {formatDate(userDetail.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Affiliations & Activity */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Company Affiliations */}
                    <Card className="bg-panel/50">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-muted" />
                                Company Affiliations
                            </CardTitle>
                            <CardDescription>All companies where this user has a membership role</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border bg-panelStrong/30">
                                            <th className="px-6 py-3 font-semibold text-muted">Company Name</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Role</th>
                                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {userDetail.companies.map((aff) => (
                                            <tr key={aff.org_id} className="border-b border-border last:border-0 hover:bg-panelStrong/20 transition-colors">
                                                <td className="px-6 py-4 font-medium">{aff.org_name}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={aff.role === 'owner' ? 'accent' : 'outline'} className="capitalize">
                                                        {aff.role || 'member'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Link
                                                        href={`/dashboard/admin/organizations/${aff.org_id}`}
                                                        className="text-[var(--cms-accent)] hover:underline text-xs"
                                                    >
                                                        View Company
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                        {userDetail.companies.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-8 text-center text-muted italic">This user is not affiliated with any companies.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card className="bg-panel/50">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Activity className="w-5 h-5 text-muted" />
                                User Activity
                            </CardTitle>
                            <CardDescription>Recent jobs initiated by this user</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border bg-panelStrong/30">
                                            <th className="px-6 py-3 font-semibold text-muted">Date</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Job / Restaurant</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {userDetail.recent_jobs.map((job) => (
                                            <tr key={job.id} className="border-b border-border last:border-0 hover:bg-panelStrong/20 transition-colors">
                                                <td className="px-6 py-4 text-xs text-muted">
                                                    {formatDateTime(job.created_at)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{job.restaurant_name}</span>
                                                        <span className="text-[10px] text-muted truncate max-w-[150px]">{job.id}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}
                                                        className="text-[10px] px-1.5 py-0"
                                                    >
                                                        {job.status}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                        {userDetail.recent_jobs.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-8 text-center text-muted italic">No recent activity found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Identity & Actions */}
                <div className="space-y-8">
                    <Card className="bg-panelStrong/30 border-dashed">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold text-muted uppercase tracking-wider">Cognito Identity</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Username (Sub)</label>
                                <div className="flex items-center gap-2">
                                    <Fingerprint className="w-4 h-4 text-muted" />
                                    <span className="text-xs font-mono truncate select-all">{userDetail.username}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Email Address</label>
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-muted" />
                                    <span className="text-xs truncate select-all">{userDetail.email}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Account Status</label>
                                <div className="text-xs font-bold text-[var(--cms-accent)]">{userDetail.status}</div>
                            </div>
                            <div className="space-y-1 pt-2 border-t border-border/50">
                                <label className="text-[10px] font-bold text-muted uppercase">Last Modified</label>
                                <div className="text-xs text-muted">{formatDateTime(userDetail.updated_at)}</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-panelStrong/20 border-red-500/10">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Administrative Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <button
                                onClick={() => handleAction(() => adminApi.resetUserPassword(userDetail.username), "Password reset email sent.")}
                                className="w-full px-4 py-2 rounded-lg bg-panelStrong hover:brightness-125 transition-all text-sm flex items-center gap-3"
                            >
                                <Key className="w-4 h-4 text-amber-500" />
                                <span>Reset Password</span>
                            </button>

                            <button
                                onClick={async () => {
                                    if (!window.confirm(`Impersonate ${userDetail.email}?`)) return;
                                    try {
                                        const { access_token } = await adminApi.impersonateUser(userDetail.username);
                                        window.localStorage.setItem("menuvium_impersonation_token", access_token);
                                        window.location.href = "/dashboard";
                                    } catch (err: any) { alert(err.message); }
                                }}
                                className="w-full px-4 py-2 rounded-lg bg-panelStrong hover:brightness-125 transition-all text-sm flex items-center gap-3"
                            >
                                <UserCheck className="w-4 h-4 text-emerald-500" />
                                <span>Impersonate User</span>
                            </button>

                            {userDetail.enabled ? (
                                <button
                                    onClick={() => handleAction(() => adminApi.disableUser(userDetail.username))}
                                    className="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all text-sm flex items-center gap-3 mt-4"
                                >
                                    <ShieldOff className="w-4 h-4" />
                                    <span>Disable Account</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleAction(() => adminApi.enableUser(userDetail.username))}
                                    className="w-full px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all text-sm flex items-center gap-3 mt-4"
                                >
                                    <Shield className="w-4 h-4" />
                                    <span>Enable Account</span>
                                </button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

