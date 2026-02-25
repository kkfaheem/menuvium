"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export type ConfirmOptions = {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "default" | "destructive";
    requireTextMatch?: string;
    requireTextLabel?: string;
    requireTextPlaceholder?: string;
};

type ConfirmContextValue = {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | undefined>(undefined);

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
    const context = useContext(ConfirmContext);
    if (!context) {
        return async (_options: ConfirmOptions) => false;
    }
    return context.confirm;
}

type ActiveConfirm = {
    options: ConfirmOptions;
};

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [active, setActive] = useState<ActiveConfirm | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);
    const [textValue, setTextValue] = useState("");

    const close = useCallback((value: boolean) => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setActive(null);
        setTextValue("");
        resolve?.(value);
    }, []);

    const confirm = useCallback((options: ConfirmOptions) => {
        setTextValue("");
        setActive({ options });
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    useEffect(() => {
        if (!active) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = prevOverflow;
        };
    }, [active, close]);

    const value = useMemo(() => ({ confirm }), [confirm]);

    const options = active?.options;
    const confirmLabel = options?.confirmLabel ?? "Confirm";
    const cancelLabel = options?.cancelLabel ?? "Cancel";
    const variant = options?.variant ?? "default";
    const isDestructive = variant === "destructive";
    const requiresText = Boolean(options?.requireTextMatch);
    const confirmDisabled =
        !options || (requiresText && textValue.trim() !== (options.requireTextMatch ?? ""));

    return (
        <ConfirmContext.Provider value={value}>
            {children}
            {options ? (
                <div
                    className="fixed inset-0 cms-modal-overlay backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in"
                    role="presentation"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) close(false);
                    }}
                >
                    <div
                        className="cms-modal-shell ring-1 ring-[var(--cms-border)] w-full max-w-md rounded-[28px] max-h-[90vh] flex flex-col backdrop-blur-xl animate-fade-in-scale"
                        role="dialog"
                        aria-modal="true"
                        aria-label={options.title}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex justify-between items-start border-b border-[var(--cms-border)] rounded-t-[28px]">
                            <div className="flex items-start gap-3">
                                <div
                                    className={`mt-0.5 h-10 w-10 rounded-2xl flex items-center justify-center ${isDestructive
                                        ? "bg-red-500/10 text-red-400"
                                        : "bg-[var(--cms-accent)]/10 text-[var(--cms-accent)]"
                                        }`}
                                >
                                    {isDestructive ? (
                                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                                    ) : (
                                        <Info className="h-5 w-5" aria-hidden="true" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">{options.title}</h2>
                                    {options.description ? (
                                        <p className="mt-1 text-sm text-[var(--cms-muted)] leading-relaxed">
                                            {options.description}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => close(false)}
                                className="rounded-xl p-2 text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)] transition-colors"
                                aria-label="Close dialog"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto">
                            {requiresText ? (
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-[var(--cms-text)]">
                                        {options.requireTextLabel ??
                                            `Type "${options.requireTextMatch}" to confirm.`}
                                    </p>
                                    <Input
                                        value={textValue}
                                        onChange={(e) => setTextValue(e.target.value)}
                                        placeholder={options.requireTextPlaceholder ?? "Type to confirm"}
                                        className="h-11"
                                        autoFocus
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="cms-modal-footer p-6 pt-4 border-t border-[var(--cms-border)] flex justify-end gap-3 flex-shrink-0 rounded-b-[28px]">
                            <Button type="button" variant="secondary" size="lg" onClick={() => close(false)}>
                                {cancelLabel}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => close(true)}
                                disabled={confirmDisabled}
                                variant={isDestructive ? "destructive" : "primary"}
                                size="lg"
                            >
                                {confirmLabel}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </ConfirmContext.Provider>
    );
}
