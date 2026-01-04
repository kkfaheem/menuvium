"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";

type Company = {
    id: string;
    name: string;
    slug: string;
    owner_id?: string;
};

export default function CompaniesPage() {
    const { user } = useAuthenticator((context) => [context.user]);
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

    const getAuthToken = async () => {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        if (!token) {
            throw new Error("Not authenticated");
        }
        return token;
    };

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
                const err = await res.json();
                alert(err.detail || "Failed to create company");
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
            alert("Failed to create company");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (company: Company) => {
        const confirmDelete = confirm("Delete this company and all its menus?");
        if (!confirmDelete) return;
        const typed = prompt(`Type "${company.name}" to confirm deletion.`);
        if (typed !== company.name) return;

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
                alert(err.detail || "Failed to delete company");
                return;
            }
            setCompanies((prev) => prev.filter((org) => org.id !== company.id));
        } catch (e) {
            console.error(e);
            alert("Failed to delete company");
        } finally {
            setSaving(false);
        }
    };

    const displayCompanies = useMemo(() => companies, [companies]);

    return (
        <div className="w-full max-w-6xl mr-auto space-y-8">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
                    <p className="text-[var(--cms-muted)]">Invite teammates and manage access.</p>
                </div>
            </header>

            {loading && <div className="text-sm text-[var(--cms-muted)]">Loading companies...</div>}

            <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                            <Plus className="w-5 h-5 text-[var(--cms-text)]" />
                        </div>
                        <span className="text-xs font-semibold px-3 py-1 rounded-full border border-[var(--cms-border)] text-[var(--cms-muted)]">
                            New
                        </span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Create a company</h2>
                        <p className="text-sm text-[var(--cms-muted)] mt-1">Add another restaurant or brand.</p>
                    </div>
                    <div className="space-y-3">
                        <input
                            value={newCompanyName}
                            onChange={(e) => setNewCompanyName(e.target.value)}
                            placeholder="Company name"
                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)]"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleCreate();
                                }
                            }}
                        />
                        <button
                            onClick={handleCreate}
                            disabled={saving || !newCompanyName.trim()}
                            className="w-full px-5 py-3 rounded-2xl font-semibold bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                        >
                            Create
                        </button>
                    </div>
                </div>

                {displayCompanies.map((company) => {
                    return (
                        <div
                            key={company.id}
                            className="group relative bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-5 transition-colors hover:bg-[var(--cms-panel-strong)]"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <Link
                                    href={`/dashboard/companies/${company.id}`}
                                    className="flex items-start gap-3 min-w-0 flex-1 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--cms-text)]/20"
                                >
                                    <div className="w-11 h-11 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                                        <Building2 className="w-5 h-5 text-[var(--cms-text)]" />
                                    </div>
                                    <div className="min-w-0 pt-0.5">
                                        <div className="text-lg font-bold truncate">{company.name}</div>
                                        <div className="mt-1 text-sm text-[var(--cms-muted)]">
                                            Manage staff access and permissions
                                        </div>
                                    </div>
                                </Link>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDelete(company)}
                                        disabled={saving}
                                        className="h-9 w-9 rounded-full border border-[var(--cms-border)] text-red-400 hover:text-red-300 hover:bg-red-500/10 inline-flex items-center justify-center disabled:opacity-50 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <Link
                                        href={`/dashboard/companies/${company.id}`}
                                        className="h-9 w-9 rounded-full border border-[var(--cms-border)] hover:bg-[var(--cms-pill)] inline-flex items-center justify-center text-[var(--cms-muted)] hover:text-[var(--cms-text)] transition-colors"
                                        title="Open"
                                        aria-label={`Open ${company.name}`}
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center gap-2">
                                <Link
                                    href={`/dashboard/companies/${company.id}`}
                                    className="inline-flex items-center gap-2 rounded-full bg-[var(--cms-text)] px-4 py-2 text-sm font-semibold text-[var(--cms-bg)] hover:opacity-90"
                                >
                                    <Users className="w-4 h-4" />
                                    Team & permissions
                                </Link>

                                <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center gap-2 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] px-4 py-2 text-sm font-semibold text-[var(--cms-muted)] opacity-60 cursor-not-allowed"
                                    title="More company tools coming soon"
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                    More
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!loading && !displayCompanies.length && (
                <div className="text-sm text-[var(--cms-muted)]">No companies yet.</div>
            )}
        </div>
    );
}
