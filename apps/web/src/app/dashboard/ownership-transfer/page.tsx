"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";

type VerifyOwnershipTransferResponse = {
    ok: boolean;
    detail: string;
    org_id: string;
    org_name: string;
    new_owner_email: string;
};

export default function OwnershipTransferPage() {
    const searchParams = useSearchParams();
    const token = (searchParams.get("token") || "").trim();
    const apiBase = getApiBase();

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<VerifyOwnershipTransferResponse | null>(null);

    const verifyTransfer = async () => {
        if (!token) {
            setError("Missing ownership transfer token.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const authToken = await getAuthToken();
            const res = await fetch(`${apiBase}/organizations/ownership-transfer/verify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ token }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
                throw new Error(typeof detail === "string" ? detail : "Could not verify ownership transfer.");
            }
            setResult((await res.json()) as VerifyOwnershipTransferResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not verify ownership transfer.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-2xl space-y-6">
            <Link
                href="/dashboard/companies"
                className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> Back to Companies
            </Link>

            <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-6 space-y-4">
                <h1 className="font-heading text-2xl font-bold tracking-tight">Ownership transfer verification</h1>

                {!token ? (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                        Missing verification token. Open this page from the ownership transfer email link.
                    </div>
                ) : result ? (
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" />
                            {result.detail}
                        </div>
                        <p className="text-sm text-[var(--cms-muted)]">
                            You are now the owner of <span className="font-semibold text-[var(--cms-text)]">{result.org_name}</span>.
                        </p>
                        <Link
                            href={`/dashboard/companies/${result.org_id}`}
                            className="inline-flex h-10 items-center rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]"
                        >
                            Open company settings
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-[var(--cms-muted)]">
                            Confirm this transfer to become the new owner for this company.
                        </p>
                        {error && (
                            <div className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                <ShieldAlert className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => void verifyTransfer()}
                            disabled={submitting}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)] disabled:opacity-60"
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Confirm ownership transfer
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
}
