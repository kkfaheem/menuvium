"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Clipboard, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";

type FormState = {
    name: string;
    email: string;
    company: string;
    locations: string;
    timeline: string;
    interests: string[];
    message: string;
};

const INTEREST_OPTIONS = [
    "Menu studio",
    "AR models (video → 3D)",
    "Multi-brand / franchise",
    "Custom domain",
    "SSO / enterprise auth",
];

export default function ContactClient({ plan }: { plan?: string }) {
    const { toast } = useToast();
    const normalizedPlan = (plan || "").toLowerCase();

    const [state, setState] = useState<FormState>({
        name: "",
        email: "",
        company: "",
        locations: "1",
        timeline: "This month",
        interests: normalizedPlan === "enterprise" ? ["Multi-brand / franchise"] : [],
        message: "",
    });
    const [copied, setCopied] = useState(false);

    const subject = useMemo(() => {
        const base = normalizedPlan === "enterprise" ? "Enterprise inquiry" : "Contact inquiry";
        const company = state.company.trim();
        return company ? `Menuvium — ${base} (${company})` : `Menuvium — ${base}`;
    }, [normalizedPlan, state.company]);

    const emailBody = useMemo(() => {
        const lines = [
            `Name: ${state.name || "-"}`,
            `Email: ${state.email || "-"}`,
            `Company: ${state.company || "-"}`,
            `Locations: ${state.locations || "-"}`,
            `Timeline: ${state.timeline || "-"}`,
            `Interests: ${state.interests.length ? state.interests.join(", ") : "-"}`,
            "",
            "Message:",
            state.message || "-",
        ];
        return lines.join("\n");
    }, [state]);

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const name = state.name.trim();
        const email = state.email.trim();
        const company = state.company.trim();
        const message = state.message.trim();

        if (!name || !email || !company || !message) {
            toast({
                variant: "error",
                title: "Missing details",
                description: "Please fill name, email, company, and message.",
            });
            return;
        }

        const mailto = `mailto:menuvium@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        toast({
            variant: "success",
            title: "Opening email draft…",
            description: "If nothing opens, use “Copy message” below.",
        });
        window.location.href = mailto;
    };

    const toggleInterest = (value: string) => {
        setState((prev) => {
            const next = prev.interests.includes(value)
                ? prev.interests.filter((v) => v !== value)
                : [...prev.interests, value];
            return { ...prev, interests: next };
        });
    };

    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(emailBody);
            setCopied(true);
            toast({ variant: "success", title: "Copied message" });
            window.setTimeout(() => setCopied(false), 1600);
        } catch {
            toast({
                variant: "error",
                title: "Could not copy",
                description: "Please copy manually from the preview box.",
            });
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground transition-colors">
            <header className="sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                    <Link
                        href="/"
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-panelStrong px-3 text-sm font-semibold text-muted shadow-sm transition-colors hover:bg-pill hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                    <Logo size="lg" />
                    <div className="flex items-center gap-3">
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
                <section className="flex flex-col justify-center gap-6">
                    <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-accent-strong)]">
                            Contact
                        </p>
                        <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                            Let’s talk about your <span className="text-[var(--cms-accent-strong)]">menu studio</span>.
                        </h1>
                        <p className="max-w-xl text-base leading-relaxed text-muted">
                            Share a bit about what you’re building and we’ll get back to you. If you’re looking at Enterprise, tell us how
                            many brands and locations you manage.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-muted">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-pill">
                            <Mail className="h-5 w-5" />
                        </span>
                        <div>
                            <p className="font-semibold text-foreground">menuvium@gmail.com</p>
                            <p className="text-xs">We usually reply within 1–2 business days.</p>
                        </div>
                    </div>
                </section>

                <section className="flex items-center justify-center lg:justify-end">
                    <div className="w-full max-w-lg">
                        <Card>
                            <CardHeader>
                                <CardTitle>Contact form</CardTitle>
                                <CardDescription>We’ll open an email draft to `menuvium@gmail.com` with your answers.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form className="space-y-4" onSubmit={handleSubmit}>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted">Full name *</label>
                                            <Input
                                                value={state.name}
                                                onChange={(e) => setState((p) => ({ ...p, name: e.target.value }))}
                                                placeholder="Your name"
                                                autoComplete="name"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted">Email *</label>
                                            <Input
                                                value={state.email}
                                                onChange={(e) => setState((p) => ({ ...p, email: e.target.value }))}
                                                placeholder="you@company.com"
                                                type="email"
                                                autoComplete="email"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-muted">Company / restaurant *</label>
                                        <Input
                                            value={state.company}
                                            onChange={(e) => setState((p) => ({ ...p, company: e.target.value }))}
                                            placeholder="Company name"
                                            autoComplete="organization"
                                        />
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted">Locations</label>
                                            <select
                                                value={state.locations}
                                                onChange={(e) => setState((p) => ({ ...p, locations: e.target.value }))}
                                                className="h-11 w-full rounded-xl border border-border bg-panel px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)]"
                                            >
                                                {["1", "2–5", "6–20", "21+"].map((opt) => (
                                                    <option key={opt} value={opt}>
                                                        {opt}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted">Timeline</label>
                                            <select
                                                value={state.timeline}
                                                onChange={(e) => setState((p) => ({ ...p, timeline: e.target.value }))}
                                                className="h-11 w-full rounded-xl border border-border bg-panel px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)]"
                                            >
                                                {["This week", "This month", "This quarter", "Not sure"].map((opt) => (
                                                    <option key={opt} value={opt}>
                                                        {opt}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-muted">Interested in</label>
                                        <div className="flex flex-wrap gap-2">
                                            {INTEREST_OPTIONS.map((opt) => {
                                                const active = state.interests.includes(opt);
                                                return (
                                                    <button
                                                        key={opt}
                                                        type="button"
                                                        onClick={() => toggleInterest(opt)}
                                                        className={cn(
                                                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                                                            active
                                                                ? "border-transparent bg-[var(--cms-accent-subtle)] text-[var(--cms-accent-strong)]"
                                                                : "border-border bg-panelStrong text-muted hover:bg-pill hover:text-foreground"
                                                        )}
                                                        aria-pressed={active}
                                                    >
                                                        {opt}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-muted">Message *</label>
                                        <textarea
                                            value={state.message}
                                            onChange={(e) => setState((p) => ({ ...p, message: e.target.value }))}
                                            placeholder="Tell us what you want to build, what matters most, and any constraints."
                                            className="w-full min-h-[120px] rounded-2xl border border-border bg-panel px-3 py-3 text-sm text-foreground shadow-sm placeholder:text-[var(--cms-muted-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] transition-[border-color,box-shadow]"
                                        />
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Button size="lg" type="submit" className="w-full">
                                            Open email draft
                                        </Button>
                                        <Button
                                            size="lg"
                                            type="button"
                                            variant="secondary"
                                            className="w-full"
                                            onClick={copyMessage}
                                        >
                                            {copied ? (
                                                <>
                                                    <CheckCircle2 className="h-4 w-4" /> Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Clipboard className="h-4 w-4" /> Copy message
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    <div className="rounded-2xl border border-border bg-panelStrong p-4">
                                        <p className="text-xs font-semibold text-muted">Preview</p>
                                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted leading-relaxed">
                                            {emailBody}
                                        </p>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </main>
        </div>
    );
}

