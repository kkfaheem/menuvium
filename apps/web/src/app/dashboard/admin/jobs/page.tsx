"use client";

import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { adminApi, AdminJob } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function JobRow({ job }: { job: AdminJob }) {
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
            </tr>
            {expanded && (
                <tr className="border-b border-border bg-black/20">
                    <td colSpan={5} className="p-6">
                        {loadingDetails ? (
                            <div className="text-muted text-sm animate-pulse">Loading detailed logs...</div>
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
                                                    return parsedLogs.join("\n");
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

export default function AdminJobsPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [jobs, setJobs] = useState<AdminJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (!user) return;

        const fetchJobs = async () => {
            try {
                setLoading(true);
                const data = await adminApi.getJobs(page, 50);
                setJobs(data.items);
                setTotal(data.total);
            } catch (err: any) {
                console.error("Failed to load jobs", err);
                setError(err.message || "Failed to load jobs");
            } finally {
                setLoading(false);
            }
        };

        void fetchJobs();
    }, [user, page]);

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Activity className="w-8 h-8 text-[var(--cms-accent)]" />
                        System Health
                    </h1>
                    <p className="text-muted">Monitor background workers and importer jobs.</p>
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
                                    <th className="p-4 font-semibold text-muted">Restaurant</th>
                                    <th className="p-4 font-semibold text-muted">Status</th>
                                    <th className="p-4 font-semibold text-muted">Job ID</th>
                                    <th className="p-4 font-semibold text-muted">Created At</th>
                                    <th className="p-4 font-semibold text-muted">Progress</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted">
                                            Loading jobs...
                                        </td>
                                    </tr>
                                ) : jobs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted">
                                            No recent jobs found.
                                        </td>
                                    </tr>
                                ) : (
                                    jobs.map((job) => <JobRow key={job.id} job={job} />)
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
