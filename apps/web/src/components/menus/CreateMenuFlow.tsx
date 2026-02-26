"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Check, Loader2, PencilLine, Sparkles, Link, Upload, Package } from "lucide-react";
import { getApiBase, getUploadApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions, type OrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/ToastProvider";

interface ParsedItem {
    name: string;
    description?: string;
    price?: number | null;
}

interface ParsedCategory {
    name: string;
    items: ParsedItem[];
}

interface ParsedMenu {
    categories: ParsedCategory[];
}

type CreateMenuFlowProps = {
    initialOrgId?: string;
    allowOrgSelect?: boolean;
    organizations?: { id: string; name: string }[];
    variant?: "light" | "dark" | "auto";
    onCreated?: (menuId: string) => void;
    initialMenuName?: string;
    lockMenuName?: boolean;
    showMenuDetails?: boolean;
    heroLabel?: string;
    heroTitle?: string;
    heroDescription?: string;
};

const readFetchErrorDetail = async (res: Response) => {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        const err = await res.json().catch(() => null);
        const detail =
            err && typeof err === "object" && "detail" in err ? (err as any).detail : undefined;
        if (typeof detail === "string" && detail.trim()) return detail;
    }

    if (res.status === 413) {
        return "ZIP is too large for the proxy. Upload directly to your API domain (CORS required) and try again.";
    }

    return `Request failed (HTTP ${res.status}).`;
};

