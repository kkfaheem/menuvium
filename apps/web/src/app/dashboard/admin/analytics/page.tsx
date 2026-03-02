"use client";

import { useState, useEffect } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { BarChart3, Users, UtensilsCrossed, Layers, Activity, Sparkles, Box, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { adminApi, AdminAnalytics } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchAnalytics = async () => {
            try {
                const data = await adminApi.getAnalytics();
                setAnalytics(data);
            } catch (err: any) {
                console.error("Failed to load analytics", err);
                setError(err.message || "Failed to load analytics");
            } finally {
                setLoading(false);
            }
        };

        void fetchAnalytics();
    }, [user]);

    if (loading) {
        return <div className="text-muted p-8">Loading analytics...</div>;
    }

    if (error) {
        return (
            <div className="p-8 max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-red-500">Access Denied</CardTitle>
                        <CardDescription>{error}</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-[var(--cms-accent)]" />
                        Platform Analytics
                    </h1>
                    <p className="text-muted">High-level statistics for the Menuvium platform.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Total Organizations</p>
                            <h2 className="text-3xl font-bold mt-1">{analytics?.total_organizations ?? 0}</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                            <Users className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Total Menus</p>
                            <h2 className="text-3xl font-bold mt-1">{analytics?.total_menus ?? 0}</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                            <UtensilsCrossed className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Total Menu Items</p>
                            <h2 className="text-3xl font-bold mt-1">{analytics?.total_items ?? 0}</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                            <Layers className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Jobs Processed</p>
                            <h2 className="text-3xl font-bold mt-1">{analytics?.total_jobs ?? 0}</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                            <Activity className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">AI Tokens Used</p>
                            <h2 className="text-3xl font-bold mt-1">{(analytics?.total_ai_tokens ?? 0).toLocaleString()}</h2>
                            <p className="text-xs text-[#a1a1aa] mt-1">
                                Est. ${((analytics?.total_ai_tokens ?? 0) * 0.00000035).toFixed(4)} cost
                            </p>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                            <Sparkles className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="mt-12 space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Box className="w-5 h-5 text-[var(--cms-accent)]" />
                    AR Conversion Tracking
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted">Total Completed (Ready)</p>
                                <h2 className="text-3xl font-bold mt-1 text-green-500">{analytics?.ar_ready ?? 0}</h2>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted">Processing</p>
                                <h2 className="text-3xl font-bold mt-1 text-[var(--cms-accent)]">{analytics?.ar_processing ?? 0}</h2>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-[var(--cms-accent-subtle)] flex items-center justify-center text-[var(--cms-accent)]">
                                <Activity className="w-6 h-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted">Queued (Pending)</p>
                                <h2 className="text-3xl font-bold mt-1 text-yellow-500">{analytics?.ar_pending ?? 0}</h2>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                                <Clock className="w-6 h-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted">Failed</p>
                                <h2 className="text-3xl font-bold mt-1 text-red-500">{analytics?.ar_failed ?? 0}</h2>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
