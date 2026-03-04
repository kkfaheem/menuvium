"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus, X } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

type Company = {
    id: string;
    name: string;
    slug: string;
    owner_id?: string;
    address?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state_province?: string | null;
    country?: string | null;
    postal_code?: string | null;
};

export default function CompaniesPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const { toast } = useToast();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCompanyName, setNewCompanyName] = useState("");
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const slugify = (value: string) =>
        value
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");

    const loadCompanies = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                throw new Error("Failed to load companies");
            }
            const data = (await res.json()) as Company[];
            const userSub = getJwtSub(token);
            const owned = userSub ? data.filter((org) => org.owner_id === userSub) : [];
            setCompanies(owned);
            if (typeof window !== "undefined") {
                const stored = localStorage.getItem("menuvium_last_org_id");
                const next = stored && owned.find((org) => org.id === stored) ? stored : owned[0]?.id;
                if (next) {
                    localStorage.setItem("menuvium_last_org_id", next);
                }
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to load companies",
                description: "Please refresh and try again.",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadCompanies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (!createModalOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !saving) {
                setCreateModalOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [createModalOpen, saving]);

    const handleCreate = async () => {
        if (!newCompanyName.trim()) return;
        setSaving(true);
        try {
            const token = await getAuthToken();
            const payload = {
                name: newCompanyName.trim(),
                slug: slugify(newCompanyName)
            };
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/organizations/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as { detail?: unknown }).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to create company",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const created = (await res.json()) as Company;
            setCompanies((prev) => [created, ...prev]);
            setNewCompanyName("");
            setCreateModalOpen(false);
            if (typeof window !== "undefined") {
                localStorage.setItem("menuvium_last_org_id", created.id);
            }
            toast({ variant: "success", title: "Company created" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to create company",
                description: "Please try again in a moment.",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mr-auto space-y-8">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight">Companies</h1>
                    <p className="text-muted">Keep each company simple and easy to manage.</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setNewCompanyName("");
                        setCreateModalOpen(true);
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 w-full sm:w-auto"
                >
                    <Plus className="h-4 w-4" />
                    Create Company
                </button>
            </header>

            {loading && <div className="text-sm text-muted">Loading companies...</div>}

            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((company) => (
                    <Link
                        key={company.id}
                        href={`/dashboard/companies/${company.id}`}
                        className="group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                    >
                        <Card className="transition-colors group-hover:bg-panelStrong">
                            <CardContent className="py-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pill">
                                            <Building2 className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-foreground">{company.name}</p>
                                            <p className="text-xs text-muted">Open company</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted transition-colors group-hover:text-foreground" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {!loading && companies.length === 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>No companies yet</CardTitle>
                        <CardDescription>Create your first company from the top right.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <button
                            type="button"
                            onClick={() => {
                                setNewCompanyName("");
                                setCreateModalOpen(true);
                            }}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            <Plus className="h-4 w-4" />
                            Create Company
                        </button>
                    </CardContent>
                </Card>
            )}

            {createModalOpen && (
                <div className="fixed inset-0 cms-modal-overlay z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0"
                        onClick={() => {
                            if (!saving) setCreateModalOpen(false);
                        }}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-company-title"
                        className="cms-modal-shell ring-1 ring-[var(--cms-border)] w-full max-w-md rounded-[28px] max-h-[90vh] flex flex-col backdrop-blur-xl"
                    >
                        <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex items-start justify-between border-b border-[var(--cms-border)] rounded-t-[28px]">
                            <div className="space-y-1">
                                <h2 id="create-company-title" className="text-xl font-bold tracking-tight">
                                    Create company
                                </h2>
                                <p className="text-sm text-[var(--cms-muted)]">Add a new restaurant or brand name.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!saving) setCreateModalOpen(false);
                                }}
                                className="h-9 w-9 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] flex items-center justify-center text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                aria-label="Close create company popup"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="text-sm font-semibold" htmlFor="create-company-name">
                                Company name
                            </label>
                            <Input
                                id="create-company-name"
                                className="h-11 px-4"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Company name"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleCreate();
                                    }
                                }}
                            />
                        </div>
                        <div className="cms-modal-footer p-6 pt-4 border-t border-[var(--cms-border)] flex justify-end gap-3 flex-shrink-0 rounded-b-[28px]">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={saving}
                                onClick={() => setCreateModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                loading={saving}
                                disabled={!newCompanyName.trim()}
                                onClick={() => void handleCreate()}
                            >
                                <Plus className="h-4 w-4" />
                                Create
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
