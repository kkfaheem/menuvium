"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getAuthToken } from "@/lib/authToken";
import { getApiBase } from "@/lib/apiBase";
import {
    ArrowLeft,
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportJob {
    id: string;
    restaurant_name: string;
    location_hint: string | null;
    website_override: string | null;
    status: string;
    progress: number;
    current_step: string | null;
    created_at: string;
    updated_at: string;
    started_at: string | null;
    finished_at: string | null;
    result_zip_key: string | null;
    error_message: string | null;
    logs: string | null;
    metadata_json: Record<string, unknown> | null;
    created_by: string;
}

interface LogEntry {
    time: string;
    message: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const base = getApiBase();
    const token = await getAuthToken();
    const res = await fetch(`${base}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
    if (!res.ok) {
        let detail = "";
        try {
            const err = await res.json();
            detail = err.detail || "";
        } catch { }
        throw new Error(detail || `API error ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
}

const jobsApi = {
    list: (status?: string) =>
        apiFetch<ImportJob[]>(
            `/admin/menu-importer/jobs${status ? `?status=${status}` : ""}`
        ),
    get: (id: string) =>
        apiFetch<ImportJob>(`/admin/menu-importer/jobs/${id}`),
    create: (data: {
        restaurant_name: string;
        location_hint?: string;
        website_override?: string;
    }) =>
        apiFetch<ImportJob>("/admin/menu-importer/jobs", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    cancel: (id: string) =>
        apiFetch<ImportJob>(`/admin/menu-importer/jobs/${id}/cancel`, {
            method: "POST",
        }),
    retry: (id: string) =>
        apiFetch<ImportJob>(`/admin/menu-importer/jobs/${id}/retry`, {
            method: "POST",
        }),
};

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
    QUEUED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    RUNNING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    NEEDS_INPUT: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
    COMPLETED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    CANCELED: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
    QUEUED: <Clock className="w-3.5 h-3.5" />,
    RUNNING: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    NEEDS_INPUT: <AlertCircle className="w-3.5 h-3.5" />,
    FAILED: <XCircle className="w-3.5 h-3.5" />,
    COMPLETED: <CheckCircle2 className="w-3.5 h-3.5" />,
    CANCELED: <Ban className="w-3.5 h-3.5" />,
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[status] || "bg-gray-500/15 text-gray-400 border-gray-500/30"
                }`}
        >
            {STATUS_ICONS[status]}
            {status}
        </span>
    );
}

function ProgressBar({ value, status }: { value: number; status: string }) {
    const color =
        status === "COMPLETED"
            ? "bg-emerald-500"
            : status === "FAILED"
                ? "bg-red-500"
                : status === "RUNNING"
                    ? "bg-blue-500"
                    : "bg-gray-500";
    return (
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    );
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_TABS = [
    { label: "All", value: "" },
    { label: "Running", value: "RUNNING" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MenuImporterPage() {
    const router = useRouter();
    const { user, authStatus } = useAuthenticator((ctx) => [
        ctx.user,
        ctx.authStatus,
    ]);
    const [mounted, setMounted] = useState(false);
    const [authorized, setAuthorized] = useState<boolean | null>(null);

    // Jobs state
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Form state
    const [formName, setFormName] = useState("");
    const [formLocation, setFormLocation] = useState("");
    const [formUrl, setFormUrl] = useState("");
    const [creating, setCreating] = useState(false);

    // Toast
    const [toast, setToast] = useState<{
        message: string;
        type: "success" | "error";
    } | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        if (authStatus === "unauthenticated") {
            router.replace("/login");
        }
    }, [mounted, authStatus, router]);

    // Check admin access by making a test call to the admin endpoint
    useEffect(() => {
        if (!mounted || !user) return;
        (async () => {
            try {
                await jobsApi.list();
                setAuthorized(true);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("Admin access required") || msg.includes("403")) {
                    setAuthorized(false);
                } else {
                    setAuthorized(true); // Might be other error, let it through
                }
            }
        })();
    }, [mounted, user]);

    // Fetch jobs
    const fetchJobs = useCallback(async () => {
        try {
            const data = await jobsApi.list(filter || undefined);
            setJobs(data);
        } catch {
            // Silent fail on background poll
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (authorized !== true) return;
        setLoading(true);
        fetchJobs();
    }, [authorized, fetchJobs]);

    // Polling
    useEffect(() => {
        if (authorized !== true) return;
        pollRef.current = setInterval(fetchJobs, 3000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [authorized, fetchJobs]);

    // Show toast
    const showToast = (message: string, type: "success" | "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Create job
    const handleCreate = async () => {
        if (!formName.trim()) return;
        setCreating(true);
        try {
            await jobsApi.create({
                restaurant_name: formName.trim(),
                location_hint: formLocation.trim() || undefined,
                website_override: formUrl.trim() || undefined,
            });
            setFormName("");
            setFormLocation("");
            setFormUrl("");
            showToast("Import job created!", "success");
            fetchJobs();
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : "Failed to create job",
                "error"
            );
        } finally {
            setCreating(false);
        }
    };

    // Cancel job
    const handleCancel = async (id: string) => {
        try {
            await jobsApi.cancel(id);
            showToast("Job canceled", "success");
            fetchJobs();
            if (selectedJob?.id === id) {
                const updated = await jobsApi.get(id);
                setSelectedJob(updated);
            }
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : "Failed to cancel",
                "error"
            );
        }
    };

    // Retry job
    const handleRetry = async (id: string) => {
        try {
            await jobsApi.retry(id);
            showToast("Job requeued", "success");
            fetchJobs();
            if (selectedJob?.id === id) {
                const updated = await jobsApi.get(id);
                setSelectedJob(updated);
            }
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : "Failed to retry",
                "error"
            );
        }
    };

    // Download zip
    const handleDownload = async (job: ImportJob) => {
        try {
            const base = getApiBase();
            const token = await getAuthToken();
            const res = await fetch(
                `${base}/admin/menu-importer/jobs/${job.id}/download`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error("Download failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${job.restaurant_name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/-+$/, "")}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            showToast(
                err instanceof Error ? err.message : "Download failed",
                "error"
            );
        }
    };

    // Refresh selected job details
    const refreshSelectedJob = async () => {
        if (!selectedJob) return;
        try {
            const updated = await jobsApi.get(selectedJob.id);
            setSelectedJob(updated);
        } catch { }
    };

    // Parse logs
    const parseLogs = (logsStr: string | null): LogEntry[] => {
        if (!logsStr) return [];
        try {
            return JSON.parse(logsStr);
        } catch {
            return [];
        }
    };

    // ---------- Render guards ----------

    if (!mounted || !user) {
        return (
            <div className="min-h-screen bg-[#0b0f16] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (authorized === false) {
        return (
            <div className="min-h-screen bg-[#0b0f16] flex items-center justify-center text-white">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <Ban className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold">Access Denied</h1>
                    <p className="text-gray-400 max-w-md">
                        This page is restricted to administrators. Your email is not
                        in the admin allowlist.
                    </p>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (authorized === null) {
        return (
            <div className="min-h-screen bg-[#0b0f16] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    // ---------- Main render ----------

    return (
        <div className="min-h-screen bg-[#0b0f16] text-white">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium flex items-center gap-2 animate-in slide-in-from-top-2 ${toast.type === "success"
                        ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                        : "bg-red-500/20 border-red-500/30 text-red-300"
                        }`}
                >
                    {toast.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4" />
                    ) : (
                        <XCircle className="w-4 h-4" />
                    )}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-white/[.06] bg-[#0b0f16]/90 backdrop-blur-xl">
                <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-400" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <Zap className="w-4 h-4" />
                            </div>
                            <h1 className="text-lg font-bold">Menu Importer</h1>
                        </div>
                    </div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold bg-white/5 px-3 py-1 rounded-full">
                        Admin Only
                    </span>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
                    {/* ---- Left: Job creation form ---- */}
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-6 space-y-5">
                            <div className="flex items-center gap-2 mb-1">
                                <Plus className="w-5 h-5 text-blue-400" />
                                <h2 className="text-base font-semibold">New Import</h2>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        Restaurant Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="e.g. The Gilded Fork"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.08] text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        City / Area
                                        <span className="text-gray-600 ml-1">(optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={formLocation}
                                        onChange={(e) => setFormLocation(e.target.value)}
                                        placeholder="e.g. San Francisco, CA"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.08] text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        Website URL Override
                                        <span className="text-gray-600 ml-1">(optional)</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={formUrl}
                                        onChange={(e) => setFormUrl(e.target.value)}
                                        placeholder="https://restaurant.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[.04] border border-white/[.08] text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleCreate}
                                disabled={!formName.trim() || creating}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-semibold"
                            >
                                {creating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                Create Import Job
                            </button>
                        </div>

                        {/* Instructions */}
                        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-5 space-y-3">
                            <h3 className="text-sm font-semibold text-gray-300">How it works</h3>
                            <ol className="space-y-2 text-xs text-gray-500 list-decimal list-inside">
                                <li>Enter a restaurant name and optionally its website</li>
                                <li>Pipeline discovers menu pages, PDFs, and images</li>
                                <li>Menu data is parsed via OCR + AI structuring</li>
                                <li>Images are enhanced to studio quality</li>
                                <li>A Menuvium-compatible ZIP is generated</li>
                            </ol>
                            <div className="pt-2 border-t border-white/[.04]">
                                <p className="text-xs text-gray-600">
                                    Tip: providing the website URL directly skips the discovery
                                    step and is the most reliable approach.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ---- Right: Jobs table ---- */}
                    <div className="space-y-4">
                        {/* Filter tabs */}
                        <div className="flex items-center gap-2">
                            {FILTER_TABS.map((tab) => (
                                <button
                                    key={tab.value}
                                    onClick={() => setFilter(tab.value)}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === tab.value
                                        ? "bg-white/10 text-white"
                                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                            <div className="flex-1" />
                            <button
                                onClick={() => fetchJobs()}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-500 hover:text-gray-300"
                                title="Refresh"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Jobs list */}
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="text-center py-20 text-gray-600">
                                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">No import jobs yet</p>
                                <p className="text-xs mt-1">
                                    Create one using the form on the left
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {jobs.map((job) => (
                                    <div
                                        key={job.id}
                                        className="rounded-xl border border-white/[.06] bg-white/[.02] hover:bg-white/[.04] transition-colors cursor-pointer"
                                        onClick={() => setSelectedJob(job)}
                                    >
                                        <div className="px-5 py-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="font-semibold text-sm truncate">
                                                            {job.restaurant_name}
                                                        </h3>
                                                        <StatusBadge status={job.status} />
                                                    </div>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                                        <span>{formatTime(job.created_at)}</span>
                                                        {job.current_step && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="truncate">
                                                                    {job.current_step}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {job.status === "COMPLETED" && job.result_zip_key && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDownload(job);
                                                            }}
                                                            className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                                            title="Download ZIP"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {(job.status === "QUEUED" || job.status === "RUNNING") && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCancel(job.id);
                                                            }}
                                                            className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-red-400 transition-colors"
                                                            title="Cancel"
                                                        >
                                                            <Ban className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRetry(job.id);
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-blue-400 transition-colors"
                                                        title="Retry"
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <ChevronRight className="w-4 h-4 text-gray-600" />
                                                </div>
                                            </div>
                                            {/* Progress bar */}
                                            {(job.status === "RUNNING" || job.status === "QUEUED") && (
                                                <div className="mt-3">
                                                    <ProgressBar
                                                        value={job.progress}
                                                        status={job.status}
                                                    />
                                                    <span className="text-[10px] text-gray-600 mt-1 block">
                                                        {job.progress}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ---- Detail drawer (slide over) ---- */}
            {selectedJob && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        onClick={() => setSelectedJob(null)}
                    />
                    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#0d1117] border-l border-white/[.06] shadow-2xl overflow-y-auto">
                        <div className="sticky top-0 z-10 bg-[#0d1117]/95 backdrop-blur-xl border-b border-white/[.06] px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-400" />
                                <h2 className="font-semibold text-base truncate">
                                    {selectedJob.restaurant_name}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={refreshSelectedJob}
                                    className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-500"
                                    title="Refresh"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedJob(null)}
                                    className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-500"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Status + Progress */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <StatusBadge status={selectedJob.status} />
                                    <span className="text-sm text-gray-400 font-medium">
                                        {selectedJob.progress}%
                                    </span>
                                </div>
                                <ProgressBar
                                    value={selectedJob.progress}
                                    status={selectedJob.status}
                                />
                                {selectedJob.current_step && (
                                    <p className="text-xs text-gray-500">
                                        Step: {selectedJob.current_step}
                                    </p>
                                )}
                            </div>

                            {/* Error */}
                            {selectedJob.error_message && (
                                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4">
                                    <p className="text-sm text-red-400 font-medium">Error</p>
                                    <p className="text-xs text-red-300/70 mt-1">
                                        {selectedJob.error_message}
                                    </p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                {selectedJob.status === "COMPLETED" &&
                                    selectedJob.result_zip_key && (
                                        <button
                                            onClick={() => handleDownload(selectedJob)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors"
                                        >
                                            <Download className="w-4 h-4" /> Download ZIP
                                        </button>
                                    )}
                                {(selectedJob.status === "QUEUED" ||
                                    selectedJob.status === "RUNNING") && (
                                        <button
                                            onClick={() => handleCancel(selectedJob.id)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors text-red-400"
                                        >
                                            <Ban className="w-4 h-4" /> Cancel
                                        </button>
                                    )}
                                <button
                                    onClick={() => handleRetry(selectedJob.id)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors"
                                >
                                    <RotateCcw className="w-4 h-4" /> Retry
                                </button>
                            </div>

                            {/* Metadata */}
                            {selectedJob.metadata_json && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Metadata
                                    </h3>
                                    <div className="rounded-xl bg-white/[.02] border border-white/[.06] p-4 space-y-2 text-xs">
                                        {Object.entries(selectedJob.metadata_json).map(
                                            ([key, value]) => (
                                                <div key={key} className="flex justify-between gap-4">
                                                    <span className="text-gray-500 shrink-0">
                                                        {key.replace(/_/g, " ")}
                                                    </span>
                                                    <span className="text-gray-300 truncate text-right">
                                                        {Array.isArray(value)
                                                            ? value.join(", ")
                                                            : String(value)}
                                                    </span>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Info */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Details
                                </h3>
                                <div className="rounded-xl bg-white/[.02] border border-white/[.06] p-4 space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Created</span>
                                        <span className="text-gray-300">
                                            {formatTime(selectedJob.created_at)}
                                        </span>
                                    </div>
                                    {selectedJob.started_at && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Started</span>
                                            <span className="text-gray-300">
                                                {formatTime(selectedJob.started_at)}
                                            </span>
                                        </div>
                                    )}
                                    {selectedJob.finished_at && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Finished</span>
                                            <span className="text-gray-300">
                                                {formatTime(selectedJob.finished_at)}
                                            </span>
                                        </div>
                                    )}
                                    {selectedJob.location_hint && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Location</span>
                                            <span className="text-gray-300">
                                                {selectedJob.location_hint}
                                            </span>
                                        </div>
                                    )}
                                    {selectedJob.website_override && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Website</span>
                                            <span className="text-gray-300 truncate max-w-[200px]">
                                                {selectedJob.website_override}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Job ID</span>
                                        <span className="text-gray-500 font-mono text-[10px]">
                                            {selectedJob.id}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Logs */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Logs
                                </h3>
                                <div className="rounded-xl bg-black/40 border border-white/[.06] p-4 max-h-80 overflow-y-auto font-mono text-[11px] space-y-1">
                                    {parseLogs(selectedJob.logs).length === 0 ? (
                                        <p className="text-gray-600">No logs yet</p>
                                    ) : (
                                        parseLogs(selectedJob.logs).map((entry, i) => (
                                            <div key={i} className="flex gap-2">
                                                <span className="text-gray-600 shrink-0 tabular-nums">
                                                    {new Date(entry.time).toLocaleTimeString(
                                                        "en-US",
                                                        {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            second: "2-digit",
                                                        }
                                                    )}
                                                </span>
                                                <span
                                                    className={
                                                        entry.message.startsWith("❌")
                                                            ? "text-red-400"
                                                            : entry.message.startsWith("✅")
                                                                ? "text-emerald-400"
                                                                : "text-gray-400"
                                                    }
                                                >
                                                    {entry.message}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
