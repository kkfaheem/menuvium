"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Activity, ChevronDown, ChevronUp, RefreshCw, XCircle, RotateCcw, FileText, Box } from "lucide-react";
import { adminApi, AdminJob, AdminARJob } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function JobRow({ job, onRefresh }: { job: AdminJob, onRefresh: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [fullJob, setFullJob] = useState<any | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const toggleExpand = async () => {
        if (!expanded && !fullJob) {
            setLoadingDetails(true);
            try {
                const data = await adminApi.getJobDetails(job.id);
                setFullJob(data);
            } catch (err) {
                console.error("Failed to fetch full job", err);
            } finally {
                setLoadingDetails(false);
            }
        }
        setExpanded(!expanded);
    };

    const getStatusVariant = (status: string): "default" | "accent" | "success" | "warning" | "danger" | "outline" => {
        switch (status) {
            case "COMPLETED": return "success";
            case "FAILED": return "danger";
            case "RUNNING": return "accent";
            case "QUEUED": return "outline";
            default: return "default";
        }
    };

    const handleRetry = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to retry this job?")) return;
        try {
            await adminApi.retryJob(job.id);
            onRefresh();
        } catch (err: any) {
            alert("Failed to retry job: " + (err.message || "Unknown error"));
        }
    };

    const handleCancel = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to cancel this job?")) return;
        try {
            await adminApi.cancelJob(job.id);
            onRefresh();
        } catch (err: any) {
            alert("Failed to cancel job: " + (err.message || "Unknown error"));
        }
    };

    return (
        <>
            <tr
                className="border-b border-border hover:bg-panelStrong/50 transition-colors cursor-pointer group"
                onClick={toggleExpand}
            >
                <td className="p-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                        {expanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
                        {job.restaurant_name}
                    </div>
                </td>
                <td className="p-4">
                    <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                </td>
                <td className="p-4 text-muted font-mono text-xs">{job.id.split("-")[0]}</td>
                <td className="p-4 text-muted">{new Date(job.created_at).toLocaleString()}</td>
                <td className="p-4 text-muted">
                    {job.progress}%
                    {job.current_step && <span className="ml-2 text-xs truncate max-w-[150px] inline-block align-bottom">{job.current_step}</span>}
                </td>
                <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        {(job.status === "FAILED" || job.status === "CANCELED" || job.status === "NEEDS_INPUT") && (
                            <button onClick={handleRetry} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-[var(--cms-accent)] text-white hover:opacity-90 transition-opacity" title="Retry Job">
                                <RotateCcw className="w-3 h-3" />
                                Retry
                            </button>
                        )}
                        {(job.status === "QUEUED" || job.status === "RUNNING") && (
                            <button onClick={handleCancel} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors" title="Cancel Job">
                                <XCircle className="w-3 h-3" />
                                Cancel
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="border-b border-border bg-black/20">
                    <td colSpan={6} className="p-6">
                        {loadingDetails ? (
                            <div className="flex items-center gap-2 text-muted text-sm">
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Loading detailed logs...
                            </div>
                        ) : fullJob ? (
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-semibold mb-1 text-foreground">Error Message</h4>
                                    <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20 font-mono">
                                        {fullJob.error_message || "None"}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold mb-1 text-foreground">Metadata</h4>
                                    <pre className="text-xs text-muted bg-panelStrong p-3 rounded-lg overflow-x-auto border border-border">
                                        {JSON.stringify(fullJob.metadata_json, null, 2)}
                                    </pre>
                                </div>
                                {fullJob.logs && (
                                    <div>
                                        <h4 className="text-sm font-semibold mb-1 text-foreground">Execution Logs</h4>
                                        <pre className="text-xs text-muted bg-[#0d0d0d] p-4 rounded-lg overflow-y-auto max-h-64 border border-border whitespace-pre-wrap">
                                            {(() => {
                                                try {
                                                    const parsedLogs = JSON.parse(fullJob.logs);
                                                    return parsedLogs.map((l: any) => `[${new Date(l.time).toLocaleTimeString()}] ${l.message}`).join("\n");
                                                } catch {
                                                    return fullJob.logs;
                                                }
                                            })()}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-red-400 text-sm">Failed to load job details.</div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

function ARJobRow({ job, onRefresh }: { job: AdminARJob, onRefresh: () => void }) {
    const getStatusVariant = (status: string | null): "default" | "accent" | "success" | "warning" | "danger" | "outline" => {
        switch (status) {
            case "ready": return "success";
            case "failed": return "danger";
            case "processing": return "accent";
            case "pending": return "outline";
            default: return "default";
        }
    };

    const handleRetry = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to retry this AR processing job?")) return;
        try {
            await adminApi.retryARJob(job.id);
            onRefresh();
        } catch (err: any) {
            alert("Failed to retry AR job: " + (err.message || "Unknown error"));
        }
    };

    const handleCancel = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to cancel this AR processing job?")) return;
        try {
            await adminApi.cancelARJob(job.id);
            onRefresh();
        } catch (err: any) {
            alert("Failed to cancel AR job: " + (err.message || "Unknown error"));
        }
    };

    return (
        <tr className="border-b border-border hover:bg-panelStrong/50 transition-colors group">
            <td className="p-4 font-medium text-foreground">
                <div className="flex flex-col">
                    <span>{job.name}</span>
                    <span className="text-xs text-muted font-normal mt-0.5">{job.restaurant_name}</span>
                </div>
            </td>
            <td className="p-4">
                <Badge variant={getStatusVariant(job.ar_status)}>{job.ar_status?.toUpperCase() || 'UNKNOWN'}</Badge>
            </td>
            <td className="p-4 text-muted font-mono text-xs max-w-[150px] truncate" title={job.id}>
                {job.id.split("-")[0]}
            </td>
            <td className="p-4 text-muted">{job.ar_updated_at ? new Date(job.ar_updated_at).toLocaleString() : 'N/A'}</td>
            <td className="p-4 text-muted">
                <div className="flex flex-col">
                    <span>{(job.ar_progress ? job.ar_progress * 100 : 0).toFixed(0)}%</span>
                    {job.ar_stage && <span className="text-xs text-muted">{job.ar_stage}</span>}
                </div>
            </td>
            <td className="p-4 text-right">
                <div className="flex items-center justify-end gap-2">
                    {(job.ar_status === "failed" || job.ar_status === "canceled") && (
                        <button onClick={handleRetry} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-[var(--cms-accent)] text-white hover:opacity-90 transition-opacity" title="Retry AR Job">
                            <RotateCcw className="w-3 h-3" />
                            Retry
                        </button>
                    )}
                    {(job.ar_status === "pending" || job.ar_status === "processing") && (
                        <button onClick={handleCancel} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors" title="Cancel AR Job">
                            <XCircle className="w-3 h-3" />
                            Cancel
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

export default function AdminJobsPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [activeTab, setActiveTab] = useState<"importer" | "ar">("importer");

    // Importer Jobs State
    const [jobs, setJobs] = useState<AdminJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [statusFilter, setStatusFilter] = useState("ALL");

    // AR Jobs State
    const [arJobs, setArJobs] = useState<AdminARJob[]>([]);
    const [arPage, setArPage] = useState(1);
    const [arTotal, setArTotal] = useState(0);
    const [arStatusFilter, setArStatusFilter] = useState("ALL");

    const [error, setError] = useState<string | null>(null);

    const fetchJobs = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            if (activeTab === "importer") {
                const data = await adminApi.getJobs(page, 50, statusFilter);
                setJobs(data.items);
                setTotal(data.total);
            } else {
                const data = await adminApi.getARJobs(arPage, 50, arStatusFilter);
                setArJobs(data.items);
                setArTotal(data.total);
            }
        } catch (err: any) {
            console.error("Failed to load jobs", err);
            setError(err.message || "Failed to load jobs");
        } finally {
            setLoading(false);
        }
    }, [user, page, statusFilter, arPage, arStatusFilter, activeTab]);

    useEffect(() => {
        void fetchJobs();
    }, [fetchJobs]);

    // Reset pagination when filter changes
    useEffect(() => {
        if (activeTab === "importer") setPage(1);
    }, [statusFilter, activeTab]);

    useEffect(() => {
        if (activeTab === "ar") setArPage(1);
    }, [arStatusFilter, activeTab]);

    return (
        <div className="space-y-6">
            <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Activity className="w-8 h-8 text-[var(--cms-accent)]" />
                        System Health
                    </h1>
                    <p className="text-muted">Monitor background workers and importer jobs.</p>
                </div>
            </header>

            <div className="flex bg-panel border border-border p-1 rounded-lg w-fit mb-4">
                <button
                    onClick={() => setActiveTab("importer")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "importer" ? 'bg-[var(--cms-accent)] text-white shadow' : 'text-muted hover:text-foreground hover:bg-panelStrong'}`}
                >
                    <FileText className="w-4 h-4" />
                    Menu Importers
                </button>
                <button
                    onClick={() => setActiveTab("ar")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "ar" ? 'bg-[var(--cms-accent)] text-white shadow' : 'text-muted hover:text-foreground hover:bg-panelStrong'}`}
                >
                    <Box className="w-4 h-4" />
                    AR Processing
                </button>
            </div>

            <div className="flex items-center gap-2 mb-4 justify-between">
                {activeTab === "importer" ? (
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-10 w-full sm:w-auto rounded-xl border border-border bg-panel px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="RUNNING">Running</option>
                        <option value="QUEUED">Queued</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="FAILED">Failed</option>
                        <option value="NEEDS_INPUT">Needs Input</option>
                        <option value="CANCELED">Canceled</option>
                    </select>
                ) : (
                    <select
                        value={arStatusFilter}
                        onChange={(e) => setArStatusFilter(e.target.value)}
                        className="h-10 w-full sm:w-auto rounded-xl border border-border bg-panel px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="READY">Ready</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="PENDING">Pending</option>
                        <option value="FAILED">Failed</option>
                        <option value="CANCELED">Canceled</option>
                    </select>
                )}

                <button
                    onClick={fetchJobs}
                    disabled={loading}
                    className="h-10 px-3 rounded-md border border-border bg-panelStrong hover:bg-panelStrong/80 transition-colors text-muted hover:text-foreground disabled:opacity-50"
                    title="Refresh Jobs"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

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
                                    <th className="p-4 font-semibold text-muted">{activeTab === "importer" ? "Restaurant" : "Item"}</th>
                                    <th className="p-4 font-semibold text-muted">Status</th>
                                    <th className="p-4 font-semibold text-muted">Job ID</th>
                                    <th className="p-4 font-semibold text-muted">Last Updated</th>
                                    <th className="p-4 font-semibold text-muted">Progress</th>
                                    <th className="p-4 font-semibold text-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && ((activeTab === "importer" && jobs.length === 0) || (activeTab === "ar" && arJobs.length === 0)) ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            Loading jobs...
                                        </td>
                                    </tr>
                                ) : activeTab === "importer" && jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            No recent importer jobs found for this exact filter.
                                        </td>
                                    </tr>
                                ) : activeTab === "ar" && arJobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted">
                                            No recent AR processes found for this exact filter.
                                        </td>
                                    </tr>
                                ) : activeTab === "importer" ? (
                                    jobs.map((job) => <JobRow key={job.id} job={job} onRefresh={fetchJobs} />)
                                ) : (
                                    arJobs.map((job) => <ARJobRow key={job.id} job={job} onRefresh={fetchJobs} />)
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