export default function CreateMenuFlow({
    initialOrgId,
    allowOrgSelect = true,
    organizations: providedOrganizations,
    variant = "light",
    onCreated,
    initialMenuName,
    lockMenuName = false,
    showMenuDetails = true,
    heroLabel = "New Menu",
    heroTitle = "Build a menu guests actually scan",
    heroDescription = "Start clean or import a menu file. You can fine‑tune everything after."
}: CreateMenuFlowProps) {
    const { user } = useAuthenticator((context) => [context.user]);
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const { toast } = useToast();
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>(providedOrganizations || []);
    const [selectedOrg, setSelectedOrg] = useState<string>(initialOrgId || "");
    const [menuName, setMenuName] = useState(initialMenuName || "");
    const [mode, setMode] = useState<"manual" | "import">("import");
    const [creating, setCreating] = useState(false);
    const [importFiles, setImportFiles] = useState<File[]>([]);
    const [importUrl, setImportUrl] = useState("");
    const [importTab, setImportTab] = useState<"files" | "url" | "menuvium">("files");
    const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [draftMenuId, setDraftMenuId] = useState<string | null>(null);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [permissionsError, setPermissionsError] = useState<string | null>(null);
    // Menuvium ZIP import state
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [zipPreview, setZipPreview] = useState<{
        version: string;
        menu_name: string;
        categories_count: number;
        items_count: number;
        has_images: boolean;
    } | null>(null);
    const [isPreviewingZip, setIsPreviewingZip] = useState(false);
    const [isImportingZip, setIsImportingZip] = useState(false);
    const importFilesInputRef = useRef<HTMLInputElement | null>(null);
    const importZipInputRef = useRef<HTMLInputElement | null>(null);

    const [resolvedVariant, setResolvedVariant] = useState<"light" | "dark">(
        variant === "dark" ? "dark" : "light"
    );

    useEffect(() => {
        if (variant === "auto") {
            setResolvedVariant(resolvedTheme);
            return;
        }
        setResolvedVariant(variant === "dark" ? "dark" : "light");
    }, [variant, resolvedTheme]);

    useEffect(() => {
        if (!initialOrgId) return;
        setSelectedOrg(initialOrgId);
    }, [initialOrgId]);

    const palette = useMemo(() => {
        if (variant === "auto") {
            return {
                panel: "bg-[var(--cms-panel)] border-[var(--cms-border)]",
                panelMuted: "bg-[var(--cms-panel-strong)] border-[var(--cms-border)]",
                text: "text-[var(--cms-text)]",
                muted: "text-[var(--cms-muted)]",
                pill: "bg-[var(--cms-pill)]",
                input: "bg-[var(--cms-panel)] border-[var(--cms-border)] text-[var(--cms-text)] placeholder:text-[var(--cms-muted-strong)]",
                primary: "bg-[var(--cms-text)] text-[var(--cms-bg)]",
                border: "border-[var(--cms-border)]",
                dotActive: "bg-[var(--cms-text)]",
                dotMuted: "bg-[var(--cms-border)]"
            };
        }

        const isDark = resolvedVariant === "dark";
        return {
            panel: isDark ? "bg-white/5 border-white/10" : "bg-[var(--cms-panel)] border-[var(--cms-border)]",
            panelMuted: isDark ? "bg-white/3 border-white/10" : "bg-[var(--cms-panel)]/70 border-[var(--cms-border)]",
            text: isDark ? "text-white" : "text-[var(--cms-text)]",
            muted: isDark ? "text-white/60" : "text-[var(--cms-muted)]",
            pill: isDark ? "bg-white/10" : "bg-[var(--cms-pill)]",
            input: isDark
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/40"
                : "bg-transparent border-[var(--cms-border)] text-[var(--cms-text)] placeholder:text-[var(--cms-muted)]",
            primary: isDark
                ? "bg-white text-black"
                : "bg-[var(--cms-text)] text-[var(--cms-bg)]",
            border: isDark ? "border-white/10" : "border-[var(--cms-border)]",
            dotActive: isDark ? "bg-white" : "bg-[var(--cms-text)]",
            dotMuted: isDark ? "bg-white/30" : "bg-[var(--cms-border)]"
        };
    }, [resolvedVariant, variant]);

    useEffect(() => {
        if (!allowOrgSelect || providedOrganizations) return;
        fetchOrganizations();
    }, [user, allowOrgSelect, providedOrganizations]);

    useEffect(() => {
        if (initialOrgId) setSelectedOrg(initialOrgId);
    }, [initialOrgId]);

    useEffect(() => {
        if (initialMenuName !== undefined) {
            setMenuName(initialMenuName);
        }
    }, [initialMenuName]);

    useEffect(() => {
        if (!selectedOrg || typeof window === "undefined") return;
        localStorage.setItem("menuvium_last_org_id", selectedOrg);
    }, [selectedOrg]);

    useEffect(() => {
        const load = async () => {
            if (!user || !selectedOrg) return;
            setPermissionsLoading(true);
            setPermissionsError(null);
            try {
                const token = await getAuthToken();
                const apiBase = getApiBase();
                const perms = await fetchOrgPermissions({ apiBase, token, orgId: selectedOrg });
                setOrgPermissions(perms);
            } catch (e) {
                console.error(e);
                setOrgPermissions(null);
                setPermissionsError(e instanceof Error ? e.message : "Failed to load permissions");
            } finally {
                setPermissionsLoading(false);
            }
        };
        load();
    }, [user, selectedOrg]);

    const fetchOrganizations = async () => {
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const orgRes = await fetch(`${apiBase}/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!orgRes.ok) return;
            const orgs = await orgRes.json();
            if (!orgs.length) return;
            setOrganizations(orgs);
            if (orgs.length > 0 && !selectedOrg) {
                setSelectedOrg(orgs[0].id);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const ensureDraftMenu = async () => {
        if (!selectedOrg) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to create menus for this company.",
            });
            return;
        }
        if (draftMenuId) return draftMenuId;
        const resolvedName = !menuName.trim() ? "Imported Menu" : menuName.trim();
        setCreating(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: resolvedName,
                    org_id: selectedOrg
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to create menu",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
                return;
            }
            const data = await res.json();
            setDraftMenuId(data.id);
            return data.id as string;
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const createManualMenu = async () => {
        if (!menuName.trim() || !selectedOrg) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to create menus for this company.",
            });
            return;
        }
        setCreating(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: menuName.trim(),
                    org_id: selectedOrg
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to create menu",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
                return;
            }
            const data = await res.json();
            if (onCreated) {
                onCreated(data.id);
            } else {
                router.push(`/dashboard/menus/${data.id}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const handleParseImport = async () => {
        if (importTab === "files" && importFiles.length === 0) return;
        if (importTab === "url" && !importUrl.trim()) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to create menus for this company.",
            });
            return;
        }
        const menuId = await ensureDraftMenu();
        if (!menuId) return;
        setIsParsing(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            let res: Response;

            if (importTab === "url") {
                // URL-based import
                res = await fetch(`${apiBase}/imports/menu/parse-url?menu_id=${menuId}&url=${encodeURIComponent(importUrl.trim())}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else if (importFiles.length === 1) {
                // Single file import (original endpoint for backwards compatibility)
                const formData = new FormData();
                formData.append("file", importFiles[0]);
                res = await fetch(`${apiBase}/imports/menu/parse?menu_id=${menuId}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
            } else {
                // Multi-file import
                const formData = new FormData();
                importFiles.forEach((file) => {
                    formData.append("files", file);
                });
                res = await fetch(`${apiBase}/imports/menu/parse-multi?menu_id=${menuId}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Couldn’t parse menu",
                    description: typeof detail === "string" ? detail : "Please try a different file.",
                });
                return;
            }
            setParsedMenu(await res.json());
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Couldn’t parse menu",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsParsing(false);
        }
    };

    const handleApplyImport = async () => {
        if (!parsedMenu) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to create menus for this company.",
            });
            return;
        }
        const menuId = draftMenuId ?? (await ensureDraftMenu());
        if (!menuId) return;
        setIsImporting(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/imports/menu/apply?menu_id=${menuId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(parsedMenu)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Import failed",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            if (onCreated) {
                onCreated(menuId);
            } else {
                router.push(`/dashboard/menus/${menuId}`);
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Import failed",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsImporting(false);
        }
    };

    // Handle ZIP file selection and preview
    const handleZipFileChange = async (file: File | null) => {
        setZipFile(file);
        setZipPreview(null);
        if (!file) return;

        setIsPreviewingZip(true);
        try {
            const token = await getAuthToken();
            const apiBase = getUploadApiBase();
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`${apiBase}/imports/menu/preview-zip`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const detail = await readFetchErrorDetail(res);
                toast({
                    variant: "error",
                    title: "Couldn’t preview ZIP",
                    description: detail || "Please try again.",
                });
                setZipFile(null);
                return;
            }

            setZipPreview(await res.json());
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Couldn’t preview ZIP",
                description:
                    "Upload failed. If you're using a Vercel proxy (/api), large ZIPs can exceed request limits — set NEXT_PUBLIC_API_UPLOAD_URL to your API domain (and allow CORS).",
            });
            setZipFile(null);
        } finally {
            setIsPreviewingZip(false);
        }
    };

    // Import from Menuvium ZIP
    const handleImportFromZip = async () => {
        if (!zipFile || !zipPreview) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to create menus for this company.",
            });
            return;
        }

        const menuId = draftMenuId ?? (await ensureDraftMenu());
        if (!menuId) return;

        setIsImportingZip(true);
        try {
            const token = await getAuthToken();
            const apiBase = getUploadApiBase();
            const formData = new FormData();
            formData.append("file", zipFile);

            const res = await fetch(`${apiBase}/imports/menu/from-zip?menu_id=${menuId}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const detail = await readFetchErrorDetail(res);
                toast({
                    variant: "error",
                    title: "ZIP import failed",
                    description: detail || "Please try again.",
                });
                return;
            }

            const result = await res.json();
            console.log("Import result:", result);

            if (onCreated) {
                onCreated(menuId);
            } else {
                router.push(`/dashboard/menus/${menuId}`);
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "ZIP import failed",
                description:
                    "Upload failed. If you're using a Vercel proxy (/api), large ZIPs can exceed request limits — set NEXT_PUBLIC_API_UPLOAD_URL to your API domain (and allow CORS).",
            });
        } finally {
            setIsImportingZip(false);
        }
    };

    const selectedOrgName = organizations.find((org) => org.id === selectedOrg)?.name || "Company locked";
    const canManageMenus = orgPermissions ? orgPermissions.can_manage_menus : true;

    // Helper to check if step is complete
    const isStep1Complete = Boolean(mode);
    const isStep2Complete =
        mode === "manual" ||
        (mode === "import" &&
            ((importTab === "files" && importFiles.length > 0) ||
                (importTab === "url" && importUrl.trim().length > 0) ||
                (importTab === "menuvium" && Boolean(zipFile))));
    const isStep3Complete = selectedOrg !== "";

    // Step indicator component
    const StepIndicator = ({ number, title, isActive, isComplete }: { number: number; title: string; isActive: boolean; isComplete: boolean }) => (
        <div className="flex items-center gap-3 mb-4">
            <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                ${isComplete
                    ? "bg-emerald-600 text-white shadow-sm"
                    : isActive
                        ? "bg-[var(--cms-accent)] text-white shadow-sm"
                        : `border-2 ${palette.border} ${palette.muted}`
                }
            `}>
                {isComplete ? <Check className="w-4 h-4" /> : number}
            </div>
            <div>
                <span className={`text-xs uppercase tracking-wide ${isActive || isComplete ? palette.text : palette.muted}`}>
                    Step {number}
                </span>
                <h3 className={`font-heading text-base font-semibold tracking-tight ${palette.text}`}>{title}</h3>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Hero Section - Simplified */}
            <div className={`relative overflow-hidden rounded-2xl border ${palette.border} ${palette.panel} p-6 md:p-8`}>
                <div className="text-center max-w-xl mx-auto">
                    <p className={`text-xs uppercase tracking-[0.3em] ${palette.muted} mb-2`}>{heroLabel}</p>
                    <h2 className={`font-heading text-3xl md:text-4xl font-bold tracking-tight ${palette.text} mb-2`}>
                        {heroTitle}
                    </h2>
                    <p className={`text-sm ${palette.muted}`}>
                        {heroDescription}
                    </p>
                </div>
            </div>

            {/* Step 1: Choose Your Path */}
            <div className={`rounded-2xl border ${palette.border} ${palette.panel} p-6`}>
                <StepIndicator number={1} title="Choose your path" isActive={true} isComplete={isStep1Complete && isStep2Complete} />

                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Import Option */}
                    <button
                        type="button"
                        onClick={() => setMode("import")}
                        className={`
                            group relative rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden
                            ${mode === "import"
                                ? "bg-[var(--cms-accent-subtle)] border-2 border-[var(--cms-accent)] shadow-sm"
                                : `border-2 ${palette.border} hover:border-[var(--cms-accent)] hover:bg-[var(--cms-pill)]`
                            }
                        `}
                    >
                        {mode === "import" && (
                            <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--cms-accent)] flex items-center justify-center shadow-sm">
                                <Check className="w-4 h-4 text-white" />
                            </div>
                        )}
                        <div className="w-12 h-12 rounded-2xl bg-pill flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                            <Sparkles
                                className={`w-6 h-6 ${mode === "import" ? "text-[var(--cms-accent-strong)]" : palette.muted}`}
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className={`font-bold ${palette.text}`}>Import existing menu</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--cms-accent-subtle)] text-[var(--cms-accent-strong)] font-semibold">
                                AI-Powered
                            </span>
                        </div>
                        <p className={`text-sm ${palette.muted}`}>
                            Upload PDFs, images, or paste a URL. AI extracts all items automatically.
                        </p>
                    </button>

                    {/* Manual Option */}
                    <button
                        type="button"
                        onClick={() => setMode("manual")}
                        className={`
                            group relative rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden
                            ${mode === "manual"
                                ? "bg-[var(--cms-accent-subtle)] border-2 border-[var(--cms-accent)] shadow-sm"
                                : `border-2 ${palette.border} hover:border-[var(--cms-accent)] hover:bg-[var(--cms-pill)]`
                            }
                        `}
                    >
                        {mode === "manual" && (
                            <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--cms-accent)] flex items-center justify-center shadow-sm">
                                <Check className="w-4 h-4 text-white" />
                            </div>
                        )}
                        <div className="w-12 h-12 rounded-2xl bg-pill flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110">
                            <PencilLine
                                className={`w-6 h-6 ${mode === "manual" ? "text-[var(--cms-accent-strong)]" : palette.muted}`}
                            />
                        </div>
                        <h4 className={`font-bold mb-1 ${palette.text}`}>Start from scratch</h4>
                        <p className={`text-sm ${palette.muted}`}>
                            Create an empty menu and add your items manually in the editor.
                        </p>
                    </button>
                </div>
            </div>

            {/* Step 2: Add Your Content */}
            <div className={`rounded-2xl border ${palette.border} ${palette.panel} p-6 transition-all duration-300 ${!mode ? "opacity-50 pointer-events-none" : ""}`}>
                <StepIndicator number={2} title={mode === "manual" ? "Ready to go" : "Add your content"} isActive={!!mode} isComplete={isStep2Complete} />

                {mode === "manual" ? (
                    <div className={`rounded-2xl border-2 border-dashed ${palette.border} p-6 text-center`}>
                        <div className="w-14 h-14 rounded-2xl bg-pill flex items-center justify-center mx-auto mb-4">
                            <Check className="w-7 h-7 text-[var(--cms-accent-strong)]" />
                        </div>
                        <h4 className={`font-bold mb-1 ${palette.text}`}>You're all set!</h4>
                        <p className={`text-sm ${palette.muted}`}>
                            We'll create an empty menu for you. Add categories and items in the editor.
                        </p>
                    </div>
                ) : mode === "import" ? (
                    <div className="space-y-4">
                        {/* Import source tabs */}
                        <div className={`inline-flex rounded-full border ${palette.border} ${palette.panelMuted} p-1 flex-wrap gap-1`}>
                            <button
                                onClick={() => { setImportTab("files"); setParsedMenu(null); setZipPreview(null); }}
                                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${importTab === "files" ? "bg-[var(--cms-accent)] text-white shadow-sm" : palette.muted + " hover:bg-[var(--cms-pill)]"}`}
                            >
                                <Upload className="w-3 h-3" /> Files
                            </button>
                            <button
                                onClick={() => { setImportTab("url"); setParsedMenu(null); setZipPreview(null); }}
                                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${importTab === "url" ? "bg-[var(--cms-accent)] text-white shadow-sm" : palette.muted + " hover:bg-[var(--cms-pill)]"}`}
                            >
                                <Link className="w-3 h-3" /> URL
                            </button>
                            <button
                                onClick={() => { setImportTab("menuvium"); setParsedMenu(null); setZipFile(null); setZipPreview(null); }}
                                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${importTab === "menuvium" ? "bg-[var(--cms-accent)] text-white shadow-sm" : palette.muted + " hover:bg-[var(--cms-pill)]"}`}
                            >
                                <Package className="w-3 h-3" /> Menuvium Export
                            </button>
                        </div>

                        {/* Files import */}
                        {importTab === "files" && (
                            <div className="space-y-3">
                                <input
                                    ref={importFilesInputRef}
                                    type="file"
                                    accept="image/*,.pdf"
                                    multiple
                                    onChange={(e) => {
                                        setImportFiles(Array.from(e.target.files || []));
                                        setParsedMenu(null);
                                        e.currentTarget.value = "";
                                    }}
                                    className="hidden"
                                />
                                <div
                                    onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()}
                                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                                        e.preventDefault();
                                        const next = Array.from(e.dataTransfer.files || []).filter(
                                            (file) => file.type.startsWith("image/") || file.type === "application/pdf"
                                        );
                                        if (!next.length) return;
                                        setImportFiles(next);
                                        setParsedMenu(null);
                                    }}
                                    className={`rounded-2xl border-2 border-dashed ${importFiles.length > 0 ? "border-[var(--cms-accent)] bg-[var(--cms-accent-subtle)]" : palette.border} p-6 text-center transition-all hover:border-[var(--cms-accent)]`}
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-pill flex items-center justify-center mx-auto mb-3">
                                        <Upload className="w-6 h-6 text-[var(--cms-accent-strong)]" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => importFilesInputRef.current?.click()}
                                        className="text-sm font-semibold text-[var(--cms-accent-strong)] hover:opacity-90 transition-colors"
                                    >
                                        Choose files
                                    </button>
                                    <span className={`text-sm ${palette.muted}`}> or drag and drop</span>
                                    <p className={`text-xs ${palette.muted} mt-2`}>PDF, PNG, JPG supported</p>

                                    {importFiles.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-[var(--cms-border)]">
                                            <div className="flex flex-wrap gap-2 justify-center">
                                                {importFiles.slice(0, 6).map((file) => (
                                                    <span
                                                        key={`${file.name}-${file.size}`}
                                                        className="text-[11px] px-3 py-1 rounded-full bg-pill text-[var(--cms-text)]"
                                                    >
                                                        {file.name}
                                                    </span>
                                                ))}
                                                {importFiles.length > 6 && (
                                                    <span className={`text-[11px] ${palette.muted}`}>+{importFiles.length - 6} more</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setImportFiles([]); setParsedMenu(null); }}
                                                className={`mt-2 text-xs ${palette.muted} hover:text-red-400 transition-colors`}
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* URL import */}
                        {importTab === "url" && (
                            <div className="space-y-3">
                                <p className={`text-xs ${palette.muted}`}>
                                    Paste a public link to a menu image, PDF, or web page.
                                </p>
                                <input
                                    type="url"
                                    placeholder="https://restaurant.com/menu.pdf"
                                    value={importUrl}
                                    onChange={(e) => {
                                        setImportUrl(e.target.value);
                                        setParsedMenu(null);
                                    }}
                                    className={`w-full h-12 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] border ${palette.input} transition-all`}
                                />
                            </div>
                        )}

                        {/* Menuvium Export import */}
                        {importTab === "menuvium" && (
                            <div className="space-y-4">
                                <p className={`text-xs ${palette.muted}`}>
                                    Upload a .zip file exported from Menuvium. All menu data, tags, and images will be imported.
                                </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <input
                                        ref={importZipInputRef}
                                        type="file"
                                        accept=".zip"
                                        onChange={(e) => {
                                            handleZipFileChange(e.target.files?.[0] || null);
                                            e.currentTarget.value = "";
                                        }}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => importZipInputRef.current?.click()}
                                        className="h-11 px-5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 bg-[var(--cms-accent)] text-white shadow-sm hover:bg-[var(--cms-accent-strong)] transition-colors"
                                    >
                                        <Package className="w-4 h-4" /> Choose export ZIP
                                    </button>
                                    {zipFile && (
                                        <span className={`text-xs ${palette.muted}`}>
                                            {zipFile.name}
                                        </span>
                                    )}
                                    {isPreviewingZip && (
                                        <span className={`text-xs ${palette.muted} flex items-center gap-1`}>
                                            <Loader2 className="w-3 h-3 animate-spin" /> Previewing...
                                        </span>
                                    )}
                                </div>

                                {/* ZIP Preview */}
                                {zipPreview && (
                                    <div className={`rounded-xl border p-4 space-y-3 ${palette.border} bg-[var(--cms-panel-strong)]`}>
                                        <div className="flex items-center justify-between">
                                            <h5 className={`text-sm font-semibold ${palette.text}`}>{zipPreview.menu_name}</h5>
                                            <span className={`text-xs ${palette.muted}`}>v{zipPreview.version}</span>
                                        </div>
                                        <div className={`text-xs ${palette.muted} flex flex-wrap gap-4`}>
                                            <span>{zipPreview.categories_count} categories</span>
                                            <span>{zipPreview.items_count} items</span>
                                            <span>{zipPreview.has_images ? "✓ Images included" : "No images"}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Parsed menu preview */}
                        {parsedMenu && (
                            <div className="space-y-3 mt-4">
                                <div className={`text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>Preview</div>
                                {parsedMenu.categories.map((cat, idx) => (
                                    <div key={`${cat.name}-${idx}`} className={`border ${palette.border} rounded-2xl p-4 bg-[var(--cms-panel-strong)]`}>
                                        <h4 className={`font-bold mb-2 ${palette.text}`}>{cat.name}</h4>
                                        <ul className={`text-sm ${palette.muted} space-y-1`}>
                                            {cat.items.slice(0, 5).map((item, itemIdx) => (
                                                <li key={`${item.name}-${itemIdx}`}>
                                                    {item.name}{item.price != null ? ` — $${item.price}` : ""}{item.description ? ` · ${item.description}` : ""}
                                                </li>
                                            ))}
                                            {cat.items.length > 5 && (
                                                <li className="text-[var(--cms-accent-strong)]">+{cat.items.length - 5} more items</li>
                                            )}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`rounded-2xl border-2 border-dashed ${palette.border} p-6 text-center`}>
                        <p className={`text-sm ${palette.muted}`}>Select a path above to continue</p>
                    </div>
                )}
            </div>

            {/* Step 3: Menu Details */}
            <div className={`rounded-2xl border ${palette.border} ${palette.panel} p-6 transition-all duration-300 ${!isStep2Complete ? "opacity-50 pointer-events-none" : ""}`}>
                <StepIndicator number={3} title="Menu details" isActive={isStep2Complete} isComplete={isStep3Complete && menuName.trim() !== ""} />

                {showMenuDetails && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className={`text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>
                                Menu name {mode === "import" && <span className="normal-case font-normal">(optional)</span>}
                            </label>
                            <input
                                value={menuName}
                                onChange={(e) => setMenuName(e.target.value)}
                                placeholder={mode === "import" ? "Auto-detected from import" : "e.g. Dinner Menu"}
                                disabled={lockMenuName}
                                className={`w-full h-12 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] border ${palette.input} ${lockMenuName ? "opacity-70 cursor-not-allowed" : ""} transition-all`}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={`text-xs font-semibold uppercase tracking-wide ${palette.muted}`}>Company</label>
                            {allowOrgSelect ? (
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => setSelectedOrg(e.target.value)}
                                    className={`w-full h-12 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] border ${palette.input} transition-all`}
                                >
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className={`h-12 rounded-xl px-4 flex items-center border ${palette.input}`}>
                                    {selectedOrgName}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {permissionsError && (
                    <p className={`text-xs text-red-400 mt-2`}>{permissionsError}</p>
                )}
                {!permissionsLoading && orgPermissions && !orgPermissions.can_manage_menus && (
                    <p className={`text-xs text-amber-400 mt-2`}>
                        You don't have permission to create menus for this company.
                    </p>
                )}
            </div>

            {/* Action Button */}
            <div className="flex flex-col items-center gap-3">
                {mode === "manual" ? (
                    <button
                        onClick={createManualMenu}
                        disabled={creating || !selectedOrg || permissionsLoading || !canManageMenus || (mode === "manual" && !menuName.trim())}
                        className="h-14 px-8 rounded-2xl font-semibold text-base bg-[var(--cms-accent)] text-white shadow-sm hover:bg-[var(--cms-accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                    >
                        {creating && <Loader2 className="w-5 h-5 animate-spin" />}
                        Create Menu
                    </button>
                ) : mode === "import" ? (
                    importTab === "menuvium" && zipPreview ? (
                        <button
                            onClick={handleImportFromZip}
                            disabled={isImportingZip || permissionsLoading || !canManageMenus || !selectedOrg}
                            className="h-14 px-8 rounded-2xl font-semibold text-base bg-[var(--cms-accent)] text-white shadow-sm hover:bg-[var(--cms-accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            {isImportingZip && <Loader2 className="w-5 h-5 animate-spin" />}
                            Import & Create Menu
                        </button>
                    ) : parsedMenu ? (
                        <button
                            onClick={handleApplyImport}
                            disabled={isImporting || permissionsLoading || !canManageMenus}
                            className="h-14 px-8 rounded-2xl font-semibold text-base bg-[var(--cms-accent)] text-white shadow-sm hover:bg-[var(--cms-accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            {isImporting && <Loader2 className="w-5 h-5 animate-spin" />}
                            Import & Create Menu
                        </button>
                    ) : (
                        <button
                            onClick={handleParseImport}
                            disabled={
                                (importTab === "files" && importFiles.length === 0) ||
                                (importTab === "url" && !importUrl.trim()) ||
                                (importTab === "menuvium") ||
                                isParsing || !selectedOrg || permissionsLoading || !canManageMenus
                            }
                            className="h-14 px-8 rounded-2xl font-semibold text-base bg-[var(--cms-accent)] text-white shadow-sm hover:bg-[var(--cms-accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30"
                        >
                            {isParsing && <Loader2 className="w-5 h-5 animate-spin" />}
                            <Sparkles className="w-5 h-5" />
                            Parse Menu with AI
                        </button>
                    )
                ) : (
                    <button
                        disabled
                        className="h-14 px-8 rounded-2xl font-semibold text-base border border-border bg-panelStrong text-muted cursor-not-allowed"
                    >
                        Select a path to continue
                    </button>
                )}

                {mode === "manual" && !menuName.trim() && (
                    <p className={`text-xs ${palette.muted}`}>Enter a menu name to continue</p>
                )}
            </div>

        </div>
    );
}
