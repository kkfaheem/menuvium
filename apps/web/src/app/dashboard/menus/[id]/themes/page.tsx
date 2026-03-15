"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Image,
  Info,
  Loader2,
  Minus,
  Palette,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { TitleDesignConfig } from "@/types";
import { MENU_THEME_BY_ID, MENU_THEMES, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { buildMenuQrUrls, regenerateMenuQr } from "@/lib/menuQr";
import { ImageCropperModal } from "@/components/menus/ImageCropperModal";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Menu {
  id: string;
  name: string;
  theme?: string;
  show_item_images?: boolean;
  banner_url?: string | null;
  logo_url?: string | null;
  title_design_config?: TitleDesignConfig | null;
  org_id: string;
}

type LogoPlacement = "replace" | "left" | "above";

export default function MenuThemesPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthenticator((context) => [context.user]);
  const confirm = useConfirm();
  const { toast } = useToast();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingThemeId, setSavingThemeId] = useState<MenuThemeId | null>(null);
  const apiBase = getApiBase();
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logos, setLogos] = useState<(string | null)[]>([null, null, null]);
  const [logoUploadingSlot, setLogoUploadingSlot] = useState<number | null>(null);
  const [selectedLogoIndex, setSelectedLogoIndex] = useState<number | null>(null);
  const [logoPlacement, setLogoPlacement] = useState<LogoPlacement>("replace");
  const [logoScale, setLogoScale] = useState(1.0);
  const [titleFontSize, setTitleFontSize] = useState(20);
  const [isRegeneratingQr, setIsRegeneratingQr] = useState(false);
  const [activeTab, setActiveTab] = useState<"theme" | "branding">("theme");
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const bannerPreviewBlobUrlRef = useRef<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<MenuThemeId>("noir");
  const [selectedShowItemImages, setSelectedShowItemImages] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [qrRevision, setQrRevision] = useState(0);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewScrollTopRef = useRef(0);
  const previewSignatureRef = useRef<string | null>(null);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [brandingDirty, setBrandingDirty] = useState(false);

  const menuId = params.id as string;

  const resolveThemeId = (themeId?: string | null): MenuThemeId => {
    if (!themeId) return "noir";
    return MENU_THEME_BY_ID[themeId as MenuThemeId]
      ? (themeId as MenuThemeId)
      : "noir";
  };

  const withAlpha = (hex: string, alphaHex: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
    return hex;
  };

  useEffect(() => {
    if (!menuId) return;
    fetchMenuData(menuId);
  }, [menuId, user]);

  const fetchMenuData = async (id: string) => {
    try {
      const token = await getAuthToken();
      const menuRes = await fetch(`${apiBase}/menus/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (menuRes.ok) {
        const menuData = (await menuRes.json()) as Menu;
        const perms = await fetchOrgPermissions({
          apiBase,
          token,
          orgId: menuData.org_id,
        });
        if (!perms.can_manage_menus) {
          setPermissionError(
            "You don’t have permission to change themes for this menu.",
          );
          router.replace(`/dashboard/menus/${id}`);
          return;
        }
        setMenu(menuData);
      }
    } catch (e) {
      console.error("Failed to load menu theme data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bannerPreviewBlobUrlRef.current) {
      URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
      bannerPreviewBlobUrlRef.current = null;
    }
    setBannerPreview(menu?.banner_url ?? null);
    // Initialize multi-logo state from title_design_config
    const config = menu?.title_design_config;
    if (config?.logos) {
      const padded: (string | null)[] = [null, null, null];
      config.logos.forEach((url, i) => { if (i < 3) padded[i] = url || null; });
      setLogos(padded);
    } else if (menu?.logo_url) {
      setLogos([menu.logo_url, null, null]);
    } else {
      setLogos([null, null, null]);
    }
    setSelectedLogoIndex(
      config?.selectedLogoIndex != null && config.selectedLogoIndex >= 0
        ? config.selectedLogoIndex
        : (menu?.logo_url ? 0 : null)
    );
    setLogoPlacement((config?.logoPlacement as LogoPlacement) || "replace");
    setLogoScale(config?.logoScale ?? 1.0);
    setTitleFontSize(config?.titleFontSize ?? 20);
  }, [menu?.banner_url, menu?.logo_url, menu?.title_design_config]);

  const tagsList = useMemo(() => {
    const tags = new Set<string>();
    MENU_THEMES.forEach((theme) => {
      tags.add(theme.category);
      tags.add(theme.layout);
      theme.cuisines.forEach((cuisine) => tags.add(cuisine));
    });
    return Array.from(tags).sort();
  }, []);

  const filteredThemes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return MENU_THEMES.filter((theme) => {
      if (selectedTags.length > 0) {
        const themeTags = [theme.category, theme.layout, ...theme.cuisines];
        if (!selectedTags.every((tag) => themeTags.includes(tag))) return false;
      }
      if (!query) return true;
      const haystack =
        `${theme.name} ${theme.description} ${theme.tone} ${theme.cuisines.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, selectedTags]);

  const orderedThemes = useMemo(() => {
    const activeId = resolveThemeId(menu?.theme);
    return filteredThemes.slice().sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredThemes, menu?.theme]);

  const activeThemeId = useMemo(
    () => resolveThemeId(menu?.theme),
    [menu?.theme],
  );
  const activeShowItemImages = menu?.show_item_images !== false;
  const selectedTheme = useMemo(() => {
    return MENU_THEME_BY_ID[selectedThemeId] || MENU_THEME_BY_ID.noir;
  }, [selectedThemeId]);
  const previewContentSignature = useMemo(
    () =>
      [
        menu?.banner_url ?? "",
        menu?.logo_url ?? "",
        menu?.show_item_images === false ? "hide" : "show",
        JSON.stringify(menu?.title_design_config ?? {}),
      ].join("|"),
    [menu?.banner_url, menu?.logo_url, menu?.show_item_images, menu?.title_design_config],
  );

  const capturePreviewScrollPosition = () => {
    const frameWindow = previewIframeRef.current?.contentWindow;
    const frameDocument = previewIframeRef.current?.contentDocument;
    previewScrollTopRef.current =
      frameWindow?.scrollY ??
      frameDocument?.documentElement.scrollTop ??
      frameDocument?.body.scrollTop ??
      0;
  };

  const previewHref = useMemo(() => {
    const params = new URLSearchParams({
      theme: selectedThemeId,
      v: String(previewRevision),
      embed: "1",
      show_images: selectedShowItemImages ? "1" : "0",
    });
    return `/r/${menuId}?${params.toString()}`;
  }, [menuId, selectedThemeId, previewRevision, selectedShowItemImages]);

  const previewOpenHref = useMemo(() => {
    const params = new URLSearchParams({
      theme: selectedThemeId,
      show_images: selectedShowItemImages ? "1" : "0",
    });
    return `/r/${menuId}?${params.toString()}`;
  }, [menuId, selectedThemeId, selectedShowItemImages]);

  useEffect(() => {
    setSelectedThemeId(activeThemeId);
  }, [activeThemeId]);

  useEffect(() => {
    setSelectedShowItemImages(activeShowItemImages);
  }, [activeShowItemImages]);

  useEffect(() => {
    if (previewSignatureRef.current === null) {
      previewSignatureRef.current = previewContentSignature;
      return;
    }
    if (previewSignatureRef.current === previewContentSignature) return;
    capturePreviewScrollPosition();
    previewSignatureRef.current = previewContentSignature;
    setPreviewRevision((prev) => prev + 1);
  }, [previewContentSignature]);

  const resetFilters = () => {
    setSearch("");
    setSelectedTags([]);
  };

  const hasFilters = search.trim() || selectedTags.length > 0;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((value) => value !== tag)
        : [...prev, tag],
    );
  };

  const uploadBanner = async (file: File): Promise<Menu | null> => {
    if (!menu) return null;
    setBannerUploading(true);
    try {
      const token = await getAuthToken();
      const uploadRes = await fetch(`${apiBase}/items/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "image/jpeg",
          menu_id: menu.id,
          asset_kind: "menu_banner",
        }),
      });
      if (!uploadRes.ok) {
        throw new Error("Failed to get upload url");
      }
      const uploadData = await uploadRes.json();
      const putRes = await fetch(uploadData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Failed to upload banner");
      }
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ banner_url: uploadData.public_url }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to save banner");
      }
      const updated = await patchRes.json();
      setMenu(updated);
      return updated;
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error uploading banner" });
      return null;
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = async () => {
    if (!menu) return;
    setBannerUploading(true);
    try {
      const token = await getAuthToken();
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ banner_url: null }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to remove banner");
      }
      const updated = await patchRes.json();
      setMenu(updated);
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error removing banner" });
    } finally {
      setBannerUploading(false);
    }
  };

  /** Persist the current logos array + selection + placement to the backend */
  const persistLogoConfig = async (
    newLogos: (string | null)[],
    newSelectedIndex: number | null,
    newPlacement: LogoPlacement,
    overrideLogoScale?: number,
    overrideTitleFontSize?: number,
  ) => {
    if (!menu) return;
    const token = await getAuthToken();
    const activeLogoUrl =
      newSelectedIndex != null && newSelectedIndex >= 0
        ? newLogos[newSelectedIndex] ?? null
        : null;
    const config: TitleDesignConfig = {
      ...(menu.title_design_config || {}),
      enabled: activeLogoUrl != null,
      logos: newLogos,
      selectedLogoIndex: newSelectedIndex,
      logoPlacement: newPlacement,
      logoScale: overrideLogoScale ?? logoScale,
      titleFontSize: overrideTitleFontSize ?? titleFontSize,
    };
    const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        logo_url: activeLogoUrl,
        title_design_config: config,
      }),
    });
    if (!patchRes.ok) throw new Error("Failed to save logo config");
    const updated = await patchRes.json();
    setMenu(updated);
    setPreviewRevision((r) => r + 1);
    return updated;
  };

  const uploadLogoToSlot = async (file: File, slotIndex: number) => {
    if (!menu) return;
    setLogoUploadingSlot(slotIndex);
    try {
      const token = await getAuthToken();
      const uploadRes = await fetch(`${apiBase}/items/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "image/png",
          menu_id: menu.id,
          asset_kind: "menu_title_logo",
        }),
      });
      if (!uploadRes.ok) throw new Error("Failed to get upload url");
      const uploadData = await uploadRes.json();
      const putRes = await fetch(uploadData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Failed to upload logo");

      const newLogos = [...logos];
      newLogos[slotIndex] = uploadData.public_url;
      setLogos(newLogos);

      // Auto-select this logo if none is selected
      const newIndex = selectedLogoIndex ?? slotIndex;
      setSelectedLogoIndex(newIndex);

      await persistLogoConfig(newLogos, newIndex, logoPlacement);
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error uploading logo" });
    } finally {
      setLogoUploadingSlot(null);
    }
  };

  const removeLogoFromSlot = async (slotIndex: number) => {
    if (!menu) return;
    setLogoUploadingSlot(slotIndex);
    try {
      const newLogos = [...logos];
      newLogos[slotIndex] = null;
      setLogos(newLogos);

      // If removing the selected logo, clear selection
      let newIndex = selectedLogoIndex;
      if (selectedLogoIndex === slotIndex) {
        // Try to find another uploaded logo to select
        const nextIndex = newLogos.findIndex((url) => url != null);
        newIndex = nextIndex >= 0 ? nextIndex : null;
        setSelectedLogoIndex(newIndex);
      }

      await persistLogoConfig(newLogos, newIndex, logoPlacement);
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error removing logo" });
    } finally {
      setLogoUploadingSlot(null);
    }
  };

  const handleLogoSelection = async (index: number | null) => {
    setSelectedLogoIndex(index);
    setBrandingDirty(true);
    try {
      await persistLogoConfig(logos, index, logoPlacement);
    } catch (e) {
      console.error(e);
    }
  };

  /** Unified handler for the 4 layout option buttons */
  const handleLayoutOptionClick = async (placement: LogoPlacement | null) => {
    // Default slider positions at 50% of range
    const defaultLogoScale = 1.75;
    const defaultTitleFontSize = 26;

    let newIndex = selectedLogoIndex;
    if (placement === null) {
      newIndex = null;
      setSelectedLogoIndex(null);
      setTitleFontSize(defaultTitleFontSize);
    } else {
      if (selectedLogoIndex == null || selectedLogoIndex < 0) {
        const firstLogo = logos.findIndex(Boolean);
        if (firstLogo >= 0) { newIndex = firstLogo; setSelectedLogoIndex(firstLogo); }
      }
      setLogoPlacement(placement);
      setLogoScale(defaultLogoScale);
      setTitleFontSize(defaultTitleFontSize);
    }
    setBrandingDirty(true);
    try {
      await persistLogoConfig(logos, newIndex, placement ?? logoPlacement, defaultLogoScale, defaultTitleFontSize);
    } catch (e) { console.error(e); }
  };

  const handleLogoScaleChange = async (newScale: number) => {
    const clamped = Math.round(Math.max(0.5, Math.min(3.0, newScale)) * 10) / 10;
    setLogoScale(clamped);
    setBrandingDirty(true);
    try {
      await persistLogoConfig(logos, selectedLogoIndex, logoPlacement, clamped, titleFontSize);
    } catch (e) { console.error(e); }
  };

  const handleTitleFontSizeChange = async (newSize: number) => {
    const clamped = Math.max(12, Math.min(40, Math.round(newSize)));
    setTitleFontSize(clamped);
    setBrandingDirty(true);
    try {
      await persistLogoConfig(logos, selectedLogoIndex, logoPlacement, logoScale, clamped);
    } catch (e) { console.error(e); }
  };

  const handleShowItemImagesSelection = (showImages: boolean) => {
    capturePreviewScrollPosition();
    setSelectedShowItemImages(showImages);
  };

  const applyTheme = async (themeId: MenuThemeId) => {
    if (!menu) return;
    setSavingThemeId(themeId);
    try {
      // Persist branding changes if dirty
      if (brandingDirty) {
        await persistLogoConfig(logos, selectedLogoIndex, logoPlacement, logoScale, titleFontSize);
        setBrandingDirty(false);
      }
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme: themeId,
          show_item_images: selectedShowItemImages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMenu((prev) =>
          prev
            ? {
              ...prev,
              theme: data.theme ?? themeId,
              show_item_images:
                typeof data.show_item_images === "boolean"
                  ? data.show_item_images
                  : selectedShowItemImages,
            }
            : prev,
        );
        return;
      }
      const err = await res.json();
      toast({
        variant: "error",
        title: "Failed to update theme",
        description: err.detail || "Unknown error",
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error updating theme" });
    } finally {
      setSavingThemeId(null);
    }
  };

  const handleThemeSelection = (themeId: MenuThemeId) => {
    if (themeId === selectedThemeId) return;
    capturePreviewScrollPosition();
    setSelectedThemeId(themeId);
  };

  const handlePreviewLoad = () => {
    const frameWindow = previewIframeRef.current?.contentWindow;
    if (!frameWindow || previewScrollTopRef.current <= 0) return;
    const scrollTarget = previewScrollTopRef.current;
    previewScrollTopRef.current = 0;
    frameWindow.requestAnimationFrame(() => {
      frameWindow.scrollTo(0, scrollTarget);
    });
  };

  const handleRegenerateQr = async () => {
    if (!menu || isRegeneratingQr) return;

    const confirmed = await confirm({
      title: "Regenerate QR?",
      description:
        "This will create a fresh plain QR code for the current public menu link.",
      confirmLabel: "Regenerate QR",
      requireTextMatch: "regenerate qr",
      requireTextLabel: 'Type "regenerate qr" to confirm.',
      requireTextPlaceholder: "regenerate qr",
    });
    if (!confirmed) return;

    setIsRegeneratingQr(true);
    try {
      const token = await getAuthToken();
      await regenerateMenuQr(apiBase, menu.id, token);
      setQrRevision((current) => current + 1);
      toast({
        variant: "success",
        title: "QR regenerated",
        description: "The menu QR code has been refreshed.",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "error",
        title: "Failed to regenerate QR",
        description:
          error instanceof Error ? error.message : "Please try again in a moment.",
      });
    } finally {
      setIsRegeneratingQr(false);
    }
  };

  if (loading) {
    return (
      <div className="text-[var(--cms-muted)] flex items-center gap-2">
        <Loader2 className="animate-spin" /> Loading themes...
      </div>
    );
  }

  if (permissionError) {
    return (
      <div className="text-sm text-[var(--cms-muted)]">{permissionError}</div>
    );
  }

  const hasThemeSelectionChange = selectedThemeId !== activeThemeId;
  const hasItemImagesSelectionChange =
    selectedShowItemImages !== activeShowItemImages;
  const isApplyingSelectedTheme = savingThemeId === selectedThemeId;
  const canApplySelectedTheme =
    (hasThemeSelectionChange || hasItemImagesSelectionChange || brandingDirty) && !savingThemeId;

  return (
    <div className="w-full max-w-[1400px] mr-auto space-y-6">
      <header className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Link
              href="/dashboard/design-studio"
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              Design Studio
            </h1>
            <p className="text-sm font-semibold text-[var(--cms-text)]">
              {menu?.name || "Untitled Menu"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-xs font-semibold text-[var(--cms-muted)]">
              <span>Item images</span>
              <span className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedShowItemImages}
                  onChange={(e) =>
                    handleShowItemImagesSelection(e.target.checked)
                  }
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-[var(--cms-border)] transition-colors peer-checked:bg-[var(--cms-accent)]" />
                <span className="pointer-events-none absolute left-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
              </span>
            </label>
            <Link
              href={`/dashboard/menus/${menuId}`}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-xs font-semibold text-[var(--cms-muted)] transition-colors hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
            >
              <Pencil className="w-3.5 h-3.5" />
              Menu Editor
            </Link>
            <button
              type="button"
              onClick={() => applyTheme(selectedThemeId)}
              disabled={!canApplySelectedTheme}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${canApplySelectedTheme
                ? "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]"
                }`}
            >
              {isApplyingSelectedTheme ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {isApplyingSelectedTheme ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("theme")}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${activeTab === "theme"
                  ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                  : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                  }`}
              >
                <Palette className="w-4 h-4" />
                Themes
              </button>
              <button
                onClick={() => setActiveTab("branding")}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${activeTab === "branding"
                  ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                  : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                  }`}
              >
                <Image className="w-4 h-4" />
                Branding
              </button>
            </div>
          </section>

          {activeTab === "theme" && (
            <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-muted)]">
                    Theme Library
                  </p>
                  <h2 className="font-heading text-3xl max-[640px]:text-2xl font-bold tracking-tight mt-1">
                    Choose a look
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cms-muted)]" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search..."
                      className="h-11 min-w-[220px] w-full rounded-full border border-[var(--cms-border)] bg-[var(--cms-bg)] pl-9 pr-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/20"
                    />
                  </div>
                  {hasFilters && (
                    <button
                      onClick={resetFilters}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--cms-border)] px-4 text-sm font-semibold text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                    >
                      <X className="h-4 w-4" /> Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {tagsList.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`h-8 px-4 rounded-full text-xs font-semibold border whitespace-nowrap ${selectedTags.includes(tag)
                      ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]"
                      : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {orderedThemes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-8 text-center text-[var(--cms-muted)]">
                  No themes match those filters. Try clearing or adjusting your
                  search.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {orderedThemes.map((theme) => {
                    const isActive = activeThemeId === theme.id;
                    const isSelected = selectedThemeId === theme.id;
                    const primaryTextColor = theme.palette.text;
                    const secondaryTextColor = withAlpha(
                      theme.palette.text,
                      "B8",
                    );
                    const tertiaryTextColor = withAlpha(
                      theme.palette.text,
                      "96",
                    );
                    const cardBlendStyle = {
                      backgroundColor: theme.palette.surface,
                      backgroundImage: `
                                                radial-gradient(140% 120% at 0% 0%, ${withAlpha(theme.palette.accent, "40")} 0%, transparent 58%),
                                                radial-gradient(120% 130% at 100% 5%, ${withAlpha(theme.palette.bg, "DD")} 0%, transparent 62%),
                                                radial-gradient(125% 140% at 50% 100%, ${withAlpha(theme.palette.surfaceAlt, "D6")} 0%, transparent 60%),
                                                linear-gradient(140deg, ${withAlpha(theme.palette.bg, "EA")} 0%, ${withAlpha(theme.palette.surface, "F2")} 52%, ${withAlpha(theme.palette.accent, "22")} 100%)
                                            `,
                    } as const;
                    return (
                      <div key={theme.id} className="relative">
                        {isActive && (
                          <Badge
                            variant="success"
                            className="pointer-events-none absolute -top-2.5 right-2 z-10 rounded-md border border-neutral-700 bg-white px-2 py-0.5 font-bold text-emerald-700 shadow-[0_4px_10px_rgba(0,0,0,0.28)]"
                          >
                            Active
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => handleThemeSelection(theme.id)}
                          aria-pressed={isSelected}
                          className={`w-full overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 ${isActive
                            ? "border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                            : isSelected
                              ? "border-[var(--cms-accent)]/40"
                              : "border-[var(--cms-border)]"
                            }`}
                          style={cardBlendStyle}
                        >
                          <div className="px-2.5 py-2.5">
                            <div className="min-w-0">
                              <h3
                                className="truncate text-base font-bold tracking-tight"
                                style={{ color: primaryTextColor }}
                              >
                                {theme.name}
                              </h3>
                              <p
                                className="mt-0.5 line-clamp-1 text-[11px]"
                                style={{ color: secondaryTextColor }}
                              >
                                {theme.description}
                              </p>
                              <p
                                className="mt-0.5 text-[10px] capitalize"
                                style={{ color: tertiaryTextColor }}
                              >
                                {theme.category} · {theme.layout}
                              </p>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === "branding" && (
            <>
              {/* ─── Branding & Title ─── */}
              <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-heading text-xl font-bold tracking-tight">
                      Branding & Title
                    </h2>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                      Upload restaurant logo
                    </p>
                  </div>
                  <span className="relative group">
                    <Info className="w-3.5 h-3.5 text-[var(--cms-muted)] cursor-help" />
                    <span className="pointer-events-none absolute right-0 top-6 z-30 w-48 rounded-lg bg-[var(--cms-text)] px-3 py-2 text-[10px] leading-snug text-[var(--cms-bg)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      Upload up to 3 logos. Select one to display in your menu.
                    </span>
                  </span>
                </div>

                {/* Logo slots — compact */}
                <div className="grid grid-cols-3 gap-2">
                  {logos.map((logoUrl, i) => (
                    <div key={i} className="relative group">
                      {logoUrl ? (
                        <div
                          className={`relative rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${selectedLogoIndex === i
                            ? "border-[var(--cms-accent)] ring-1 ring-[var(--cms-accent)]/20"
                            : "border-[var(--cms-border)] hover:border-[var(--cms-accent)]/40"
                            }`}
                          onClick={() => handleLogoSelection(selectedLogoIndex === i ? null : i)}
                        >
                          <div className="aspect-square bg-[var(--cms-bg)] p-2 flex items-center justify-center">
                            <img src={logoUrl} alt={`Logo ${i + 1}`} className="w-full h-full object-contain" />
                          </div>
                          {selectedLogoIndex === i && (
                            <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-[var(--cms-accent)] flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeLogoFromSlot(i); }}
                            disabled={logoUploadingSlot === i}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <label className={`flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] cursor-pointer transition-colors hover:border-[var(--cms-accent)]/40 ${logoUploadingSlot === i ? "opacity-60 pointer-events-none" : ""}`}>
                          {logoUploadingSlot === i ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--cms-muted)]" />
                          ) : (
                            <>
                              <Plus className="w-4 h-4 text-[var(--cms-muted)]" />
                              <span className="text-[9px] font-semibold text-[var(--cms-muted)] mt-0.5">Logo {i + 1}</span>
                            </>
                          )}
                          <input type="file" accept="image/*" className="sr-only" disabled={logoUploadingSlot != null}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogoToSlot(f, i); e.currentTarget.value = ""; }} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-[var(--cms-muted)] leading-tight">
                  Square, 512×512+. PNG with transparency works best.
                </p>

                {/* ─── Layout — 1-row text buttons ─── */}
                <div className="space-y-3 pt-3 border-t border-[var(--cms-border)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                    Layout
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      { value: "replace" as LogoPlacement, label: "Logo only" },
                      { value: null, label: "Text only" },
                      { value: "left" as LogoPlacement, label: "Side by side" },
                      { value: "above" as LogoPlacement, label: "Stacked" },
                    ] as const).map((opt) => {
                      const isActive = opt.value === null
                        ? (selectedLogoIndex == null || !logos.some(Boolean))
                        : (selectedLogoIndex != null && selectedLogoIndex >= 0 && logoPlacement === opt.value);
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => handleLayoutOptionClick(opt.value)}
                          disabled={opt.value !== null && !logos.some(Boolean)}
                          className={`flex items-center justify-center p-2.5 rounded-xl border transition-all ${isActive
                            ? "border-[var(--cms-accent)] bg-[var(--cms-accent)]/10 text-[var(--cms-accent)]"
                            : "border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-[var(--cms-text)] hover:border-[var(--cms-accent)]/40"
                            } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          <span className="text-[11px] font-semibold tracking-tight">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ─── Size controls — standard simple sliders ─── */}
                {(selectedLogoIndex != null && selectedLogoIndex >= 0 && logos[selectedLogoIndex]) && (
                  <div className="space-y-5 pt-4 border-t border-[var(--cms-border)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                      Size
                    </p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--cms-text)]">Logo scale</span>
                        <span className="text-sm font-bold text-[var(--cms-accent)]">{logoScale.toFixed(1)}×</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleLogoScaleChange(logoScale - 0.1)} disabled={logoScale <= 0.5}
                          className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={logoScale}
                          onChange={(e) => handleLogoScaleChange(parseFloat(e.target.value))}
                          className="flex-1 h-1.5 rounded-full appearance-none bg-[var(--cms-border)] accent-[var(--cms-accent)] cursor-pointer" />
                        <button type="button" onClick={() => handleLogoScaleChange(logoScale + 0.1)} disabled={logoScale >= 3.0}
                          className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {logoPlacement !== "replace" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--cms-text)]">Title size</span>
                          <span className="text-sm font-bold text-[var(--cms-accent)]">{titleFontSize}px</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => handleTitleFontSizeChange(titleFontSize - 1)} disabled={titleFontSize <= 12}
                            className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input type="range" min="12" max="40" step="1" value={titleFontSize}
                            onChange={(e) => handleTitleFontSizeChange(parseInt(e.target.value))}
                            className="flex-1 h-1.5 rounded-full appearance-none bg-[var(--cms-border)] accent-[var(--cms-accent)] cursor-pointer" />
                          <button type="button" onClick={() => handleTitleFontSizeChange(titleFontSize + 1)} disabled={titleFontSize >= 40}
                            className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(selectedLogoIndex == null || selectedLogoIndex < 0) && (
                  <div className="space-y-5 pt-4 border-t border-[var(--cms-border)]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                      Size
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[var(--cms-text)]">Title size</span>
                        <span className="text-sm font-bold text-[var(--cms-accent)]">{titleFontSize}px</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleTitleFontSizeChange(titleFontSize - 1)} disabled={titleFontSize <= 12}
                          className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input type="range" min="12" max="40" step="1" value={titleFontSize}
                          onChange={(e) => handleTitleFontSizeChange(parseInt(e.target.value))}
                          className="flex-1 h-1.5 rounded-full appearance-none bg-[var(--cms-border)] accent-[var(--cms-accent)] cursor-pointer" />
                        <button type="button" onClick={() => handleTitleFontSizeChange(titleFontSize + 1)} disabled={titleFontSize >= 40}
                          className="w-8 h-8 rounded-full border border-[var(--cms-border)] flex items-center justify-center text-[var(--cms-text)] hover:bg-[var(--cms-pill)] disabled:opacity-30">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ─── Banner Section ─── */}
              <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <div>
                      <h2 className="font-heading text-xl font-bold tracking-tight">
                        Cover
                      </h2>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                        Menu banner
                      </p>
                    </div>
                    <span className="relative group mt-1">
                      <Info className="w-3.5 h-3.5 text-[var(--cms-muted)] cursor-help" />
                      <span className="pointer-events-none absolute left-0 top-6 z-30 w-44 rounded-lg bg-[var(--cms-text)] px-3 py-2 text-[10px] leading-snug text-[var(--cms-bg)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        Shown at the top of your guest menu.
                      </span>
                    </span>
                  </div>
                  {bannerPreview && (
                    <button
                      onClick={removeBanner}
                      disabled={bannerUploading}
                      className="h-9 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                    >
                      Remove banner
                    </button>
                  )}
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr] items-center">
                  <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4">
                    {bannerPreview ? (
                      <img
                        src={bannerPreview}
                        alt="Menu banner"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                    ) : (
                      <div className="h-48 rounded-xl flex items-center justify-center text-sm text-[var(--cms-muted)]">
                        No banner uploaded yet.
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">
                      Upload a cover photo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={bannerUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setBannerCropFile(file);
                        event.currentTarget.value = "";
                      }}
                      className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                    />
                    <p className="text-xs text-[var(--cms-muted)]">
                      Recommended: 1600×900 or larger (16:9).
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          <ImageCropperModal
            open={Boolean(bannerCropFile)}
            file={bannerCropFile}
            aspect={16 / 9}
            title="Crop banner"
            description="Drag to reposition and adjust zoom. Double-click to reset."
            confirmLabel="Crop & upload"
            onCancel={() => setBannerCropFile(null)}
            onConfirm={async (blob) => {
              const original = bannerCropFile;
              if (!original) return;

              const previousPreview = bannerPreview;
              const localUrl = URL.createObjectURL(blob);
              bannerPreviewBlobUrlRef.current = localUrl;
              setBannerPreview(localUrl);

              const filenameBase = original.name.replace(/\.[^/.]+$/, "");
              const croppedFile = new File(
                [blob],
                `${filenameBase}_banner.jpg`,
                { type: blob.type },
              );

              const updated = await uploadBanner(croppedFile);
              if (!updated) {
                if (bannerPreviewBlobUrlRef.current) {
                  URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
                  bannerPreviewBlobUrlRef.current = null;
                }
                setBannerPreview(previousPreview);
              }

              setBannerCropFile(null);
            }}
          />
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start space-y-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
              Preview · {selectedTheme.name}
            </span>
            <Link
              href={previewOpenHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--cms-muted)] transition-colors hover:text-[var(--cms-text)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open preview in new tab
            </Link>
          </div>

          <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[392px] px-1">
              <div className="relative rounded-[2.8rem] bg-gradient-to-b from-zinc-200 via-zinc-300 to-zinc-400 p-[8px] shadow-[0_24px_48px_-30px_rgba(0,0,0,0.45)] dark:bg-gradient-to-b dark:from-white/40 dark:via-zinc-500/35 dark:to-zinc-900/80 dark:shadow-[0_30px_55px_-35px_rgba(0,0,0,0.9)]">
                <div className="relative overflow-hidden rounded-[2.42rem] border border-zinc-400/80 bg-zinc-100 p-px dark:border-black/60 dark:bg-zinc-900">
                  <div className="pointer-events-none absolute left-1/2 top-[8px] z-20 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-zinc-500/80 ring-1 ring-white/50 dark:bg-zinc-500/85 dark:ring-white/20" />
                  <div
                    className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[2.34rem] bg-white"
                    style={{ clipPath: "inset(0 round 2.34rem)" }}
                  >
                    <iframe
                      ref={previewIframeRef}
                      title={`${menu?.name || "Menu"} preview`}
                      src={previewHref}
                      onLoad={handlePreviewLoad}
                      className="no-scrollbar block h-full w-full border-0 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ─── QR Code Section ─── */}
          {menu && (() => {
            const qrUrls = buildMenuQrUrls(apiBase, menu.id, qrRevision);
            const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/r/${menu.id}`;
            const copyUrl = async () => {
              try { await navigator.clipboard.writeText(publicUrl); setCopiedPublicUrl(true); setTimeout(() => setCopiedPublicUrl(false), 1800); } catch { /* no-op */ }
            };
            return (
              <section className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-5 space-y-4">
                <div>
                  <h2 className="font-heading text-xl font-bold tracking-tight">
                    Publish
                  </h2>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                    Menu QR
                  </p>
                </div>

                {/* QR preview */}
                <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-4 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrls.previewUrl} alt="Menu QR code"
                    className="h-44 w-44 max-w-full rounded-xl bg-white p-2" />
                </div>

                {/* Public URL */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-[var(--cms-muted)]">Public URL</label>
                  <div className="flex items-center gap-1.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-2.5 py-2">
                    <span className="truncate text-xs text-[var(--cms-text)]">{publicUrl}</span>
                    <button type="button" onClick={copyUrl}
                      className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)] transition-colors">
                      <Copy className="h-3 w-3" />
                      {copiedPublicUrl ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <a href={qrUrls.openUrl} target="_blank" rel="noreferrer"
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--cms-accent)] px-3 text-[10px] font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]">
                    <QrCode className="h-3 w-3" /> Open QR
                  </a>
                  <a href={qrUrls.pdfUrl} rel="noreferrer"
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-[10px] font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)]">
                    <Download className="h-3 w-3" /> PDF
                  </a>
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={isRegeneratingQr}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-[10px] font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)] disabled:opacity-60"
                  >
                    {isRegeneratingQr ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate QR
                  </button>
                </div>
              </section>
            );
          })()}
        </aside>
      </div>
    </div>
  );
}
