"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { adminApi, AdminJob } from "@/lib/api";
import {
    Download,
    Loader2,
    Plus,
    RefreshCw,
    X,
    ChevronRight,
    Search,
    Ban,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    Zap,
    FileText,
    History,
    Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

interface LogEntry {
    time: string;
    message: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
    QUEUED: <Clock className="w-3.5 h-3.5" />,
    RUNNING: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    NEEDS_INPUT: <AlertCircle className="w-3.5 h-3.5" />,
    FAILED: <XCircle className="w-3.5 h-3.5" />,
    COMPLETED: <CheckCircle2 className="w-3.5 h-3.5" />,
    CANCELED: <Ban className="w-3.5 h-3.5" />,
};

function StatusBadge({ status }: { status: string }) {
    const variant =
        status === 'COMPLETED' ? 'success' :
            status === 'FAILED' ? 'danger' :
                (status === 'RUNNING' || status === 'QUEUED') ? 'warning' : 'default';

    return (
        <Badge variant={variant} className="flex items-center gap-1.5 py-0.5">
            {STATUS_ICONS[status]}
            {status}
        </Badge>
    );
}

function ProgressBar({ value, status }: { value: number; status: string }) {
    const color =
        status === "COMPLETED"
            ? "bg-emerald-500"
            : status === "FAILED"
                ? "bg-red-500"
                : status === "RUNNING"
                    ? "bg-[var(--cms-accent)]"
                    : "bg-muted";
    return (
        <div className="w-full h-1.5 bg-panelStrong rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    );
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminMenuImporterPage() {
    const router = useRouter();
    const { user } = useAuthenticator((ctx) => [ctx.user]);

    // Jobs state
    const [jobs, setJobs] = useState<AdminJob[]>([]);
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<any | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Form state
    const [formName, setFormName] = useState("");
    const [formLocation, setFormLocation] = useState("");
    const [formUrl, setFormUrl] = useState("");
    const [creating, setCreating] = useState(false);

    // Fetch jobs
    const fetchJobs = useCallback(async () => {
        try {
            const data = await adminApi.getImporterJobs(filter || undefined);
            setJobs(data);
        } catch (err) {
            console.error("Failed to fetch jobs", err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        fetchJobs();
    }, [user, fetchJobs]);

    // Polling
    useEffect(() => {
        if (!user) return;
        pollRef.current = setInterval(fetchJobs, 4000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [user, fetchJobs]);

    // Create job
    const handleCreate = async () => {
        if (!formName.trim()) return;
        setCreating(true);
        try {
            await adminApi.createImporterJob({
                restaurant_name: formName.trim(),
                location_hint: formLocation.trim() || undefined,
                website_override: formUrl.trim() || undefined,
            });
            setFormName("");
            setFormLocation("");
            setFormUrl("");
            fetchJobs();
        } catch (err: any) {
            alert(err.message || "Failed to create job");
        } finally {
            setCreating(false);
        }
    };

    const handleAction = async (action: () => Promise<any>) => {
        try {
            await action();
            fetchJobs();
            if (selectedJob) {
                const updated = await adminApi.getImporterJobDetails(selectedJob.id);
                setSelectedJob(updated);
            }
        } catch (err: any) {
            alert(err.message || "Action failed");
        }
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight font-heading flex items-center gap-3">
                    <Zap className="w-8 h-8 text-[var(--cms-accent)]" />
                    Menu Importer
                </h1>
                <p className="text-muted">Discover and parse restaurant menus using AI pipeline.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
                {/* Left: Creator */}
                <div className="space-y-6">
                    <Card className="bg-panel/50">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5 text-muted" />
                                New Import
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted uppercase">Restaurant Name *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="e.g. Italian Bistro"
                                    className="w-full px-3 py-2 rounded-lg bg-panelStrong border border-border focus:border-[var(--cms-accent)] outline-none transition-colors text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted uppercase">City / Area (optional)</label>
                                <input
                                    type="text"
                                    value={formLocation}
                                    onChange={(e) => setFormLocation(e.target.value)}
                                    placeholder="e.g. New York, NY"
                                    className="w-full px-3 py-2 rounded-lg bg-panelStrong border border-border focus:border-[var(--cms-accent)] outline-none transition-colors text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-muted uppercase">Website URL (optional)</label>
                                <input
                                    type="url"
                                    value={formUrl}
                                    onChange={(e) => setFormUrl(e.target.value)}
                                    placeholder="https://restaurant.com"
                                    className="w-full px-3 py-2 rounded-lg bg-panelStrong border border-border focus:border-[var(--cms-accent)] outline-none transition-colors text-sm"
                                />
                            </div>
                            <button
                                onClick={handleCreate}
                                disabled={!formName.trim() || creating}
                                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--cms-accent)] hover:brightness-110 disabled:opacity-50 transition-all font-semibold text-sm"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Create Job
                            </button>
                        </CardContent>
                    </Card>

                    <Card className="bg-panel/30 border-dashed">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Quick Help</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="text-xs text-muted leading-relaxed">
                                Our pipeline uses AI to discover menu pages, parse PDFs/Images, and enhance food photography automatically.
                            </p>
                            <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> AI-Powered Extraction</div>
                                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Studio Image Enhancement</div>
                                <div className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Export to Menuvium ZIP</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Jobs list */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        {['', 'RUNNING', 'COMPLETED', 'FAILED'].map((s) => (
                            <button
                                key={s}
                                onClick={() => setFilter(s)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${filter === s ? 'bg-[var(--cms-accent)] text-white' : 'text-muted hover:text-foreground bg-panelStrong'
                                    }`}
                            >
                                {s || 'ALL'}
                            </button>
                        ))}
                    </div>

                    <Card className="bg-panel/50 overflow-hidden">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border bg-panelStrong/30">
                                            <th className="px-6 py-3 font-semibold text-muted">Restaurant</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Status</th>
                                            <th className="px-6 py-3 font-semibold text-muted">Progress</th>
                                            <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {loading && jobs.length === 0 ? (
                                            <tr><td colSpan={4} className="px-6 py-12 text-center text-muted">Loading jobs...</td></tr>
                                        ) : jobs.length === 0 ? (
                                            <tr><td colSpan={4} className="px-6 py-12 text-center text-muted italic">No matching jobs found.</td></tr>
                                        ) : (
                                            jobs.map((job) => (
                                                <tr
                                                    key={job.id}
                                                    className="group hover:bg-panelStrong/20 transition-colors cursor-pointer"
                                                    onClick={() => setSelectedJob(job)}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold">{job.restaurant_name}</span>
                                                            <span className="text-[10px] text-muted font-mono">{formatDateTime(job.created_at)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <StatusBadge status={job.status} />
                                                    </td>
                                                    <td className="px-6 py-4 w-48">
                                                        <div className="flex flex-col gap-1.5">
                                                            <ProgressBar value={job.progress} status={job.status} />
                                                            <div className="flex justify-between text-[9px] font-bold text-muted uppercase">
                                                                <span>{job.current_step || 'Wait'}</span>
                                                                <span>{job.progress}%</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                            {job.status === 'COMPLETED' && (
                                                                <button
                                                                    onClick={() => adminApi.downloadImporterZip(job.id, job.restaurant_name)}
                                                                    className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                                    title="Download ZIP"
                                                                >
                                                                    <Download className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleAction(() => adminApi.retryJob(job.id))}
                                                                className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                                                title="Retry"
                                                            >
                                                                <RotateCcw className="w-4 h-4" />
                                                            </button>
                                                            <ChevronRight className="w-4 h-4 text-muted group-hover:text-foreground transition-all" />
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
            </div>

            {/* Detail Modal/Drawer Overlay */}
            {selectedJob && (
                <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-xl h-full bg-[#0d1117] border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
                        <div className="sticky top-0 z-10 bg-panel/90 backdrop-blur-xl border-b border-border px-6 py-5 flex items-center justify-between">
                            <div className="flex items-center gap-3 font-heading">
                                <History className="w-5 h-5 text-[var(--cms-accent)]" />
                                <h2 className="font-bold text-lg">{selectedJob.restaurant_name}</h2>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedJob(null)} className="rounded-xl p-2">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="flex items-center justify-between p-4 rounded-2xl bg-panelStrong/30 border border-border">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted uppercase">Status</label>
                                    <StatusBadge status={selectedJob.status} />
                                </div>
                                <div className="text-right space-y-1">
                                    <label className="text-[10px] font-bold text-muted uppercase">ID</label>
                                    <div className="text-[10px] font-mono text-muted">{selectedJob.id}</div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm font-semibold">
                                    <span className="text-muted">Current Step: {selectedJob.current_step || 'Unknown'}</span>
                                    <span className="text-[var(--cms-accent)]">{selectedJob.progress}%</span>
                                </div>
                                <ProgressBar value={selectedJob.progress} status={selectedJob.status} />
                            </div>

                            {selectedJob.error_message && (
                                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                    <div className="flex items-center gap-2 font-bold mb-1">
                                        <AlertCircle className="w-4 h-4" /> Error Details
                                    </div>
                                    {selectedJob.error_message}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    className="flex-1 bg-[var(--cms-accent)]"
                                    onClick={() => handleAction(() => adminApi.retryJob(selectedJob.id))}
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" /> Retry Pipeline
                                </Button>
                                {selectedJob.status === 'COMPLETED' && (
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                                        onClick={() => adminApi.downloadImporterZip(selectedJob.id, selectedJob.restaurant_name)}
                                    >
                                        <Download className="w-4 h-4 mr-2" /> Download result
                                    </Button>
                                )}
                            </div>

                            {/* Job Logs */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Pipeline Logs
                                </h3>
                                <div className="rounded-2xl bg-panel p-4 font-mono text-[10px] space-y-2 border border-border max-h-[400px] overflow-y-auto">
                                    {selectedJob.logs ? (
                                        (() => {
                                            try {
                                                const logs = JSON.parse(selectedJob.logs);
                                                return logs.map((log: any, i: number) => (
                                                    <div key={i} className="flex gap-4 border-b border-white/5 pb-1">
                                                        <span className="text-muted shrink-0">{log.time.split('T')[1].split('.')[0]}</span>
                                                        <span className="text-foreground/80">{log.message}</span>
                                                    </div>
                                                ));
                                            } catch {
                                                return <div className="text-muted italic">Raw: {selectedJob.logs}</div>;
                                            }
                                        })()
                                    ) : (
                                        <div className="text-muted italic text-center py-4">No logs available for this job.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

