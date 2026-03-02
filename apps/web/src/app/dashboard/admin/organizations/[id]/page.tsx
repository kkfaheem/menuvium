"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Users, Layout, Database, TrendingUp, ArrowLeft, Calendar, Mail, Fingerprint, ExternalLink } from "lucide-react";
import { adminApi, AdminCompanyDetail } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

export default function CompanyProfilePage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const [company, setCompany] = useState<AdminCompanyDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                setLoading(true);
                const data = await adminApi.getCompanyDetail(id);
                setCompany(data);
            } catch (err: any) {
                console.error("Failed to load company details", err);
                setError(err.message || "Failed to load company details");
            } finally {
                setLoading(false);
            }
        };

        void fetchDetail();
    }, [id]);

    if (loading) return <div className="p-8 text-center text-muted">Loading company profile...</div>;
    if (error || !company) return <div className="p-8 text-center text-red-500">{error || "Company not found"}</div>;

    const stats = [
        { label: "Total Menus", value: company.menu_count, icon: Layout, color: "text-blue-500" },
        { label: "Total Items", value: company.item_count, icon: Database, color: "text-emerald-500" },
        { label: "AI Tokens Used", value: company.total_ai_tokens.toLocaleString(), icon: TrendingUp, color: "text-amber-500" },
        { label: "Team Members", value: company.member_count, icon: Users, color: "text-purple-500" },
    ];

    const arTotal = company.ar_ready + company.ar_pending + company.ar_processing + company.ar_failed;
    const arReadiness = arTotal > 0 ? Math.round((company.ar_ready / arTotal) * 100) : 0;

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
                    Back to Companies
                </button>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center">
                            <Building2 className="w-8 h-8 text-[var(--cms-accent)]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight font-heading">{company.name}</h1>
                            <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                <span className="font-mono">{company.slug}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Joined {formatDate(company.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Link
                            href={`/dashboard/admin/users/${company.owner_id}`}
                            className="px-4 py-2 rounded-lg border border-border hover:bg-panelStrong transition-colors text-sm font-semibold flex items-center gap-2"
                        >
                            <Users className="w-4 h-4" />
                            View Owner
                        </Link>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="bg-panel/50 backdrop-blur-sm">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted">{stat.label}</p>
                                    <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                                </div>
                                <div className={`p-3 rounded-xl bg-panelStrong/50 ${stat.color}`}>
                                    <stat.icon className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Details & Members */}
                <div className="lg:col-span-2 space-y-8">
                    {/* AR Readiness Card */}
                    <Card className="bg-panel/50">
                        <CardHeader>
                            <CardHeader className="p-0 border-0">
                                <CardTitle className="text-lg">AR Conversion Progress</CardTitle>
                                <CardDescription>Visual summary of menu item digitization status</CardDescription>
                            </CardHeader>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="text-4xl font-bold text-[var(--cms-accent)]">{arReadiness}%</div>
                                        <div className="text-sm text-muted leading-tight">Overall<br />Readiness</div>
                                    </div>
                                    <div className="flex gap-4 text-center">
                                        <div>
                                            <div className="text-lg font-bold text-emerald-500">{company.ar_ready}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Ready</div>
                                        </div>
                                        <div>
                                            <div className="text-lg font-bold text-amber-500">{company.ar_pending + company.ar_processing}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-muted font-bold">In Progress</div>
                                        </div>
                                        <div>
                                            <div className="text-lg font-bold text-red-500">{company.ar_failed}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-muted font-bold">Failed</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-3 w-full bg-panelStrong rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(company.ar_ready / (arTotal || 1)) * 100}%` }} />
                                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${((company.ar_pending + company.ar_processing) / (arTotal || 1)) * 100}%` }} />
                                    <div className="h-full bg-red-500 transition-all" style={{ width: `${(company.ar_failed / (arTotal || 1)) * 100}%` }} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Team Members */}
                    <Card className="bg-panel/50">
                        <CardHeader>
                            <CardTitle className="text-lg">Team Members</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border bg-panelStrong/30">
                                            <th className="px-6 py-3 font-semibold text-muted">Email</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Role</th>
                                            <th className="px-6 py-3 font-semibold text-muted">User ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {company.members.map((member) => (
                                            <tr key={member.id} className="border-b border-border last:border-0 hover:bg-panelStrong/20 transition-colors">
                                                <td className="px-6 py-4 font-medium">{member.email}</td>
                                                <td className="px-6 py-4">
                                                    <Badge variant={member.role === 'owner' ? 'accent' : 'outline'} className="capitalize">
                                                        {member.role || 'member'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-mono text-muted truncate max-w-[150px]" title={member.user_id || ""}>
                                                    {member.user_id || "Not Linked"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Recent Jobs */}
                    <Card className="bg-panel/50">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">Recent Importer Activity</CardTitle>
                            <Link href="/dashboard/admin/jobs" className="text-xs text-[var(--cms-accent)] hover:underline">View All</Link>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border bg-panelStrong/30">
                                            <th className="px-6 py-3 font-semibold text-muted">Date</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Status</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Result</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {company.recent_jobs.map((job) => (
                                            <tr key={job.id} className="border-b border-border last:border-0 hover:bg-panelStrong/20 transition-colors">
                                                <td className="px-6 py-4 text-xs text-muted">
                                                    {formatDateTime(job.created_at)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'warning'}
                                                        className="text-[10px] px-1.5 py-0"
                                                    >
                                                        {job.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-xs truncate max-w-[200px]" title={job.current_step || ""}>
                                                    {job.current_step || "---"}
                                                </td>
                                            </tr>
                                        ))}
                                        {company.recent_jobs.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-8 text-center text-muted italic">No recent import jobs found.</td>
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
                            <CardTitle className="text-sm font-semibold text-muted uppercase tracking-wider">Company Identity</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Owner ID</label>
                                <div className="flex items-center gap-2">
                                    <Fingerprint className="w-4 h-4 text-muted" />
                                    <span className="text-xs font-mono truncate select-all">{company.owner_id}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Owner Email</label>
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-muted" />
                                    <span className="text-xs truncate select-all">{company.owner_email || "N/A"}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted uppercase">Internal ID</label>
                                <div className="text-xs font-mono truncate select-all">{company.id}</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-panelStrong/20">
                        <CardHeader>
                            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <a
                                href={`https://menuvium.com/menu/${company.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full px-4 py-2 rounded-lg bg-panelStrong hover:brightness-125 transition-all text-sm flex items-center justify-between group"
                            >
                                <span>Public Page</span>
                                <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                            </a>
                            <button className="w-full px-4 py-2 rounded-lg bg-panelStrong hover:brightness-125 transition-all text-sm flex items-center justify-between text-muted opacity-50 cursor-not-allowed">
                                <span>Manage Subscription</span>
                                <Badge variant="outline" className="text-[8px] py-0">Soon</Badge>
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
