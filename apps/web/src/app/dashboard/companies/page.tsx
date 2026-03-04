"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus } from "lucide-react";
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
};

export default function CompaniesPage() {
    const { user } = useAuthenticator((context) => [context.user]);
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
            <header className="space-y-2">
                <h1 className="font-heading text-3xl font-bold tracking-tight">Companies</h1>
                <p className="text-muted">Keep each company simple and easy to manage.</p>
            </header>

            {loading && <div className="text-sm text-muted">Loading companies...</div>}

            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Create company</CardTitle>
                        <CardDescription>Add another restaurant or brand.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                        <Input
                            className="h-11 px-4"
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                            placeholder="Company name"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleCreate();
                                }
                            }}
                        />
                        <Button
                            className="w-full"
                            size="md"
                            loading={saving}
                            disabled={!newCompanyName.trim()}
                            onClick={() => void handleCreate()}
                        >
                            <Plus className="h-4 w-4" />
                            Create
                        </Button>
                    </CardContent>
                </Card>

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
                <div className="text-sm text-muted">No companies yet. Create your first one above.</div>
            )}
        </div>
    );
}
