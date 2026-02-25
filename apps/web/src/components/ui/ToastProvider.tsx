"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

type ToastVariant = "default" | "success" | "warning" | "error";

export type ToastInput = {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
};

type Toast = ToastInput & {
    id: string;
};

type ToastContextValue = {
    toast: (input: ToastInput) => void;
    dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function randomId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useToast(): ToastContextValue {
    const context = useContext(ToastContext);
    if (!context) {
        return {
            toast: () => { },
            dismiss: () => { },
        };
    }
    return context;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timeouts = useRef(new Map<string, number>());

    const dismiss = useCallback((id: string) => {
        const timeout = timeouts.current.get(id);
        if (timeout) {
            window.clearTimeout(timeout);
            timeouts.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((input: ToastInput) => {
        const id = randomId();
        const next: Toast = {
            id,
            title: input.title,
            description: input.description,
            variant: input.variant ?? "default",
            durationMs: input.durationMs ?? (input.variant === "error" ? 7000 : 4500),
        };

        setToasts((prev) => [next, ...prev].slice(0, 4));

        const timeout = window.setTimeout(() => dismiss(id), next.durationMs);
        timeouts.current.set(id, timeout);
    }, [dismiss]);

    const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:left-auto sm:right-4 sm:inset-x-auto sm:w-[380px]"
                aria-live="polite"
                aria-relevant="additions"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
                {toasts.map((t) => {
                    const variant = t.variant ?? "default";
                    const Icon =
                        variant === "success"
                            ? CheckCircle2
                            : variant === "warning"
                                ? AlertTriangle
                                : variant === "error"
                                    ? XCircle
                                    : Info;

                    const ring =
                        variant === "success"
                            ? "ring-emerald-500/15"
                            : variant === "warning"
                                ? "ring-amber-500/15"
                                : variant === "error"
                                    ? "ring-red-500/15"
                                    : "ring-[var(--cms-border)]/60";

                    const iconColor =
                        variant === "success"
                            ? "text-emerald-400"
                            : variant === "warning"
                                ? "text-amber-400"
                                : variant === "error"
                                    ? "text-red-400"
                                    : "text-[var(--cms-muted)]";

                    return (
                        <div
                            key={t.id}
                            role={variant === "error" ? "alert" : "status"}
                            className={`pointer-events-auto glass-subtle animate-fade-in-up rounded-2xl p-4 ring-1 ${ring}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 h-9 w-9 rounded-xl bg-[var(--cms-pill)] flex items-center justify-center ${iconColor}`}>
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-[var(--cms-text)]">
                                        {t.title}
                                    </p>
                                    {t.description ? (
                                        <p className="mt-1 text-sm text-[var(--cms-muted)] leading-relaxed">
                                            {t.description}
                                        </p>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismiss(t.id)}
                                    className="rounded-lg p-1.5 text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)] transition-colors"
                                    aria-label="Dismiss notification"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
