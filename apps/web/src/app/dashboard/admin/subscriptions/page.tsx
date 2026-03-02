"use client";

import { CreditCard, TrendingUp, Users, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function AdminSubscriptionsPage() {
    return (
        <div className="space-y-6">
            <header className="mb-8">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight flex items-center gap-3">
                        <CreditCard className="w-8 h-8 text-[var(--cms-accent)]" />
                        Subscription & Billing
                    </h1>
                    <p className="text-muted">Monitor platform revenue and manage company plan tiers.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Estimated MRR</p>
                            <h2 className="text-3xl font-bold mt-1">$0.00</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Pro Subscriptions</p>
                            <h2 className="text-3xl font-bold mt-1">0</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Shield className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Trialing</p>
                            <h2 className="text-3xl font-bold mt-1">0</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted">Churn Rate (30d)</p>
                            <h2 className="text-3xl font-bold mt-1">0%</h2>
                        </div>
                        <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="opacity-60 border-dashed">
                <CardHeader>
                    <CardTitle className="text-lg">Active Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-border bg-panelStrong/50">
                                    <th className="p-4 font-semibold text-muted">Company</th>
                                    <th className="p-4 font-semibold text-muted">Plan</th>
                                    <th className="p-4 font-semibold text-muted">Status</th>
                                    <th className="p-4 font-semibold text-muted">Next Billing</th>
                                    <th className="p-4 font-semibold text-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted italic">
                                        Stripe Integration Pending - Subscription data will appear here once the billing module is connected.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Shield({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        </svg>
    );
}
