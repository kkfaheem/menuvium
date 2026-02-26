"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";

type Company = {
    id: string;
    name: string;
    slug: string;
    owner_id?: string;
};

export default function CompaniesPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const confirm = useConfirm();
    const { toast } = useToast();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCompanyName, setNewCompanyName] = useState("");
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
            if (!res.ok) return;
            const data = (await res.json()) as Company[];
            const userSub = getJwtSub(token);
            const owned = userSub ? data.filter((org) => org.owner_id === userSub) : [];
            setCompanies(owned);
            if (typeof window !== "undefined") {
                const stored = localStorage.getItem("menuvium_last_org_id");
                const next = stored && owned.find((org: Company) => org.id === stored) ? stored : owned[0]?.id;
                if (next) {
                    localStorage.setItem("menuvium_last_org_id", next);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCompanies();
    }, [user]);

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
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to create company",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const created = await res.json();
            setCompanies((prev) => [created, ...prev]);
            setNewCompanyName("");
            if (typeof window !== "undefined") {
                localStorage.setItem("menuvium_last_org_id", created.id);
            }
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

    const handleDelete = async (company: Company) => {
        const ok = await confirm({
            title: "Delete company?",
            description: "This permanently deletes the company and all its menus.",
            confirmLabel: "Delete",
            variant: "destructive",
            requireTextMatch: company.name,
            requireTextLabel: `Type "${company.name}" to confirm.`,
        });
        if (!ok) return;

        setSaving(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/organizations/${company.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to delete company",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            setCompanies((prev) => prev.filter((org) => org.id !== company.id));
            toast({
                variant: "success",
                title: "Company deleted",
            });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to delete company",
                description: "Please try again in a moment.",
            });
        } finally {
            setSaving(false);
        }
    };

	    const displayCompanies = useMemo(() => companies, [companies]);

	    return (
	        <div className="w-full max-w-6xl mr-auto space-y-8">
	            <header className="space-y-2">
	                <Badge variant="outline">Companies</Badge>
	                <h1 className="font-heading text-3xl font-bold tracking-tight">Companies</h1>
	                <p className="text-muted">Invite teammates and manage access.</p>
	            </header>

            {loading && <div className="text-sm text-muted">Loading companies...</div>}

            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pill">
                                <Plus className="h-5 w-5" />
                            </div>
                            <div>
                                <CardTitle>Create a company</CardTitle>
                                <CardDescription>Add another restaurant or brand.</CardDescription>
                            </div>
                        </div>
                        <Badge variant="outline">New</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <Input
                                className="h-11 px-4"
                                value={newCompanyName}
                                onChange={(e) => setNewCompanyName(e.target.value)}
                                placeholder="Company name"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleCreate();
                                    }
                                }}
                            />
                            <Button
                                className="w-full sm:w-auto"
                                size="md"
                                loading={saving}
                                disabled={!newCompanyName.trim()}
                                onClick={handleCreate}
                            >
                                <Plus className="h-4 w-4" />
                                Create
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {displayCompanies.map((company) => {
                    return (
                        <Card key={company.id} className="group transition-colors hover:bg-panelStrong">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <Link
                                    href={`/dashboard/companies/${company.id}`}
                                    className="flex min-w-0 flex-1 items-start gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/25"
                                >
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pill">
                                        <Building2 className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 pt-0.5">
                                        <CardTitle className="truncate">{company.name}</CardTitle>
                                        <CardDescription>Manage staff access and permissions.</CardDescription>
                                    </div>
                                </Link>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDelete(company)}
                                        disabled={saving}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    <Link
                                        href={`/dashboard/companies/${company.id}`}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:bg-pill hover:text-foreground"
                                        title="Open"
                                        aria-label={`Open ${company.name}`}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </CardHeader>

                            <CardContent className="pt-0">
                                <Link
                                    href={`/dashboard/companies/${company.id}`}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                                >
                                    <Users className="h-4 w-4 text-[var(--cms-accent-strong)]" />
                                    Team & permissions
                                </Link>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {!loading && !displayCompanies.length && (
                <div className="text-sm text-muted">No companies yet.</div>
            )}
        </div>
    );
}
