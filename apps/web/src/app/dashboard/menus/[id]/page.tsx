"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  ArrowLeft,
  GripVertical,
  Trash2,
  X,
  Image as ImageIcon,
  Video,
  Loader2,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  PencilLine,
  Box,
  QrCode,
  Copy,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ALLERGEN_TAGS,
  DIET_TAGS,
  HIGHLIGHT_TAGS,
  SPICE_TAGS,
  TAG_LABELS_DEFAULTS,
} from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import type {
  Menu,
  Category,
  Item,
  OrgPermissions,
  ItemOptionGroup,
  ItemOption,
  VisibilityRule,
  ArCaptureAsset,
  ItemArCapturesResponse,
} from "@/types";
import { SortableCategoryCard } from "@/components/menus/SortableCategoryCard";
import { SortableItemRow } from "@/components/menus/SortableItemRow";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";

const WEEKDAY_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 1 },
  { label: "Wed", value: 2 },
  { label: "Thu", value: 3 },
  { label: "Fri", value: 4 },
  { label: "Sat", value: 5 },
  { label: "Sun", value: 6 },
];

const TIMEZONE_ABBREVIATION_OPTIONS = [
  { label: "EST", value: "America/New_York" },
  { label: "CST", value: "America/Chicago" },
  { label: "MST", value: "America/Denver" },
  { label: "PST", value: "America/Los_Angeles" },
  { label: "UTC", value: "UTC" },
] as const;

const TIMEZONE_VALUE_SET = new Set<string>(
  TIMEZONE_ABBREVIATION_OPTIONS.map((option) => option.value),
);

const canonicalizeMenuTimezone = (value: unknown): string => {
  const raw = typeof value === "string" ? value.trim() : "";
  const normalized = raw.toLowerCase();
  const aliases: Record<string, string> = {
    "america/new_york": "America/New_York",
    "america/toronto": "America/New_York",
    "us/eastern": "America/New_York",
    est: "America/New_York",
    "america/chicago": "America/Chicago",
    "us/central": "America/Chicago",
    cst: "America/Chicago",
    "america/denver": "America/Denver",
    "us/mountain": "America/Denver",
    mst: "America/Denver",
    "america/los_angeles": "America/Los_Angeles",
    "us/pacific": "America/Los_Angeles",
    pst: "America/Los_Angeles",
    utc: "UTC",
    "etc/utc": "UTC",
    gmt: "UTC",
  };
  const mapped = aliases[normalized] || raw;
  if (TIMEZONE_VALUE_SET.has(mapped)) return mapped;
  return "America/New_York";
};

const normalizeTimeInput = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed.slice(0, 5);
  return fallback;
};

const normalizeVisibilityRule = (
  rule?: Partial<VisibilityRule> | null,
): VisibilityRule => ({
  id: rule?.id,
  kind: rule?.kind === "exclude" ? "exclude" : "include",
  days_of_week: Array.isArray(rule?.days_of_week)
    ? rule!.days_of_week
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [],
  start_time_local: normalizeTimeInput(rule?.start_time_local, "00:00"),
  end_time_local: normalizeTimeInput(rule?.end_time_local, "23:59"),
  start_date:
    typeof rule?.start_date === "string" && rule.start_date.trim()
      ? rule.start_date
      : null,
  end_date:
    typeof rule?.end_date === "string" && rule.end_date.trim()
      ? rule.end_date
      : null,
  is_active: rule?.is_active !== false,
});

const createDefaultVisibilityRule = (): VisibilityRule =>
  normalizeVisibilityRule();

const normalizeItemOption = (
  option?: Partial<ItemOption> | null,
  fallbackPosition: number = 0,
): ItemOption => ({
  id: option?.id,
  name: typeof option?.name === "string" ? option.name : "",
  description:
    typeof option?.description === "string" ? option.description : null,
  image_url: typeof option?.image_url === "string" ? option.image_url : null,
  badge: typeof option?.badge === "string" ? option.badge : null,
  position:
    Number.isFinite(Number(option?.position)) ? Number(option?.position) : fallbackPosition,
  is_default: option?.is_default === true,
  is_active: option?.is_active !== false,
  visibility_rules: Array.isArray(option?.visibility_rules)
    ? option!.visibility_rules.map((rule) => normalizeVisibilityRule(rule))
    : [],
});

const createDefaultItemOption = (position: number): ItemOption =>
  normalizeItemOption(
    {
      name: "",
      position,
      is_default: false,
      is_active: true,
      visibility_rules: [],
    },
    position,
  );

const normalizeItemOptionGroup = (
  group?: Partial<ItemOptionGroup> | null,
  fallbackPosition: number = 0,
): ItemOptionGroup => ({
  id: group?.id,
  name: typeof group?.name === "string" ? group.name : "",
  description:
    typeof group?.description === "string" ? group.description : null,
  selection_mode: group?.selection_mode === "multiple" ? "multiple" : "single",
  min_select:
    Number.isFinite(Number(group?.min_select)) ? Number(group?.min_select) : 0,
  max_select:
    group?.max_select === null || group?.max_select === undefined
      ? null
      : Number(group.max_select),
  display_style:
    group?.display_style === "list" || group?.display_style === "cards"
      ? group.display_style
      : "chips",
  position:
    Number.isFinite(Number(group?.position)) ? Number(group?.position) : fallbackPosition,
  is_active: group?.is_active !== false,
  options: Array.isArray(group?.options)
    ? group!.options.map((option, idx) => normalizeItemOption(option, idx))
    : [],
});

export default function MenuDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthenticator((context) => [context.user]);
  const confirm = useConfirm();
  const { toast } = useToast();
  const apiBase = getApiBase();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuName, setMenuName] = useState("");
  const [menuActive, setMenuActive] = useState(true);
  const [menuTimezone, setMenuTimezone] = useState("America/New_York");
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [isDeletingMenu, setIsDeletingMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pageDirty, setPageDirty] = useState(false);
  const [hasLoadedMenu, setHasLoadedMenu] = useState(false);
  const [menuBaseline, setMenuBaseline] = useState<{
    name: string;
    is_active: boolean;
    timezone: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dietaryTags, setDietaryTags] = useState<
    { id: string; name: string }[]
  >([]);
  const [allergens, setAllergens] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [arVideoToUpload, setArVideoToUpload] = useState<File | null>(null);
  const [arVideoPreviewUrl, setArVideoPreviewUrl] = useState<string | null>(
    null,
  );
  const [isUploadingArVideo, setIsUploadingArVideo] = useState(false);
  const [isRetryingArGeneration, setIsRetryingArGeneration] = useState(false);
  const [isCancelingArGeneration, setIsCancelingArGeneration] = useState(false);
  const [isDeletingArModel, setIsDeletingArModel] = useState(false);
  const [arVideoError, setArVideoError] = useState<string | null>(null);
  const [arCaptures, setArCaptures] = useState<ArCaptureAsset[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingItem, setEditingItem] = useState<
    (Partial<Item> & { categoryId?: string }) | null
  >(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isRemovingItemPhoto, setIsRemovingItemPhoto] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingMenuName, setIsEditingMenuName] = useState(false);
  const [menuNameDraft, setMenuNameDraft] = useState("");
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [tagLabels, setTagLabels] = useState(TAG_LABELS_DEFAULTS);
  const [tagGroups, setTagGroups] = useState<
    Record<string, "diet" | "spice" | "highlights">
  >({});
  const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(
    null,
  );
  const [baseOrigin, setBaseOrigin] = useState("https://menuvium.com");
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrVariant, setQrVariant] = useState<"standard" | "logo">("standard");
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [modalPortalTarget, setModalPortalTarget] = useState<HTMLElement | null>(
    null,
  );
  const [modalOverlayBounds, setModalOverlayBounds] = useState<{
    left: number;
    right: number;
  } | null>(null);
  const contentShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const arVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const existingEditingItemPhotoUrl =
    editingItem?.photo_url ||
    (editingItem ? (editingItem as any).photos?.[0]?.url : undefined);
  const editingItemDisplayPhotoUrl =
    filePreviewUrl || existingEditingItemPhotoUrl;
  const editingItemArStatus = editingItem?.ar_status ?? "none";
  const videoCaptureCount = arCaptures.filter((capture) => capture.kind === "video").length;
  const hasArCaptures = videoCaptureCount > 0;
  const hasLocalArCaptureSelection = Boolean(arVideoToUpload);
  const hasGeneratedArModel = Boolean(
    editingItem?.ar_model_glb_url ||
      editingItem?.ar_model_usdz_url ||
      editingItem?.ar_model_poster_url,
  );
  const canRetryFromExistingVideo =
    hasArCaptures &&
    editingItemArStatus !== "pending" &&
    editingItemArStatus !== "processing";
  const firstArVideoCaptureUrl =
    arCaptures.find((capture) => capture.kind === "video")?.url || null;
  const arPreviewImageUrl =
    editingItem?.ar_model_poster_url ||
    editingItem?.photo_url ||
    (editingItem ? (editingItem as any).photos?.[0]?.url : null) ||
    null;
  const arPreviewVideoUrl =
    arVideoPreviewUrl || firstArVideoCaptureUrl;
  const editingItemArStage = editingItem?.ar_stage || null;
  const editingItemArStageDetail = editingItem?.ar_stage_detail || null;
  const editingItemArProgress =
    typeof editingItem?.ar_progress === "number"
      ? Math.max(0, Math.min(1, editingItem.ar_progress))
      : null;
  const editingItemArProgressPercent =
    editingItemArProgress === null
      ? null
      : Math.round(editingItemArProgress * 100);
  const arStatusLabel =
    editingItemArStatus === "ready"
      ? "Ready"
      : editingItemArStatus === "processing"
        ? "Processing"
        : editingItemArStatus === "pending"
          ? "Queued"
          : editingItemArStatus === "failed"
            ? "Failed"
            : "Not set";
  const arStatusSummary =
    editingItemArStatus === "ready"
      ? "Set: KIRI AR"
      : editingItemArStatus === "processing" ||
        editingItemArStatus === "pending"
        ? "Processing"
        : editingItemArStatus === "failed"
          ? "Needs attention"
          : "Not set";
  const arStatusPillClassName =
    editingItemArStatus === "ready"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : editingItemArStatus === "processing"
        ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
        : editingItemArStatus === "pending"
          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
          : editingItemArStatus === "failed"
            ? "bg-red-500/10 text-red-400 border-red-500/20"
            : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border-[var(--cms-border)]";

  useEffect(() => {
    if (!fileToUpload) {
      setFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(fileToUpload);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [fileToUpload]);

  useEffect(() => {
    if (!arVideoToUpload) {
      setArVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(arVideoToUpload);
    setArVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arVideoToUpload]);

  useEffect(() => {
    setArVideoToUpload(null);
    setArVideoPreviewUrl(null);
    setArVideoError(null);
    setArCaptures([]);
    if (arVideoInputRef.current) arVideoInputRef.current.value = "";
  }, [editingItem?.id]);

  useEffect(() => {
    if (!editingItem?.id) return;
    void loadArCaptures(String(editingItem.id));
  }, [editingItem?.id]);

  useEffect(() => {
    if (!isPhotoPreviewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPhotoPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPhotoPreviewOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBaseOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setModalPortalTarget(document.body);
  }, []);

  const syncModalOverlayInsets = useCallback(() => {
    if (typeof window === "undefined") return;
    const mainRegion = document.querySelector<HTMLElement>(
      '[data-dashboard-main-region="true"]',
    );
    const anchor = mainRegion || contentShellRef.current;
    if (!anchor || window.innerWidth < 768) {
      setModalOverlayBounds(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    setModalOverlayBounds({
      left: Math.max(0, Math.round(rect.left)),
      right: Math.max(0, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useEffect(() => {
    syncModalOverlayInsets();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", syncModalOverlayInsets);
    let observer: ResizeObserver | null = null;
    if (typeof window !== "undefined" && "ResizeObserver" in window) {
      observer = new ResizeObserver(() => syncModalOverlayInsets());
      const mainRegion = document.querySelector<HTMLElement>(
        '[data-dashboard-main-region="true"]',
      );
      if (mainRegion) observer.observe(mainRegion);
      if (contentShellRef.current) observer.observe(contentShellRef.current);
    }
    return () => {
      window.removeEventListener("resize", syncModalOverlayInsets);
      observer?.disconnect();
    };
  }, [syncModalOverlayInsets]);

  useEffect(() => {
    if (!isQrModalOpen && !editingItem) return;
    syncModalOverlayInsets();
  }, [isQrModalOpen, editingItem, syncModalOverlayInsets]);

  useEffect(() => {
    if (!isQrModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsQrModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isQrModalOpen]);

  const normalize = (value: string) => value.trim().toLowerCase();
  const orderTags = <T extends { id: string; name: string }>(
    source: T[],
    names: string[],
  ) =>
    names
      .map((name) =>
        source.find((tag) => normalize(tag.name) === normalize(name)),
      )
      .filter(Boolean) as T[];

  const orderByDefaults = (
    list: { id: string; name: string }[],
    defaults: string[],
  ) => {
    const order = new Map(
      defaults.map((name, index) => [normalize(name), index]),
    );
    return [...list].sort((a, b) => {
      const aRank = order.get(normalize(a.name));
      const bRank = order.get(normalize(b.name));
      if (aRank !== undefined || bRank !== undefined) {
        return (
          (aRank ?? Number.MAX_SAFE_INTEGER) -
          (bRank ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return a.name.localeCompare(b.name);
    });
  };

  const ensureTagGroups = (existing: { id: string; name: string }[]) => {
    const defaults = new Map<string, "diet" | "spice" | "highlights">();
    DIET_TAGS.forEach((name) => defaults.set(normalize(name), "diet"));
    SPICE_TAGS.forEach((name) => defaults.set(normalize(name), "spice"));
    HIGHLIGHT_TAGS.forEach((name) =>
      defaults.set(normalize(name), "highlights"),
    );
    const next = { ...tagGroups };
    let changed = false;
    existing.forEach((tag) => {
      if (next[tag.id]) return;
      const group = defaults.get(normalize(tag.name)) ?? "highlights";
      next[tag.id] = group;
      changed = true;
    });
    if (changed && typeof window !== "undefined") {
      localStorage.setItem("menuvium_tag_groups", JSON.stringify(next));
      setTagGroups(next);
    }
  };

  useEffect(() => {
    if (!dietaryTags.length) return;
    ensureTagGroups(dietaryTags);
  }, [dietaryTags, tagGroups]);

  const groupedTags = {
    diet: dietaryTags.filter((tag) => tagGroups[tag.id] === "diet"),
    spice: dietaryTags.filter((tag) => tagGroups[tag.id] === "spice"),
    highlights: dietaryTags.filter((tag) => tagGroups[tag.id] === "highlights"),
  };

  const dietTagList = orderByDefaults(groupedTags.diet, DIET_TAGS);
  const spiceTagList = orderByDefaults(groupedTags.spice, SPICE_TAGS);
  const highlightTagList = orderByDefaults(
    groupedTags.highlights,
    HIGHLIGHT_TAGS,
  );
  const allergenTagList = orderTags(allergens, ALLERGEN_TAGS);

  useEffect(() => {
    if (params.id) {
      fetchMenu(params.id as string, { blocking: true });
      fetchMetadata();
    }
  }, [params.id, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLabels = localStorage.getItem("menuvium_tag_labels");
    if (storedLabels) {
      try {
        const parsed = JSON.parse(storedLabels) as Partial<
          typeof TAG_LABELS_DEFAULTS
        >;
        setTagLabels({ ...TAG_LABELS_DEFAULTS, ...parsed });
      } catch {
        setTagLabels(TAG_LABELS_DEFAULTS);
      }
    }
    const storedGroups = localStorage.getItem("menuvium_tag_groups");
    if (storedGroups) {
      try {
        const parsed = JSON.parse(storedGroups) as Record<
          string,
          "diet" | "spice" | "highlights"
        >;
        setTagGroups(parsed);
      } catch {
        setTagGroups({});
      }
    }
  }, []);

  const fetchMetadata = async () => {
    try {
      const [tagsRes, algRes] = await Promise.all([
        fetch(`${apiBase}/metadata/dietary-tags`),
        fetch(`${apiBase}/metadata/allergens`),
      ]);
      if (tagsRes.ok) setDietaryTags(await tagsRes.json());
      if (algRes.ok) setAllergens(await algRes.json());
    } catch (e) {
      console.error("Failed to fetch metadata", e);
    }
  };

  const fetchMenu = async (
    id: string,
    options?: { blocking?: boolean },
  ) => {
    const shouldShowBlockingLoading = options?.blocking === true;
    if (shouldShowBlockingLoading) {
      setLoading(true);
    }
    try {
      const token = await getAuthToken();

      // First get the menu details
      const res = await fetch(`${apiBase}/menus/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch menu");
      const menuData = await res.json();

      try {
        const perms = await fetchOrgPermissions({
          apiBase,
          token,
          orgId: menuData.org_id,
        });
        setOrgPermissions(perms);
      } catch (e) {
        console.error(e);
        setOrgPermissions(null);
      }

      const catRes = await fetch(`${apiBase}/categories/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const categories = await catRes.json();

      // TODO: Fetch items per category or fetch all items for menu to populate
      // For now, let's assume specific category fetching logic isn't fully optimised but we need to see items
      // We need a way to see items. Let's fetch them for each category (inefficient but works for now)
      const categoriesWithItems = await Promise.all(
        categories.map(async (c: any) => {
          // We don't have a direct endpoint for items by category strictly in router,
          // but we can assume list_categories MIGHT return items if configured?
          // Wait, backend list_categories just returns [Category].
          // Let's rely on categories already having items if loaded.
          // Actually, list_categories endpoint implementation does `session.exec(select(Category)...)`
          // SQLModel default response might NOT include items.
          // Ideally we should fix fetchMenu to use a better query or endpoint.
          // BUT, for now, let's just use what we have and patch if empty.
          return { ...c, items: c.items || [] };
        }),
      );

      setMenu({ ...menuData, categories: categoriesWithItems });
      const resolvedTimezone = canonicalizeMenuTimezone(menuData.timezone);
      const baseline = {
        name: menuData.name || "",
        is_active: Boolean(menuData.is_active),
        timezone: resolvedTimezone,
      };
      const shouldSyncMenuFields =
        !menuBaseline ||
        (menuName.trim() === menuBaseline.name &&
          menuActive === menuBaseline.is_active &&
          menuTimezone === menuBaseline.timezone);
      setMenuBaseline(baseline);
      if (shouldSyncMenuFields) {
        setMenuName(baseline.name);
        setMenuActive(baseline.is_active);
        setMenuTimezone(baseline.timezone);
      }
      if (!hasLoadedMenu) {
        setPageDirty(false);
        setHasLoadedMenu(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (shouldShowBlockingLoading) {
        setLoading(false);
      }
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName || !menu) return;
    if (!orgPermissions?.can_manage_menus) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to manage menus.",
      });
      return;
    }
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/categories/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCategoryName,
          menu_id: menu.id,
          rank: menu.categories.length,
        }),
      });
      if (res.ok) {
        setNewCategoryName("");
        setIsAddingCategory(false);
        setPageDirty(true);
        fetchMenu(menu.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const ok = await confirm({
      title: "Delete category?",
      description: "This will permanently delete the category and its items.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    if (!orgPermissions?.can_manage_menus) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to manage menus.",
      });
      return;
    }
    try {
      const token = await getAuthToken();
      await fetch(`${apiBase}/categories/${categoryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateCategoryName = async (category: Category) => {
    if (!menu) return;
    if (!orgPermissions?.can_manage_menus) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to manage menus.",
      });
      return;
    }
    const name = editingCategoryName.trim();
    if (!name) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/categories/${category.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: category.id,
          name,
          rank: category.rank ?? 0,
          menu_id: menu.id,
        }),
      });
      if (res.ok) {
        setEditingCategoryId(null);
        setEditingCategoryName("");
        setPageDirty(true);
        fetchMenu(menu.id);
      } else {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err === "object" && err && "detail" in err
            ? (err as any).detail
            : undefined;
        toast({
          variant: "error",
          title: "Failed to update category",
          description: typeof detail === "string" ? detail : "Unknown error",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Failed to update category",
        description: "Please try again in a moment.",
      });
    }
  };

  const persistCategoryOrder = async (categories: Category[]) => {
    if (!menu) return;
    try {
      const token = await getAuthToken();
      await Promise.all(
        categories.map((cat, index) =>
          fetch(`${apiBase}/categories/${cat.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: cat.id,
              name: cat.name,
              rank: index,
              menu_id: menu.id,
            }),
          }),
        ),
      );
      setPageDirty(true);
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Failed to reorder categories",
        description: "Please try again.",
      });
    }
  };

  const persistItemOrder = async (categoryId: string, items: Item[]) => {
    try {
      const token = await getAuthToken();
      await Promise.all(
        items.map((item, index) =>
          fetch(`${apiBase}/items/${item.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ position: index }),
          }),
        ),
      );
      setPageDirty(true);
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Failed to reorder items",
        description: "Please try again.",
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const findCategoryByItemId = (itemSortableId: string) => {
    if (!menu) return null;
    return menu.categories.find((cat) =>
      (cat.items || []).some((item) => `item-${item.id}` === itemSortableId),
    );
  };

  const toggleCategoryCollapse = (categoryId: string) => {
    setCollapsedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const collapseAllCategories = () => {
    if (!menu) return;
    setCollapsedCategoryIds(new Set(menu.categories.map((c) => c.id)));
  };

  const expandAllCategories = () => {
    setCollapsedCategoryIds(new Set());
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setIsDragging(false);
    document.body.style.cursor = "";
    if (!orgPermissions?.can_manage_menus) return;
    if (!menu || !event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    if (activeId === overId) return;

    if (activeId.startsWith("cat-") && overId.startsWith("cat-")) {
      const fromIndex = menu.categories.findIndex(
        (c) => `cat-${c.id}` === activeId,
      );
      const toIndex = menu.categories.findIndex(
        (c) => `cat-${c.id}` === overId,
      );
      if (fromIndex < 0 || toIndex < 0) return;
      const nextCategories = arrayMove(menu.categories, fromIndex, toIndex);
      setMenu({ ...menu, categories: nextCategories });
      await persistCategoryOrder(nextCategories);
      return;
    }

    if (activeId.startsWith("item-") && overId.startsWith("item-")) {
      const activeCategory = findCategoryByItemId(activeId);
      const overCategory = findCategoryByItemId(overId);
      if (
        !activeCategory ||
        !overCategory ||
        activeCategory.id !== overCategory.id
      )
        return;
      const fromIndex = (activeCategory.items || []).findIndex(
        (i) => `item-${i.id}` === activeId,
      );
      const toIndex = (activeCategory.items || []).findIndex(
        (i) => `item-${i.id}` === overId,
      );
      if (fromIndex < 0 || toIndex < 0) return;
      const nextItems = arrayMove(
        activeCategory.items || [],
        fromIndex,
        toIndex,
      );
      const nextCategories = menu.categories.map((cat) =>
        cat.id === activeCategory.id ? { ...cat, items: nextItems } : cat,
      );
      setMenu({ ...menu, categories: nextCategories });
      await persistItemOrder(activeCategory.id, nextItems);
    }
  };

  const handleFileUpload = async (file: File) => {
    const token = await getAuthToken();

    // 1. Get Presigned URL
    const res = await fetch(`${apiBase}/items/upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type,
      }),
    });

    if (!res.ok) throw new Error("Failed to get upload URL");
    const { upload_url, s3_key, public_url } = await res.json();

    // 2. Upload to S3
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (!uploadRes.ok) throw new Error("Failed to upload image");

    return { s3_key, public_url };
  };

  const getVideoMetadata = (file: File) =>
    new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      const url = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        const duration = video.duration;
        const width = video.videoWidth;
        const height = video.videoHeight;
        URL.revokeObjectURL(url);
        if (!Number.isFinite(duration) || width <= 0 || height <= 0) {
          reject(new Error("Could not read video metadata"));
          return;
        }
        resolve({ duration, width, height });
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read video metadata"));
      };
      video.src = url;
    });

  const loadArCaptures = async (itemId: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${itemId}/ar/captures`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setArCaptures([]);
        return;
      }
      const data = (await res.json()) as ItemArCapturesResponse;
      setArCaptures((data.captures || []).filter((capture) => capture.kind === "video"));
    } catch {
      setArCaptures([]);
    }
  };

  const uploadArCaptureFile = async (itemId: string, file: File) => {
    const token = await getAuthToken();
    const presignRes = await fetch(
      `${apiBase}/items/${itemId}/ar/capture-upload-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
        }),
      },
    );
    if (!presignRes.ok) {
      const err = await presignRes.json().catch(() => ({}));
      throw new Error(
        `AR capture upload URL error: ${err.detail || presignRes.statusText || "Unknown error"}`,
      );
    }

    const { upload_url, s3_key, public_url } = await presignRes.json();
    const uploadRes = await fetch(upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name}`);

    const attachRes = await fetch(`${apiBase}/items/${itemId}/ar/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        s3_key,
        url: public_url,
        content_type: file.type,
        filename: file.name,
      }),
    });
    if (!attachRes.ok) {
      const err = await attachRes.json().catch(() => ({}));
      throw new Error(
        `AR capture attach error: ${err.detail || attachRes.statusText || "Unknown error"}`,
      );
    }
    return (await attachRes.json()) as ItemArCapturesResponse;
  };

  const handleUploadArCaptures = async () => {
    if (!editingItem) return;
    if (!editingItem.id) {
      toast({
        variant: "warning",
        title: "Save the item first",
        description: "Create the item before uploading an AR video.",
      });
      return;
    }
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }
    if (editingItemArStatus === "pending" || editingItemArStatus === "processing") {
      toast({
        variant: "warning",
        title: "AR processing in progress",
        description: "Cancel the current run before uploading new captures.",
      });
      return;
    }
    if (!hasLocalArCaptureSelection) {
      toast({
        variant: "warning",
        title: "Select a video",
        description: "Choose a video before uploading.",
      });
      return;
    }

    setIsUploadingArVideo(true);
    setArVideoError(null);
    try {
      if (!arVideoToUpload || !arVideoToUpload.type.startsWith("video/")) {
        throw new Error("Invalid file type. Please upload a video.");
      }

      const { duration } = await getVideoMetadata(arVideoToUpload);
      if (duration > 20) {
        throw new Error("Please keep the rotation video under 20 seconds.");
      }

      for (const capture of arCaptures) {
        await handleDeleteArCapture(capture.id, { silent: true });
      }

      const latestCaptureState = await uploadArCaptureFile(editingItem.id, arVideoToUpload);
      if (latestCaptureState) {
        setArCaptures(
          (latestCaptureState.captures || []).filter((capture) => capture.kind === "video"),
        );
      } else {
        await loadArCaptures(editingItem.id);
      }

      setArVideoToUpload(null);
      setArVideoPreviewUrl(null);
      if (arVideoInputRef.current) arVideoInputRef.current.value = "";
      setPageDirty(true);
      toast({
        variant: "success",
        title: "AR video uploaded",
        description: "Generate the model when you are ready.",
      });
    } catch (e) {
      console.error(e);
      setArVideoError(
        e instanceof Error ? e.message : "Failed to upload AR captures",
      );
    } finally {
      setIsUploadingArVideo(false);
    }
  };

  const handleGenerateArModel = async () => {
    if (!editingItem?.id) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }
    if (!hasArCaptures) {
      toast({
        variant: "warning",
        title: "Upload a video first",
        description: "Upload a video before generating AR.",
      });
      return;
    }

    setIsUploadingArVideo(true);
    setArVideoError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${editingItem.id}/ar/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ capture_mode: "photo_scan" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || "Unknown error");
      }
      const updated = await res.json();
      setEditingItem((prev) =>
        prev ? ({ ...prev, ...updated } as any) : prev,
      );
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
      await loadArCaptures(editingItem.id);
      toast({
        variant: "success",
        title: "AR generation queued",
        description: "KIRI processing has started.",
      });
    } catch (e) {
      console.error(e);
      setArVideoError(
        e instanceof Error ? e.message : "Failed to generate AR model",
      );
    } finally {
      setIsUploadingArVideo(false);
    }
  };

  const handleDeleteArCapture = async (
    captureId: string,
    options?: { silent?: boolean },
  ) => {
    if (!editingItem?.id) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) return;

    setArVideoError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${apiBase}/items/${editingItem.id}/ar/captures/${captureId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || "Unknown error");
      }
      const payload = (await res.json()) as ItemArCapturesResponse;
      setArCaptures((payload.captures || []).filter((capture) => capture.kind === "video"));
      setPageDirty(true);
      if (!options?.silent) {
        toast({
          variant: "success",
          title: "AR video removed",
        });
      }
    } catch (e) {
      console.error(e);
      setArVideoError(
        e instanceof Error ? e.message : "Failed to delete AR capture",
      );
    }
  };

  const handleRetryArGeneration = async () => {
    if (!editingItem?.id) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }

    setIsRetryingArGeneration(true);
    setArVideoError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${editingItem.id}/ar/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || "Unknown error");
      }
      const updated = await res.json();
      setEditingItem((prev) =>
        prev ? ({ ...prev, ...updated } as any) : prev,
      );
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
      await loadArCaptures(editingItem.id);
    } catch (e) {
      console.error(e);
      setArVideoError(
        e instanceof Error ? e.message : "Failed to retry AR generation",
      );
    } finally {
      setIsRetryingArGeneration(false);
    }
  };

  const handleCancelArGeneration = async () => {
    if (!editingItem?.id) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }
    if (
      !window.confirm(
        "Cancel AR generation for this item? Current processing will stop.",
      )
    ) {
      return;
    }

    setIsCancelingArGeneration(true);
    setArVideoError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${editingItem.id}/ar/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || "Unknown error");
      }
      const updated = await res.json();
      setEditingItem((prev) => (prev ? ({ ...prev, ...updated } as any) : prev));
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
      await loadArCaptures(editingItem.id);
      toast({
        variant: "success",
        title: "AR generation canceled",
      });
    } catch (e) {
      console.error(e);
      setArVideoError(
        e instanceof Error ? e.message : "Failed to cancel AR generation",
      );
    } finally {
      setIsCancelingArGeneration(false);
    }
  };

  const handleDeleteArModel = async () => {
    if (!editingItem?.id) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }
    if (
      !window.confirm(
        "Delete generated AR model assets for this item? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsDeletingArModel(true);
    setArVideoError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${editingItem.id}/ar/model`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || res.statusText || "Unknown error");
      }
      const updated = await res.json();
      setEditingItem((prev) => (prev ? ({ ...prev, ...updated } as any) : prev));
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
      await loadArCaptures(editingItem.id);
      toast({
        variant: "success",
        title: "AR model deleted",
      });
    } catch (e) {
      console.error(e);
      setArVideoError(e instanceof Error ? e.message : "Failed to delete AR model");
    } finally {
      setIsDeletingArModel(false);
    }
  };

  const refreshEditingItemArStatus = async (itemId: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setEditingItem((prev) => {
        if (!prev) return prev;
        if (String((prev as any).id || "") !== String(itemId)) return prev;
        return {
          ...prev,
          ar_status: data.ar_status,
          ar_error_message: data.ar_error_message,
          ar_video_url: data.ar_video_url,
          ar_model_glb_url: data.ar_model_glb_url,
          ar_model_usdz_url: data.ar_model_usdz_url,
          ar_model_poster_url: data.ar_model_poster_url,
          ar_created_at: data.ar_created_at,
          ar_updated_at: data.ar_updated_at,
          ar_stage: data.ar_stage,
          ar_stage_detail: data.ar_stage_detail,
          ar_progress: data.ar_progress,
        } as any;
      });
    } catch {
      // Best-effort polling; ignore errors.
    }
  };

  useEffect(() => {
    if (!editingItem?.id) return;
    const status = (editingItem as any).ar_status;
    if (status !== "pending" && status !== "processing") return;

    let canceled = false;
    const itemId = String(editingItem.id);
    const tick = async () => {
      if (canceled) return;
      await refreshEditingItemArStatus(itemId);
    };

    tick();
    const interval = window.setInterval(tick, 4000);
    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [editingItem?.id, (editingItem as any)?.ar_status]);

  const handleSaveItem = async () => {
    if (!editingItem) return;

    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    const canManageAvailability = Boolean(
      orgPermissions?.can_manage_availability,
    );

    if (editingItem.id && !canEditItems) {
      if (!canManageAvailability) {
        toast({
          variant: "warning",
          title: "Not authorized",
          description: "You don’t have permission to update availability.",
        });
        return;
      }
      setIsSavingItem(true);
      try {
        const token = await getAuthToken();
        const res = await fetch(`${apiBase}/items/${editingItem.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            is_sold_out: editingItem.is_sold_out || false,
          }),
        });
        if (res.ok) {
          setEditingItem(null);
          setFileToUpload(null);
          if (menu) fetchMenu(menu.id);
        } else {
          const err = await res.json().catch(() => ({}));
          const detail =
            typeof err === "object" && err && "detail" in err
              ? (err as any).detail
              : undefined;
          toast({
            variant: "error",
            title: "Failed to update item",
            description: typeof detail === "string" ? detail : "Unknown error",
          });
        }
      } catch (e) {
        console.error(e);
        toast({
          variant: "error",
          title: "Error updating item",
          description: "Please try again in a moment.",
        });
      } finally {
        setIsSavingItem(false);
      }
      return;
    }

    if (!canEditItems) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to edit items.",
      });
      return;
    }

    if (!editingItem.name) return;
    if (editingItem.price === undefined || editingItem.price === null) return;

    const displayOptionsDraft = getEditingDisplayOptions();
    for (let oIdx = 0; oIdx < displayOptionsDraft.length; oIdx += 1) {
      const option = displayOptionsDraft[oIdx];
      if (!option.name.trim()) {
        toast({
          variant: "warning",
          title: "Option name required",
          description: `Give a name to option ${oIdx + 1}.`,
        });
        return;
      }
    }

    const itemVisibilityRules = getEditingItemVisibilityRules();

    setIsSavingItem(true);
    try {
      const token = await getAuthToken();

      // Handle Photo Upload
      let photoKey = null;
      let photoUrl = null;
      if (fileToUpload) {
        const uploadData = await handleFileUpload(fileToUpload);
        photoKey = uploadData.s3_key;
        photoUrl = uploadData.public_url;
      }

      const payload = {
        name: editingItem.name,
        description: editingItem.description,
        price: editingItem.price,
        is_sold_out: editingItem.is_sold_out || false,
        category_id: editingItem.categoryId,
        dietary_tag_ids: (editingItem as any).dietary_tag_ids || [],
        allergen_ids: (editingItem as any).allergen_ids || [],
        visibility_rules: itemVisibilityRules.map((rule) => ({
          kind: rule.kind === "exclude" ? "exclude" : "include",
          days_of_week: (rule.days_of_week || [])
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
          start_time_local: normalizeTimeInput(rule.start_time_local, "00:00"),
          end_time_local: normalizeTimeInput(rule.end_time_local, "23:59"),
          start_date: rule.start_date || null,
          end_date: rule.end_date || null,
          is_active: rule.is_active !== false,
        })),
        option_groups:
          displayOptionsDraft.length > 0
            ? [
              {
                name: "Options",
                description: null,
                selection_mode: "multiple",
                min_select: 0,
                max_select: null,
                display_style: "list",
                position: 0,
                is_active: true,
                options: displayOptionsDraft.map((option, optionIndex) => ({
                  name: option.name.trim(),
                  description: option.description || null,
                  image_url: option.image_url || null,
                  badge: option.badge || null,
                  position: optionIndex,
                  is_default: false,
                  is_active: option.is_active !== false,
                  visibility_rules: (option.visibility_rules || []).map((rule) => ({
                    kind: rule.kind === "exclude" ? "exclude" : "include",
                    days_of_week: (rule.days_of_week || [])
                      .map((day) => Number(day))
                      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
                    start_time_local: normalizeTimeInput(rule.start_time_local, "00:00"),
                    end_time_local: normalizeTimeInput(rule.end_time_local, "23:59"),
                    start_date: rule.start_date || null,
                    end_date: rule.end_date || null,
                    is_active: rule.is_active !== false,
                  })),
                })),
              },
            ]
            : [],
      };

      let res;
      let itemId;

      if (editingItem.id) {
        // Update
        res = await fetch(`${apiBase}/items/${editingItem.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        itemId = editingItem.id;
      } else {
        // Create
        res = await fetch(`${apiBase}/items/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          itemId = data.id;
        }
      }

      if (res.ok && itemId && photoKey && photoUrl) {
        // Link photo
        await fetch(`${apiBase}/items/${itemId}/photos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            s3_key: photoKey,
            url: photoUrl,
          }),
        });
      }

      if (res.ok) {
        setEditingItem(null);
        setFileToUpload(null);
        setPageDirty(true);
        if (menu) fetchMenu(menu.id);
        toast({ variant: "success", title: "Item saved" });
      } else {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err === "object" && err && "detail" in err
            ? (err as any).detail
            : undefined;
        toast({
          variant: "error",
          title: "Failed to save item",
          description: typeof detail === "string" ? detail : "Unknown error",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Error saving item",
        description: "Please try again in a moment.",
      });
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleRemoveItemPhoto = async () => {
    if (!editingItem) return;
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    if (!canEditItems) return;

    if (fileToUpload) {
      setFileToUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsPhotoPreviewOpen(false);
      setPageDirty(true);
      return;
    }

    const currentUrl =
      editingItem.photo_url || (editingItem as any).photos?.[0]?.url;
    if (!currentUrl) return;

    if (!editingItem.id) {
      setEditingItem({
        ...(editingItem as any),
        photo_url: undefined,
        photos: [],
      });
      setPageDirty(true);
      return;
    }

    setIsRemovingItemPhoto(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/items/${editingItem.id}/photos`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err === "object" && err && "detail" in err
            ? (err as any).detail
            : undefined;
        toast({
          variant: "error",
          title: "Failed to remove photo",
          description:
            typeof detail === "string" ? detail : "Please try again.",
        });
        return;
      }
      setEditingItem((prev) =>
        prev ? { ...(prev as any), photo_url: undefined, photos: [] } : prev,
      );
      setFileToUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsPhotoPreviewOpen(false);
      setPageDirty(true);
      if (menu) fetchMenu(menu.id);
      toast({ variant: "success", title: "Photo removed" });
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Failed to remove photo",
        description: "Please try again in a moment.",
      });
    } finally {
      setIsRemovingItemPhoto(false);
    }
  };

  const toggleMetadata = (type: "tags" | "allergens", id: string) => {
    if (!editingItem) return;
    const key = type === "tags" ? "dietary_tag_ids" : "allergen_ids";
    const current = (editingItem as any)[key] || [];
    const updated = current.includes(id)
      ? current.filter((x: string) => x !== id)
      : [...current, id];
    setEditingItem({ ...editingItem, [key]: updated });
    setPageDirty(true);
  };

  const getEditingOptionGroups = (): ItemOptionGroup[] => {
    if (!editingItem) return [];
    const groups = (editingItem as any).option_groups;
    if (!Array.isArray(groups)) return [];
    return groups.map((group: ItemOptionGroup, index: number) =>
      normalizeItemOptionGroup(group, index),
    );
  };

  const setEditingOptionGroups = (groups: ItemOptionGroup[]) => {
    if (!editingItem) return;
    const normalized = groups.map((group, groupIndex) =>
      normalizeItemOptionGroup(
        {
          ...group,
          position: groupIndex,
          options: (group.options || []).map((option, optionIndex) =>
            normalizeItemOption({ ...option, position: optionIndex }, optionIndex),
          ),
        },
        groupIndex,
      ),
    );
    setEditingItem({ ...editingItem, option_groups: normalized });
    setPageDirty(true);
  };

  const getEditingDisplayOptions = (): ItemOption[] => {
    const groups = getEditingOptionGroups();
    const flattened = groups.flatMap((group) => group.options || []);
    return flattened.map((option, index) =>
      normalizeItemOption({ ...option, position: index, is_default: false }, index),
    );
  };

  const setEditingDisplayOptions = (options: ItemOption[]) => {
    const normalized = options.map((option, index) =>
      normalizeItemOption({ ...option, position: index, is_default: false }, index),
    );
    if (normalized.length === 0) {
      setEditingOptionGroups([]);
      return;
    }
    setEditingOptionGroups([
      normalizeItemOptionGroup(
        {
          name: "Options",
          description: null,
          selection_mode: "multiple",
          min_select: 0,
          max_select: null,
          display_style: "list",
          position: 0,
          is_active: true,
          options: normalized,
        },
        0,
      ),
    ]);
  };

  const addDisplayOption = () => {
    const options = getEditingDisplayOptions();
    setEditingDisplayOptions([
      ...options,
      createDefaultItemOption(options.length),
    ]);
  };

  const updateDisplayOptionField = (
    optionIndex: number,
    field: keyof ItemOption,
    value: unknown,
  ) => {
    const options = getEditingDisplayOptions();
    const next = options.map((option, idx) =>
      idx === optionIndex ? ({ ...option, [field]: value } as ItemOption) : option,
    );
    setEditingDisplayOptions(next);
  };

  const removeDisplayOption = (optionIndex: number) => {
    const options = getEditingDisplayOptions();
    setEditingDisplayOptions(options.filter((_, idx) => idx !== optionIndex));
  };

  const getEditingItemVisibilityRules = (): VisibilityRule[] => {
    if (!editingItem) return [];
    const rules = (editingItem as any).visibility_rules;
    if (!Array.isArray(rules)) return [];
    return rules.map((rule: VisibilityRule) => normalizeVisibilityRule(rule));
  };

  const setEditingItemVisibilityRules = (rules: VisibilityRule[]) => {
    if (!editingItem) return;
    const normalized = rules.map((rule) => normalizeVisibilityRule(rule));
    setEditingItem({ ...editingItem, visibility_rules: normalized });
    setPageDirty(true);
  };

  const toggleRuleDay = (rule: VisibilityRule, day: number): VisibilityRule => {
    const days = rule.days_of_week || [];
    const hasDay = days.includes(day);
    return {
      ...rule,
      days_of_week: hasDay ? days.filter((d) => d !== day) : [...days, day],
    };
  };

  const addItemVisibilityRule = () => {
    setEditingItemVisibilityRules([
      ...getEditingItemVisibilityRules(),
      createDefaultVisibilityRule(),
    ]);
  };

  const updateItemVisibilityRuleField = (
    ruleIndex: number,
    field: keyof VisibilityRule,
    value: unknown,
  ) => {
    const next = getEditingItemVisibilityRules().map((rule, idx) =>
      idx === ruleIndex ? ({ ...rule, [field]: value } as VisibilityRule) : rule,
    );
    setEditingItemVisibilityRules(next);
  };

  const toggleItemVisibilityRuleDay = (ruleIndex: number, day: number) => {
    const next = getEditingItemVisibilityRules().map((rule, idx) =>
      idx === ruleIndex ? toggleRuleDay(rule, day) : rule,
    );
    setEditingItemVisibilityRules(next);
  };

  const removeItemVisibilityRule = (ruleIndex: number) => {
    setEditingItemVisibilityRules(
      getEditingItemVisibilityRules().filter((_, idx) => idx !== ruleIndex),
    );
  };

  const addDisplayOptionVisibilityRule = (optionIndex: number) => {
    const options = getEditingDisplayOptions();
    const next = options.map((option, idx) =>
      idx === optionIndex
        ? {
          ...option,
          visibility_rules: [
            ...(option.visibility_rules || []),
            createDefaultVisibilityRule(),
          ],
        }
        : option,
    );
    setEditingDisplayOptions(next);
  };

  const updateDisplayOptionVisibilityRuleField = (
    optionIndex: number,
    ruleIndex: number,
    field: keyof VisibilityRule,
    value: unknown,
  ) => {
    const options = getEditingDisplayOptions();
    const next = options.map((option, idx) => {
      if (idx !== optionIndex) return option;
      return {
        ...option,
        visibility_rules: (option.visibility_rules || []).map((rule, rIdx) =>
          rIdx === ruleIndex ? ({ ...rule, [field]: value } as VisibilityRule) : rule,
        ),
      };
    });
    setEditingDisplayOptions(next);
  };

  const toggleDisplayOptionVisibilityRuleDay = (
    optionIndex: number,
    ruleIndex: number,
    day: number,
  ) => {
    const options = getEditingDisplayOptions();
    const next = options.map((option, idx) => {
      if (idx !== optionIndex) return option;
      return {
        ...option,
        visibility_rules: (option.visibility_rules || []).map((rule, rIdx) =>
          rIdx === ruleIndex ? toggleRuleDay(rule, day) : rule,
        ),
      };
    });
    setEditingDisplayOptions(next);
  };

  const removeDisplayOptionVisibilityRule = (
    optionIndex: number,
    ruleIndex: number,
  ) => {
    const options = getEditingDisplayOptions();
    const next = options.map((option, idx) => {
      if (idx !== optionIndex) return option;
      return {
        ...option,
        visibility_rules: (option.visibility_rules || []).filter(
          (_, rIdx) => rIdx !== ruleIndex,
        ),
      };
    });
    setEditingDisplayOptions(next);
  };

  const persistMenuChanges = async ({
    showSuccessToast = true,
  }: { showSuccessToast?: boolean } = {}) => {
    if (!menu) return;
    if (!orgPermissions?.can_manage_menus) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to manage menus.",
      });
      return false;
    }
    if (!menuName.trim()) {
      toast({
        variant: "warning",
        title: "Menu name required",
        description: "Please enter a name for this menu.",
      });
      return false;
    }
    if (!menuTimezone) {
      toast({
        variant: "warning",
        title: "Timezone required",
        description: "Please select a timezone.",
      });
      return false;
    }
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: menuName.trim(),
          is_active: menuActive,
          timezone: menuTimezone,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err === "object" && err && "detail" in err
            ? (err as any).detail
            : undefined;
        toast({
          variant: "error",
          title: "Failed to save menu",
          description: typeof detail === "string" ? detail : "Unknown error",
        });
        return false;
      }
      const data = await res.json();
      setMenu({ ...menu, ...data });
      setMenuName(data.name || menuName);
      setMenuActive(Boolean(data.is_active));
      const resolvedTimezone = canonicalizeMenuTimezone(data.timezone || menuTimezone);
      setMenuTimezone(resolvedTimezone);
      setMenuBaseline({
        name: data.name || menuName,
        is_active: Boolean(data.is_active),
        timezone: resolvedTimezone,
      });
      setPageDirty(false);
      if (showSuccessToast) {
        toast({ variant: "success", title: "Menu saved" });
      }
      return true;
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Error saving menu",
        description: "Please try again in a moment.",
      });
      return false;
    }
  };

  const handleToggleMenuActive = () => {
    const next = !menuActive;
    setMenuActive(next);
    toast({
      variant: "success",
      title: next ? "Menu set to active" : "Menu set to inactive",
    });
    setPageDirty(true);
  };

  const handleSaveMenu = async () => {
    setIsSavingMenu(true);
    try {
      await persistMenuChanges();
    } finally {
      setIsSavingMenu(false);
    }
  };

  const handleDeleteMenu = async () => {
    if (!menu) return;
    if (!orgPermissions?.can_manage_menus) {
      toast({
        variant: "warning",
        title: "Not authorized",
        description: "You don’t have permission to manage menus.",
      });
      return;
    }
    const ok = await confirm({
      title: "Delete menu?",
      description:
        "This permanently deletes the menu and all categories/items inside it.",
      confirmLabel: "Delete",
      variant: "destructive",
      requireTextMatch: menu.name,
      requireTextLabel: `Type "${menu.name}" to confirm.`,
    });
    if (!ok) return;
    setIsDeletingMenu(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ variant: "success", title: "Menu deleted" });
        router.push("/dashboard/menus");
      } else {
        toast({
          variant: "error",
          title: "Failed to delete menu",
          description: "Please try again.",
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Error deleting menu",
        description: "Please try again in a moment.",
      });
    } finally {
      setIsDeletingMenu(false);
    }
  };

  const handleExportMenu = async () => {
    if (!menu) return;
    setIsExporting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/export/menu/${menu.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail =
          typeof err === "object" && err && "detail" in err
            ? (err as any).detail
            : undefined;
        toast({
          variant: "error",
          title: "Export failed",
          description: typeof detail === "string" ? detail : "Unknown error",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = res.headers.get("Content-Disposition");
      let filename = `menu_${menu.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.zip`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast({
        variant: "error",
        title: "Error exporting menu",
        description: "Please try again in a moment.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (loading)
    return (
      <div className="text-[var(--cms-muted)] flex items-center gap-2">
        <Loader2 className="animate-spin" /> Loading menu...
      </div>
    );
  if (!menu)
    return <div className="text-[var(--cms-muted)]">Menu not found</div>;

  const canManageMenus = Boolean(orgPermissions?.can_manage_menus);
  const canEditItems = Boolean(orgPermissions?.can_edit_items);
  const canManageAvailability = Boolean(
    orgPermissions?.can_manage_availability,
  );
  const canOpenItemModal = canEditItems || canManageAvailability;
  const publicMenuUrl = `${baseOrigin}/r/${menu.id}`;
  const qrBaseUrl = `${apiBase}/menus/${menu.id}/qr`;
  const standardQrPreviewUrl = `${qrBaseUrl}?variant=standard&format=png&size=640`;
  const standardQrOpenUrl = `${qrBaseUrl}?variant=standard&format=png&size=1000`;
  const standardQrPdfUrl = `${qrBaseUrl}?variant=standard&format=pdf&size=1000`;
  const hasLogoQrVariant = Boolean(menu.logo_url);
  const logoQrPreviewUrl = hasLogoQrVariant
    ? `${qrBaseUrl}?variant=logo&format=png&size=640`
    : null;
  const logoQrOpenUrl = hasLogoQrVariant
    ? `${qrBaseUrl}?variant=logo&format=png&size=1000`
    : null;
  const logoQrPdfUrl = hasLogoQrVariant
    ? `${qrBaseUrl}?variant=logo&format=pdf&size=1000`
    : null;
  const activeQrVariant =
    qrVariant === "logo" && hasLogoQrVariant ? "logo" : "standard";
  const activeQrPreviewUrl =
    activeQrVariant === "logo" ? logoQrPreviewUrl! : standardQrPreviewUrl;
  const activeQrOpenUrl =
    activeQrVariant === "logo" ? logoQrOpenUrl! : standardQrOpenUrl;
  const activeQrPdfUrl =
    activeQrVariant === "logo" ? logoQrPdfUrl! : standardQrPdfUrl;
  const timezoneOptions = TIMEZONE_ABBREVIATION_OPTIONS;
  const editingDisplayOptionsDraft = editingItem ? getEditingDisplayOptions() : [];
  const editingItemVisibilityRulesDraft = editingItem
    ? getEditingItemVisibilityRules()
    : [];
  const modalContentAlignmentStyle = modalOverlayBounds
    ? {
      marginLeft: `${modalOverlayBounds.left}px`,
      marginRight: `${modalOverlayBounds.right}px`,
    }
    : undefined;
  const renderInModalPortal = (content: ReactNode) =>
    modalPortalTarget ? createPortal(content, modalPortalTarget) : null;

  const openQrModal = () => {
    setCopiedPublicUrl(false);
    setQrVariant("standard");
    setIsQrModalOpen(true);
  };

  const closeQrModal = () => {
    setIsQrModalOpen(false);
    setCopiedPublicUrl(false);
  };

  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicMenuUrl);
      setCopiedPublicUrl(true);
      setTimeout(() => setCopiedPublicUrl(false), 1800);
    } catch {
      setCopiedPublicUrl(false);
    }
  };

  return (
    <div ref={contentShellRef} className="w-full max-w-5xl mx-auto">
      <div className="cms-surface-0 rounded-2xl p-4 sm:p-6">
        <header className="mb-6 space-y-3 sm:mb-8">
          <Link
            href="/dashboard/menus"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Menus
          </Link>
          <div className="space-y-4">
            <div className="flex justify-center">
              {isEditingMenuName ? (
                <div className="flex items-center justify-center gap-2">
                  <input
                    className="font-heading text-3xl font-bold tracking-tight text-center bg-transparent border-b border-[var(--cms-border)] focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                    value={menuNameDraft}
                    onChange={(e) => setMenuNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextName = menuNameDraft.trim();
                        if (!nextName) return;
                        setMenuName(nextName);
                        setPageDirty(true);
                        setIsEditingMenuName(false);
                      }
                    }}
                    aria-label="Menu name"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const nextName = menuNameDraft.trim();
                      if (!nextName) return;
                      setMenuName(nextName);
                      setPageDirty(true);
                      setIsEditingMenuName(false);
                    }}
                    className="p-2 rounded-lg hover:bg-[var(--cms-pill)]"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setMenuNameDraft(menuName);
                      setIsEditingMenuName(false);
                    }}
                    className="p-2 rounded-lg hover:bg-[var(--cms-pill)]"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  {canManageMenus ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuNameDraft(menuName);
                        setIsEditingMenuName(true);
                      }}
                      className="group inline-flex items-center justify-center gap-2 font-heading text-3xl font-bold tracking-tight text-center hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25"
                      aria-label="Edit menu name"
                      title="Edit menu name"
                    >
                      <span className="leading-none">{menuName}</span>
                      <PencilLine className="relative top-[1px] w-4 h-4 text-[var(--cms-muted)] transition-colors group-hover:text-[var(--cms-text)]" />
                    </button>
                  ) : (
                    <h1 className="font-heading text-3xl font-bold tracking-tight text-center">
                      {menuName}
                    </h1>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {canManageMenus && (
                <button
                  onClick={handleSaveMenu}
                  disabled={isSavingMenu || !pageDirty}
                  className={`inline-flex h-10 min-w-[7.5rem] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${pageDirty && !isSavingMenu
                      ? "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                      : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] cursor-not-allowed"
                    }`}
                >
                  {isSavingMenu && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSavingMenu ? "Saving..." : "Save"}
                </button>
              )}
              {canManageMenus && (
                <button
                  onClick={handleToggleMenuActive}
                  className="h-9 px-2.5 inline-flex items-center gap-2 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--cms-muted)] transition-colors duration-150 hover:text-[var(--cms-text)] motion-reduce:transition-none"
                >
                  <span>{menuActive ? "Active" : "Inactive"}</span>
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none ${menuActive ? "bg-[var(--cms-text)]" : "bg-[var(--cms-panel)]"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--cms-bg)] shadow transition-transform duration-150 motion-reduce:transition-none ${menuActive ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </span>
                </button>
              )}
              {canManageMenus && (
                <Link
                  href={`/dashboard/menus/${menu.id}/themes`}
                  className="h-9 px-3.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-xs font-semibold inline-flex items-center justify-center text-[var(--cms-muted)] transition-colors duration-150 hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)] motion-reduce:transition-none"
                >
                  Design Studio
                </Link>
              )}
              <Link
                href={`/r/${menu.id}`}
                target="_blank"
                className="h-9 px-3.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-xs font-semibold inline-flex items-center justify-center text-[var(--cms-muted)] transition-colors duration-150 hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)] motion-reduce:transition-none"
              >
                View Public Page
              </Link>
              <button
                type="button"
                onClick={openQrModal}
                className="h-9 px-3.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 text-[var(--cms-muted)] transition-colors duration-150 hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)] motion-reduce:transition-none"
              >
                <QrCode className="w-3.5 h-3.5" />
                QR Code
              </button>
              {canManageMenus && (
                <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] pl-2.5 pr-2">
                  <label
                    htmlFor="menu-timezone-select"
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cms-muted)]"
                  >
                    TZ
                  </label>
                  <select
                    id="menu-timezone-select"
                    value={menuTimezone}
                    onChange={(e) => {
                      setMenuTimezone(e.target.value);
                      setPageDirty(true);
                    }}
                    className="h-7 w-[5.25rem] bg-transparent text-xs font-semibold text-[var(--cms-text)] focus:outline-none"
                    aria-label="Menu timezone"
                  >
                    {timezoneOptions.map((timezone) => (
                      <option key={timezone.value} value={timezone.value}>
                        {timezone.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {canManageMenus && (
                <button
                  type="button"
                  onClick={handleExportMenu}
                  disabled={isExporting}
                  className="h-9 px-3.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 text-[var(--cms-muted)] transition-colors duration-150 hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)] motion-reduce:transition-none disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {isExporting ? "Exporting..." : "Export"}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--cms-muted)]">
              <button
                onClick={collapseAllCategories}
                className="transition-colors duration-150 hover:text-[var(--cms-text)] motion-reduce:transition-none"
              >
                Collapse all
              </button>
              <span className="text-[var(--cms-border)]">•</span>
              <button
                onClick={expandAllCategories}
                className="transition-colors duration-150 hover:text-[var(--cms-text)] motion-reduce:transition-none"
              >
                Expand all
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-10 pt-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={() => {
              setIsDragging(true);
              document.body.style.cursor = "grabbing";
            }}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setIsDragging(false);
              document.body.style.cursor = "";
            }}
          >
            <SortableContext
              items={menu.categories.map((category) => `cat-${category.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {menu.categories.map((category) => (
                <SortableCategoryCard
                  key={category.id}
                  id={`cat-${category.id}`}
                  disabled={!canManageMenus}
                  className="mt-8 first:mt-0 overflow-hidden bg-transparent"
                >
                  {({ attributes, listeners }) => (
                    <>
                      <div
                        className="px-2 py-4 border-b border-[var(--cms-border)] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.12)] flex justify-between items-center gap-3 group cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsedCategoryIds.has(category.id)}
                        aria-label={`${collapsedCategoryIds.has(category.id) ? "Expand" : "Collapse"} ${category.name}`}
                        onClick={() => toggleCategoryCollapse(category.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleCategoryCollapse(category.id);
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {canManageMenus ? (
                            <button
                              className="p-1.5 text-[var(--cms-muted)] opacity-65 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 motion-reduce:transition-none cursor-grab active:cursor-grabbing rounded-md hover:bg-[var(--cms-pill)]"
                              {...attributes}
                              {...listeners}
                              aria-label="Reorder category"
                              title="Drag to reorder category"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="w-8 h-8" aria-hidden="true" />
                          )}
                          <div
                            className="text-[var(--cms-muted)]"
                            aria-hidden="true"
                          >
                            {collapsedCategoryIds.has(category.id) ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                          {canManageMenus &&
                            editingCategoryId === category.id ? (
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                value={editingCategoryName}
                                onChange={(e) =>
                                  setEditingCategoryName(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleUpdateCategoryName(category);
                                  }
                                }}
                                className="bg-transparent border border-[var(--cms-border)] rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                autoFocus
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateCategoryName(category);
                                }}
                                className="p-1.5 rounded-lg hover:bg-[var(--cms-pill)]"
                                title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCategoryId(null);
                                  setEditingCategoryName("");
                                }}
                                className="p-1.5 rounded-lg hover:bg-[var(--cms-pill)]"
                                title="Cancel"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="truncate font-semibold text-xl sm:text-2xl tracking-tight text-left">
                              {category.name}
                            </div>
                          )}
                        </div>
                        {canManageMenus && (
                          <div
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategoryId(category.id);
                                setEditingCategoryName(category.name);
                              }}
                              className="p-2 hover:bg-[var(--cms-pill)] rounded-lg text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                              title="Rename category"
                              aria-label="Rename category"
                            >
                              <PencilLine className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(category.id);
                              }}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 hover:text-red-600"
                              aria-label="Delete category"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${collapsedCategoryIds.has(category.id)
                            ? "grid-rows-[0fr] opacity-0"
                            : "grid-rows-[1fr] opacity-100"
                          }`}
                      >
                        <div
                          className={`min-h-0 overflow-hidden ${collapsedCategoryIds.has(category.id) ? "pointer-events-none" : ""}`}
                        >
                          <div className="pt-3 pl-5 pr-1 space-y-0">
                            {category.items?.length === 0 && (
                              <div className="text-center py-8 text-[var(--cms-muted)] text-sm border-2 border-dashed border-[var(--cms-border)] rounded-xl">
                                No items in this category yet.
                              </div>
                            )}
                            <SortableContext
                              items={(category.items || []).map(
                                (item) => `item-${item.id}`,
                              )}
                              strategy={verticalListSortingStrategy}
                            >
                              {category.items.map((item) => (
                                <SortableItemRow
                                  key={item.id}
                                  id={`item-${item.id}`}
                                  disabled={!canManageMenus}
                                  className={`group/item px-4 py-4 rounded-md border-b border-[var(--cms-border)] last:border-b-0 flex justify-between items-center transition-colors duration-150 motion-reduce:transition-none hover:bg-[color-mix(in_srgb,var(--cms-panel)_88%,transparent)] ${canOpenItemModal ? "cursor-pointer" : ""} ${item.is_sold_out ? "opacity-[0.86]" : ""}`}
                                >
                                  {({
                                    attributes: itemAttributes,
                                    listeners: itemListeners,
                                  }) => (
                                    <div
                                      className="flex w-full items-center justify-between gap-3"
                                      onClick={() => {
                                        if (isDragging) return;
                                        if (!canOpenItemModal) return;
                                        setEditingItem({
                                          ...item,
                                          categoryId: category.id,
                                          dietary_tag_ids: (
                                            item.dietary_tags || []
                                          ).map((t: any) => t.id),
                                          allergen_ids: (
                                            item.allergens || []
                                          ).map((a: any) => a.id),
                                          option_groups: (
                                            item.option_groups || []
                                          ).map((group, groupIndex) =>
                                            normalizeItemOptionGroup(group, groupIndex),
                                          ),
                                          visibility_rules: (
                                            item.visibility_rules || []
                                          ).map((rule) => normalizeVisibilityRule(rule)),
                                        } as any);
                                        setFileToUpload(null);
                                      }}
                                    >
                                      <div className="flex min-w-0 items-center gap-3.5">
                                        {canManageMenus ? (
                                          <button
                                            className="p-1.5 text-[var(--cms-muted)] opacity-65 sm:opacity-0 sm:group-hover/item:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 motion-reduce:transition-none cursor-grab active:cursor-grabbing rounded-md hover:bg-[var(--cms-pill)]"
                                            {...itemAttributes}
                                            {...itemListeners}
                                            aria-label="Reorder item"
                                            title="Drag to reorder item"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <GripVertical className="w-4 h-4" />
                                          </button>
                                        ) : (
                                          <div
                                            className="w-8 h-8"
                                            aria-hidden="true"
                                          />
                                        )}
                                        {(item.photo_url ||
                                          (item as any).photos?.[0]?.url) && (
                                            <img
                                              src={
                                                item.photo_url ||
                                                (item as any).photos?.[0]?.url
                                              }
                                              alt={item.name}
                                              className="w-10 h-10 rounded-lg object-cover bg-[var(--cms-panel-strong)]"
                                            />
                                          )}
                                        <div className="min-w-0">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <p className="truncate text-[15px] font-semibold leading-tight">
                                              {item.name}
                                            </p>
                                            {Boolean(item.ar_video_url) && (
                                              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cms-muted)]">
                                                <Box className="h-2.5 w-2.5" />
                                                AR
                                              </span>
                                            )}
                                          </div>
                                          {item.description && (
                                            <p className="text-[11px] text-[var(--cms-muted)] opacity-80 line-clamp-1 mt-0.5">
                                              {item.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="ml-3 flex min-w-[146px] shrink-0 items-center justify-end gap-2 self-start pt-0.5">
                                        <span className="w-[74px] text-right font-mono text-sm tabular-nums">
                                          ${item.price}
                                        </span>
                                        {item.is_sold_out && (
                                          <span className="text-[10px] bg-[var(--cms-pill)] text-[var(--cms-muted)] border border-[var(--cms-border)] px-2 py-1 rounded-full uppercase tracking-[0.12em] font-semibold">
                                            Sold out
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </SortableItemRow>
                              ))}
                            </SortableContext>

                            {canEditItems && (
                              <button
                                onClick={() => {
                                  setEditingItem({
                                    categoryId: category.id,
                                    option_groups: [],
                                    visibility_rules: [],
                                  });
                                  setFileToUpload(null);
                                  setPageDirty(true);
                                }}
                                className="w-full px-4 py-4 rounded-md text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[color-mix(in_srgb,var(--cms-panel)_88%,transparent)] transition-colors duration-150 motion-reduce:transition-none text-sm font-medium flex items-center justify-center gap-2"
                              >
                                <Plus className="w-4 h-4" /> Add Item
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </SortableCategoryCard>
              ))}
            </SortableContext>
          </DndContext>

          {canManageMenus && (
            <>
              {/* Add Category Section */}
              {isAddingCategory ? (
                <div className="bg-[var(--cms-panel)] border border-[var(--cms-border)] p-6 rounded-2xl animate-fade-in-up">
                  <h3 className="font-bold mb-4">New Category</h3>
                  <div className="flex gap-4">
                    <input
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        if (e.target.value.trim()) setPageDirty(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
                      placeholder="Category Name (e.g. Appetizers)"
                      className="flex-1 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 py-2 focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                      autoFocus
                    />
                    <button
                      onClick={handleAddCategory}
                      className="bg-[var(--cms-accent)] text-white px-6 rounded-xl font-bold hover:bg-[var(--cms-accent-strong)]"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName("");
                      }}
                      className="bg-[var(--cms-panel-strong)] text-[var(--cms-text)] px-4 rounded-xl font-bold hover:opacity-90"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsAddingCategory(true);
                    setPageDirty(true);
                  }}
                  className="w-full py-6 border-2 border-dashed border-[var(--cms-border)] rounded-2xl text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)] transition-all font-bold text-lg flex items-center justify-center gap-3"
                >
                  <Plus className="w-6 h-6" /> Add Category
                </button>
              )}
            </>
          )}
        </div>

        {canManageMenus && (
          <div className="mt-10 border border-red-500/20 bg-red-500/5 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-bold text-red-400">Delete Menu</h3>
              <p className="text-sm text-[var(--cms-muted)]">
                This removes the menu and its items permanently.
              </p>
            </div>
            <button
              onClick={handleDeleteMenu}
              disabled={isDeletingMenu}
              className="px-4 py-2 rounded-lg font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeletingMenu ? "Deleting..." : "Delete Menu"}
            </button>
          </div>
        )}

        {isQrModalOpen &&
          renderInModalPortal(
            <div
              className="fixed inset-0 cms-modal-overlay z-[110] flex items-center justify-center p-4 animate-fade-in motion-reduce:animate-none"
              onClick={closeQrModal}
            >
              <div
                className="pointer-events-none flex h-full w-full items-center justify-center"
                style={modalContentAlignmentStyle}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="menu-qr-modal-title"
                  className="pointer-events-auto cms-modal-shell ring-1 ring-[var(--cms-border)] w-full max-w-xl rounded-2xl max-h-[90vh] flex flex-col backdrop-blur-xl animate-fade-in-scale motion-reduce:animate-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex items-start justify-between border-b border-[var(--cms-border)] rounded-t-2xl">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[var(--cms-muted)]">
                        Publish
                      </p>
                      <h2
                        id="menu-qr-modal-title"
                        className="mt-1 text-xl font-bold tracking-tight"
                      >
                        Menu QR Code
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={closeQrModal}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-panel-strong)] hover:text-[var(--cms-text)]"
                      aria-label="Close QR popup"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-6 pt-5 space-y-5 overflow-y-auto">
                    <div className="inline-flex w-full rounded-xl border border-border bg-panelStrong p-1">
                      <button
                        type="button"
                        onClick={() => setQrVariant("standard")}
                        className={`h-9 flex-1 rounded-lg text-xs font-semibold transition-colors ${activeQrVariant === "standard"
                            ? "bg-[var(--cms-accent)] text-white"
                            : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                          }`}
                      >
                        Standard QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrVariant("logo")}
                        disabled={!hasLogoQrVariant}
                        className={`h-9 flex-1 rounded-lg text-xs font-semibold transition-colors ${activeQrVariant === "logo"
                            ? "bg-[var(--cms-accent)] text-white"
                            : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                          } ${!hasLogoQrVariant ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        Logo QR
                      </button>
                    </div>
                    {!hasLogoQrVariant ? (
                      <p className="text-xs text-[var(--cms-muted)]">
                        Upload a logo in Design Studio to generate a branded QR
                        option.
                      </p>
                    ) : null}

                    <div className="rounded-2xl border border-border bg-panelStrong p-5 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeQrPreviewUrl}
                        alt={`${activeQrVariant === "logo" ? "Branded" : "Standard"} QR code for ${menu.name}`}
                        className="h-64 w-64 max-w-full rounded-xl bg-white p-2"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted">
                        Public URL
                      </label>
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-panelStrong px-3 py-2.5">
                        <span className="truncate text-sm text-foreground">
                          {publicMenuUrl}
                        </span>
                        <button
                          type="button"
                          onClick={copyPublicUrl}
                          className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-pill hover:text-foreground"
                          aria-label="Copy public URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedPublicUrl ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="cms-modal-footer p-6 pt-4 border-t border-[var(--cms-border)] flex flex-col gap-3 sm:flex-row sm:justify-end flex-shrink-0 rounded-b-2xl">
                    <a
                      href={publicMenuUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground transition-colors hover:bg-pill"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Menu
                    </a>
                    <a
                      href={activeQrOpenUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]"
                    >
                      <QrCode className="h-4 w-4" />
                      Open QR Image
                    </a>
                    <a
                      href={activeQrPdfUrl}
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground transition-colors hover:bg-pill"
                    >
                      <Download className="h-4 w-4" />
                      Download QR PDF
                    </a>
                  </div>
                </div>
              </div>
            </div>,
          )}

        {/* Item Editor Modal */}
        {editingItem &&
          renderInModalPortal(
            <div
              className="fixed inset-0 cms-modal-overlay z-[110] flex items-center justify-center p-3 sm:p-4 animate-fade-in motion-reduce:animate-none"
            >
              <div
                className="pointer-events-none flex h-full w-full items-center justify-center"
                style={modalContentAlignmentStyle}
              >
                <div
                  className="pointer-events-auto cms-modal-shell cms-surface-3 ring-1 ring-[var(--cms-border)] w-full max-w-2xl rounded-2xl max-h-[min(92vh,880px)] flex flex-col animate-fade-in-scale motion-reduce:animate-none"
                  onKeyDown={(e) => {
                    const target = e.target as HTMLElement;
                    const isTextarea = target.tagName === "TEXTAREA";
                    if (e.key === "Enter" && !isTextarea) {
                      e.preventDefault();
                      handleSaveItem();
                    }
                  }}
                >
                  <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex justify-between items-center border-b border-[var(--cms-border)] rounded-t-2xl">
                    <div>
                      <h2 className="font-heading text-xl font-bold tracking-tight">
                        {editingItem.id ? "Edit item" : "Add item"}
                      </h2>
                      <p className="text-xs text-[var(--cms-muted)] mt-1">
                        Keep it concise and scannable on mobile.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setFileToUpload(null);
                        setArVideoToUpload(null);
                        setArVideoError(null);
                      }}
                      className="p-2 hover:bg-[var(--cms-pill)] rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-5 sm:p-6 pt-5 flex flex-col gap-4 overflow-y-auto flex-1 custom-scrollbar">
                    <details
                      open
                      className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]"
                    >
                      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                        <div>
                          <div className="text-sm font-semibold text-[var(--cms-text)]">
                            Basic
                          </div>
                          <div className="text-xs text-[var(--cms-muted)]">
                            Name, description, pricing, and availability
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <div className="px-4 pb-4 space-y-4">
                        <div className="space-y-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                            Name
                          </label>
                          <input
                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all duration-150 motion-reduce:transition-none text-sm"
                            placeholder="e.g. Margherita Pizza"
                            value={editingItem.name || ""}
                            onChange={(e) => {
                              if (!canEditItems) return;
                              setEditingItem({
                                ...editingItem,
                                name: e.target.value,
                              });
                              setPageDirty(true);
                            }}
                            disabled={!canEditItems}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                            Description
                          </label>
                          <textarea
                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all duration-150 motion-reduce:transition-none min-h-[96px] text-sm"
                            placeholder="e.g. Tomato sauce, mozzarella, and fresh basil."
                            value={editingItem.description || ""}
                            onChange={(e) => {
                              if (!canEditItems) return;
                              setEditingItem({
                                ...editingItem,
                                description: e.target.value,
                              });
                              setPageDirty(true);
                            }}
                            disabled={!canEditItems}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                              Price
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all duration-150 motion-reduce:transition-none text-sm"
                              placeholder="0.00"
                              value={editingItem.price ?? ""}
                              onChange={(e) => {
                                if (!canEditItems) return;
                                const raw = e.target.value;
                                const nextPrice =
                                  raw === "" ? undefined : parseFloat(raw);
                                setEditingItem({
                                  ...editingItem,
                                  price: nextPrice,
                                });
                                setPageDirty(true);
                              }}
                              disabled={!canEditItems}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                              Status
                            </label>
                            <button
                              onClick={() => {
                                setEditingItem({
                                  ...editingItem,
                                  is_sold_out: !editingItem.is_sold_out,
                                });
                                setPageDirty(true);
                                toast({
                                  variant: "success",
                                  title: editingItem.is_sold_out
                                    ? "Marked available"
                                    : "Marked sold out",
                                });
                              }}
                              disabled={!canManageAvailability && !canEditItems}
                              className={`w-full px-4 py-3 rounded-2xl border font-semibold text-sm transition-colors duration-150 motion-reduce:transition-none inline-flex items-center justify-between ${editingItem.is_sold_out ? "bg-[var(--cms-panel)] border-[var(--cms-border)] text-[var(--cms-muted)]" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-text)]"} hover:bg-[var(--cms-pill)]`}
                            >
                              <span>
                                {editingItem.is_sold_out ? "Sold out" : "Available"}
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full ${editingItem.is_sold_out ? "bg-rose-400/70" : "bg-emerald-400"}`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </details>

                    <details
                      open
                      className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]"
                    >
                      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                        <div>
                          <div className="text-sm font-semibold text-[var(--cms-text)]">
                            Photo
                          </div>
                          <div className="text-xs text-[var(--cms-muted)]">
                            {editingItemDisplayPhotoUrl
                              ? "Current photo set"
                              : "No photo uploaded yet"}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <div className="px-4 pb-4 space-y-2">
                        <div
                          role="button"
                          tabIndex={
                            editingItemDisplayPhotoUrl || canEditItems ? 0 : -1
                          }
                          aria-disabled={
                            !editingItemDisplayPhotoUrl && !canEditItems
                          }
                          aria-label={
                            editingItemDisplayPhotoUrl
                              ? "View photo"
                              : "Upload a photo"
                          }
                          onKeyDown={(e) => {
                            const target = e.target as HTMLElement | null;
                            if (target?.closest?.("button")) return;
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            if (editingItemDisplayPhotoUrl) {
                              setIsPhotoPreviewOpen(true);
                            } else {
                              if (!canEditItems) return;
                              fileInputRef.current?.click();
                            }
                          }}
                          onClick={(e) => {
                            const target = e.target as HTMLElement | null;
                            if (target?.closest?.("button")) return;
                            if (editingItemDisplayPhotoUrl) {
                              setIsPhotoPreviewOpen(true);
                            } else {
                              if (!canEditItems) return;
                              fileInputRef.current?.click();
                            }
                          }}
                          onDragOver={(e) => {
                            if (!canEditItems) return;
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            if (!canEditItems) return;
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (!file) return;
                            if (!file.type.startsWith("image/")) return;
                            setFileToUpload(file);
                            setPageDirty(true);
                          }}
                          className={`group/photo relative overflow-hidden rounded-2xl border ${editingItemDisplayPhotoUrl ? "border-solid" : "border-dashed"} bg-[var(--cms-panel-strong)] ring-1 ring-transparent transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25 ${canEditItems
                              ? "cursor-pointer border-[var(--cms-border)] hover:border-[var(--cms-text)]"
                              : "cursor-not-allowed opacity-70 border-[var(--cms-border)]"
                            }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onClick={(e) => {
                              e.stopPropagation();
                              (e.currentTarget as HTMLInputElement).value = "";
                            }}
                            onChange={(e) => {
                              if (!canEditItems) return;
                              if (!e.target.files?.[0]) return;
                              setFileToUpload(e.target.files[0]);
                              setPageDirty(true);
                            }}
                            disabled={!canEditItems}
                          />

                          {!editingItemDisplayPhotoUrl ? (
                            <div className="min-h-[170px] px-6 py-10 flex flex-col items-center justify-center text-center">
                              <div className="w-12 h-12 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center ring-1 ring-[var(--cms-border)] shadow-sm">
                                <ImageIcon className="w-6 h-6 text-[var(--cms-muted)] group-hover/photo:text-[var(--cms-text)] transition-colors duration-150 motion-reduce:transition-none" />
                              </div>
                              <div className="mt-4 text-sm font-semibold text-[var(--cms-text)]">
                                Upload a photo
                              </div>
                              <div className="mt-1 text-xs text-[var(--cms-muted)]">
                                Click to choose or drag and drop • PNG/JPG • up to
                                10MB
                              </div>
                            </div>
                          ) : (
                            <div className="relative min-h-[172px]">
                              <img
                                src={editingItemDisplayPhotoUrl}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/10 pointer-events-none" />
                              <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90 ring-1 ring-white/20">
                                {fileToUpload
                                  ? "New photo selected"
                                  : "Current photo"}
                              </div>
                              <div
                                className="absolute inset-x-3 bottom-3 z-20 pointer-events-auto flex items-center justify-end gap-2 opacity-0 transition-opacity duration-150 group-hover/photo:opacity-100 group-focus-within/photo:opacity-100 motion-reduce:transition-none"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!canEditItems) return;
                                    setIsPhotoPreviewOpen(false);
                                    fileInputRef.current?.click();
                                  }}
                                  disabled={!canEditItems}
                                  className="rounded-full border border-transparent bg-white/85 px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-sm hover:bg-white transition-colors duration-150 motion-reduce:transition-none disabled:opacity-60"
                                >
                                  Change photo
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRemoveItemPhoto();
                                  }}
                                  disabled={!canEditItems || isRemovingItemPhoto}
                                  className="rounded-full border border-white/25 bg-black/35 px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-black/55 transition-colors duration-150 motion-reduce:transition-none disabled:opacity-60"
                                >
                                  {fileToUpload
                                    ? "Clear"
                                    : isRemovingItemPhoto
                                      ? "Removing…"
                                      : "Remove"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {fileToUpload && (
                          <div className="text-xs text-[var(--cms-muted)] truncate">
                            Selected: {fileToUpload.name}
                          </div>
                        )}
                        {isPhotoPreviewOpen &&
                          editingItemDisplayPhotoUrl &&
                          renderInModalPortal(
                            <div
                              className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                              role="dialog"
                              aria-modal="true"
                              onClick={() => setIsPhotoPreviewOpen(false)}
                            >
                              <div
                                className="relative w-full max-w-4xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="absolute -top-3 -right-3 w-10 h-10 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] text-[var(--cms-text)] flex items-center justify-center shadow-lg hover:bg-[var(--cms-panel-strong)] transition-colors duration-150 motion-reduce:transition-none"
                                  onClick={() => setIsPhotoPreviewOpen(false)}
                                  aria-label="Close"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                                <img
                                  src={editingItemDisplayPhotoUrl}
                                  alt=""
                                  className="w-full max-h-[80vh] object-contain rounded-2xl bg-black/20 ring-1 ring-white/10"
                                />
                              </div>
                            </div>,
                          )}
                      </div>
                    </details>

                    <details className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]">
                      <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                        <div>
                          <div className="text-sm font-semibold text-[var(--cms-text)]">
                            AR Model
                          </div>
                          <div className="text-xs text-[var(--cms-muted)]">
                            {arStatusSummary}
                          </div>
                        </div>
                        <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                      </summary>
                      <div className="px-4 pb-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-semibold text-[var(--cms-text)]">
                              KIRI video workflow
                            </div>
                            <div className="text-xs text-[var(--cms-muted)]">
                              Upload one turntable video, then generate the AR model.
                            </div>
                          </div>
                          <div
                            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${arStatusPillClassName}`}
                          >
                            {arStatusLabel}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-3.5 space-y-3">
                          <div className="rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                              Video guidance
                            </div>
                            <ul className="mt-2 space-y-1 pl-4 list-disc text-xs text-[var(--cms-muted)]">
                              <li>Use one turntable video under 20 seconds.</li>
                              <li>Keep the dish centered and fully in frame.</li>
                              <li>Original phone resolution is fine. Menuvium extracts high-quality frames before sending to KIRI.</li>
                              <li>Avoid motion blur, sudden exposure changes, and hands entering the shot.</li>
                            </ul>
                          </div>
                          <div className="text-xs text-[var(--cms-muted)]">
                            Uploaded video: {videoCaptureCount > 0 ? "1 saved" : "none yet"}
                          </div>
                        </div>

                        {(editingItemArStatus === "pending" ||
                          editingItemArStatus === "processing") && (
                          <div className="space-y-2">
                            <div className="text-xs text-[var(--cms-muted)]">
                              {editingItemArStage
                                ? `Stage: ${editingItemArStage}`
                                : "Stage: processing"}
                              {editingItemArProgressPercent !== null
                                ? ` • ${editingItemArProgressPercent}%`
                                : ""}
                            </div>
                            {editingItemArStageDetail && (
                              <div className="text-xs text-[var(--cms-muted)]">
                                {editingItemArStageDetail}
                              </div>
                            )}
                            {editingItemArProgressPercent !== null && (
                              <div className="h-2 rounded-full bg-[var(--cms-border)] overflow-hidden">
                                <div
                                  className="h-full bg-[var(--cms-text)]"
                                  style={{
                                    width: `${editingItemArProgressPercent}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {editingItem.ar_error_message && (
                          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                            {editingItem.ar_error_message}
                          </div>
                        )}

                        {(arPreviewImageUrl || arPreviewVideoUrl) && (
                          <div className="rounded-2xl overflow-hidden border border-[var(--cms-border)] bg-[var(--cms-panel-strong)]">
                            {arPreviewVideoUrl ? (
                              <video
                                src={arPreviewVideoUrl}
                                className="w-full max-h-56 object-cover"
                                muted
                                playsInline
                                controls
                              />
                            ) : (
                              <img
                                src={arPreviewImageUrl || ""}
                                alt=""
                                className="w-full max-h-56 object-cover"
                              />
                            )}
                          </div>
                        )}

                        <input
                          ref={arVideoInputRef}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onClick={(e) => {
                            (e.currentTarget as HTMLInputElement).value = "";
                          }}
                          onChange={(e) => {
                            if (!canEditItems) return;
                            const file = e.target.files?.[0];
                            setArVideoToUpload(file || null);
                            setPageDirty(true);
                          }}
                          disabled={!canEditItems}
                        />

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => arVideoInputRef.current?.click()}
                            disabled={!canEditItems}
                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-sm font-semibold text-[var(--cms-text)] transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--cms-pill)] disabled:opacity-60"
                          >
                            <Video className="h-4 w-4" />
                            Choose video
                          </button>
                          <button
                            type="button"
                            onClick={handleUploadArCaptures}
                            disabled={
                              !canEditItems ||
                              !editingItem.id ||
                              !hasLocalArCaptureSelection ||
                              isUploadingArVideo ||
                              editingItemArStatus === "pending" ||
                              editingItemArStatus === "processing"
                            }
                            className="h-11 w-full rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-4 text-sm font-semibold text-[var(--cms-text)] transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--cms-pill)] disabled:opacity-60"
                          >
                            {isUploadingArVideo ? "Uploading…" : "Upload video"}
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateArModel}
                            disabled={
                              !canEditItems ||
                              !editingItem.id ||
                              !hasArCaptures ||
                              isUploadingArVideo ||
                              isRetryingArGeneration ||
                              isCancelingArGeneration ||
                              editingItemArStatus === "pending" ||
                              editingItemArStatus === "processing"
                            }
                            className="h-11 w-full sm:col-span-2 rounded-2xl bg-[var(--cms-accent)] hover:bg-[var(--cms-accent-strong)] px-4 text-sm font-semibold text-white transition-all duration-150 motion-reduce:transition-none disabled:opacity-60"
                          >
                            {isUploadingArVideo ? "Working…" : "Generate AR model"}
                          </button>
                          {canRetryFromExistingVideo && (
                            <button
                              type="button"
                              onClick={handleRetryArGeneration}
                              disabled={
                                !canEditItems ||
                                !editingItem.id ||
                                isRetryingArGeneration ||
                                isUploadingArVideo ||
                                isCancelingArGeneration ||
                                isDeletingArModel
                              }
                              className="h-11 w-full sm:col-span-2 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-sm font-semibold text-[var(--cms-text)] transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--cms-pill)] disabled:opacity-60"
                            >
                              {isRetryingArGeneration
                                ? "Retrying…"
                                : editingItemArStatus === "ready"
                                  ? "Regenerate"
                                  : "Retry"}
                            </button>
                          )}
                          {(editingItemArStatus === "pending" ||
                            editingItemArStatus === "processing") && (
                            <button
                              type="button"
                              onClick={handleCancelArGeneration}
                              disabled={
                                !canEditItems ||
                                !editingItem.id ||
                                isUploadingArVideo ||
                                isRetryingArGeneration ||
                                isCancelingArGeneration ||
                                isDeletingArModel
                              }
                              className="h-11 w-full sm:col-span-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition-colors duration-150 motion-reduce:transition-none hover:bg-red-500/20 disabled:opacity-60"
                            >
                              {isCancelingArGeneration
                                ? "Canceling…"
                                : "Cancel processing"}
                            </button>
                          )}
                          {hasGeneratedArModel &&
                            editingItemArStatus !== "pending" &&
                            editingItemArStatus !== "processing" && (
                              <button
                                type="button"
                                onClick={handleDeleteArModel}
                                disabled={
                                  !canEditItems ||
                                  !editingItem.id ||
                                  isUploadingArVideo ||
                                  isRetryingArGeneration ||
                                  isCancelingArGeneration ||
                                  isDeletingArModel
                                }
                                className="h-11 w-full sm:col-span-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-semibold text-red-300 transition-colors duration-150 motion-reduce:transition-none hover:bg-red-500/20 disabled:opacity-60"
                              >
                                {isDeletingArModel ? "Deleting…" : "Delete AR model"}
                              </button>
                            )}
                        </div>

                        {arVideoToUpload && (
                          <div className="rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 py-3 space-y-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                              Pending upload
                            </div>
                            {arVideoToUpload && (
                              <div className="text-xs text-[var(--cms-muted)] truncate">
                                Video: {arVideoToUpload.name}
                              </div>
                            )}
                          </div>
                        )}

                        {arVideoError && (
                          <div className="text-xs text-red-300">{arVideoError}</div>
                        )}

                        {!editingItem.id && (
                          <div className="text-xs text-[var(--cms-muted)]">
                            Save the item first to enable AR processing.
                          </div>
                        )}
                      </div>
                    </details>

                    {canEditItems && (
                      <details
                        open
                        className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]"
                      >
                        <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                          <div>
                            <div className="text-sm font-semibold text-[var(--cms-text)]">
                              Options
                            </div>
                            <div className="text-xs text-[var(--cms-muted)]">
                              View-only options displayed under this item.
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <div className="px-4 pb-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-[var(--cms-muted)]">
                              No ordering logic. These are shown as informational choices only.
                            </p>
                            <button
                              type="button"
                              onClick={addDisplayOption}
                              className="h-8 shrink-0 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-xs font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)]"
                            >
                              Add option
                            </button>
                          </div>

                          {editingDisplayOptionsDraft.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 py-6 text-center text-xs text-[var(--cms-muted)]">
                              No options yet.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {editingDisplayOptionsDraft.map((option, optionIndex) => (
                                <div
                                  key={option.id || `option-${optionIndex}`}
                                  className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-3.5 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cms-muted)]">
                                      Option {optionIndex + 1}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => removeDisplayOption(optionIndex)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 transition-colors hover:bg-red-500/10"
                                      aria-label="Remove option"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5 sm:col-span-2">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                                        Name
                                      </label>
                                      <input
                                        type="text"
                                        value={option.name}
                                        onChange={(e) =>
                                          updateDisplayOptionField(
                                            optionIndex,
                                            "name",
                                            e.target.value,
                                          )}
                                        placeholder="e.g. Chicken"
                                        className="h-10 w-full rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                                        Description
                                      </label>
                                      <input
                                        type="text"
                                        value={option.description || ""}
                                        onChange={(e) =>
                                          updateDisplayOptionField(
                                            optionIndex,
                                            "description",
                                            e.target.value || null,
                                          )}
                                        placeholder="Optional helper text"
                                        className="h-10 w-full rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                                        Badge
                                      </label>
                                      <input
                                        type="text"
                                        value={option.badge || ""}
                                        onChange={(e) =>
                                          updateDisplayOptionField(
                                            optionIndex,
                                            "badge",
                                            e.target.value || null,
                                          )}
                                        placeholder="e.g. Popular"
                                        className="h-10 w-full rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                                        Image URL
                                      </label>
                                      <input
                                        type="text"
                                        value={option.image_url || ""}
                                        onChange={(e) =>
                                          updateDisplayOptionField(
                                            optionIndex,
                                            "image_url",
                                            e.target.value || null,
                                          )}
                                        placeholder="https://..."
                                        className="h-10 w-full rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3">
                                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--cms-text)]">
                                      <input
                                        type="checkbox"
                                        checked={option.is_active !== false}
                                        onChange={(e) =>
                                          updateDisplayOptionField(
                                            optionIndex,
                                            "is_active",
                                            e.target.checked,
                                          )}
                                        className="h-4 w-4 rounded border-[var(--cms-border)] bg-[var(--cms-panel-strong)]"
                                      />
                                      Active
                                    </label>
                                  </div>

                                  <div className="rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--cms-muted)]">
                                        Option visibility
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addDisplayOptionVisibilityRule(optionIndex)}
                                        className="h-7 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-2.5 text-[11px] font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)]"
                                      >
                                        Add rule
                                      </button>
                                    </div>

                                    {(option.visibility_rules || []).length === 0 ? (
                                      <p className="text-[11px] text-[var(--cms-muted)]">
                                        Always visible.
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {(option.visibility_rules || []).map(
                                          (rule, ruleIndex) => (
                                            <div
                                              key={rule.id || `opt-rule-${optionIndex}-${ruleIndex}`}
                                              className="rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-2.5 space-y-2"
                                            >
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                  <select
                                                    value={rule.kind}
                                                    onChange={(e) =>
                                                      updateDisplayOptionVisibilityRuleField(
                                                        optionIndex,
                                                        ruleIndex,
                                                        "kind",
                                                        e.target.value === "exclude"
                                                          ? "exclude"
                                                          : "include",
                                                      )}
                                                    className="h-8 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                                  >
                                                    <option value="include">
                                                      Include
                                                    </option>
                                                    <option value="exclude">
                                                      Exclude
                                                    </option>
                                                  </select>
                                                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--cms-muted)]">
                                                    <input
                                                      type="checkbox"
                                                      checked={rule.is_active !== false}
                                                      onChange={(e) =>
                                                        updateDisplayOptionVisibilityRuleField(
                                                          optionIndex,
                                                          ruleIndex,
                                                          "is_active",
                                                          e.target.checked,
                                                        )}
                                                      className="h-3.5 w-3.5 rounded border-[var(--cms-border)]"
                                                    />
                                                    Active
                                                  </label>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    removeDisplayOptionVisibilityRule(
                                                      optionIndex,
                                                      ruleIndex,
                                                    )}
                                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 transition-colors hover:bg-red-500/10"
                                                  aria-label="Remove visibility rule"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2">
                                                <input
                                                  type="time"
                                                  value={rule.start_time_local}
                                                  onChange={(e) =>
                                                    updateDisplayOptionVisibilityRuleField(
                                                      optionIndex,
                                                      ruleIndex,
                                                      "start_time_local",
                                                      e.target.value,
                                                    )}
                                                  className="h-8 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                                />
                                                <input
                                                  type="time"
                                                  value={rule.end_time_local}
                                                  onChange={(e) =>
                                                    updateDisplayOptionVisibilityRuleField(
                                                      optionIndex,
                                                      ruleIndex,
                                                      "end_time_local",
                                                      e.target.value,
                                                    )}
                                                  className="h-8 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                                />
                                                <input
                                                  type="date"
                                                  value={rule.start_date || ""}
                                                  onChange={(e) =>
                                                    updateDisplayOptionVisibilityRuleField(
                                                      optionIndex,
                                                      ruleIndex,
                                                      "start_date",
                                                      e.target.value || null,
                                                    )}
                                                  className="h-8 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                                />
                                                <input
                                                  type="date"
                                                  value={rule.end_date || ""}
                                                  onChange={(e) =>
                                                    updateDisplayOptionVisibilityRuleField(
                                                      optionIndex,
                                                      ruleIndex,
                                                      "end_date",
                                                      e.target.value || null,
                                                    )}
                                                  className="h-8 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                                />
                                              </div>
                                              <div className="flex flex-wrap gap-1.5">
                                                {WEEKDAY_OPTIONS.map((day) => {
                                                  const selected = (
                                                    rule.days_of_week || []
                                                  ).includes(day.value);
                                                  return (
                                                    <button
                                                      key={`opt-rule-day-${optionIndex}-${ruleIndex}-${day.value}`}
                                                      type="button"
                                                      onClick={() =>
                                                        toggleDisplayOptionVisibilityRuleDay(
                                                          optionIndex,
                                                          ruleIndex,
                                                          day.value,
                                                        )}
                                                      className={`h-6 min-w-[2rem] rounded-md border px-2 text-[10px] font-semibold transition-colors ${selected
                                                        ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]"
                                                        : "bg-[var(--cms-panel)] text-[var(--cms-muted)] border-[var(--cms-border)] hover:text-[var(--cms-text)]"}`}
                                                    >
                                                      {day.label}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {canEditItems && (
                      <details className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]">
                        <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                          <div>
                            <div className="text-sm font-semibold text-[var(--cms-text)]">
                              Visibility
                            </div>
                            <div className="text-xs text-[var(--cms-muted)]">
                              Add include/exclude windows for this item.
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <div className="px-4 pb-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-[var(--cms-muted)]">
                              Rules use the menu timezone set on this page.
                            </p>
                            <button
                              type="button"
                              onClick={addItemVisibilityRule}
                              className="h-8 shrink-0 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-xs font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)]"
                            >
                              Add rule
                            </button>
                          </div>

                          {editingItemVisibilityRulesDraft.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 py-5 text-center text-xs text-[var(--cms-muted)]">
                              Always visible unless sold out.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {editingItemVisibilityRulesDraft.map((rule, ruleIndex) => (
                                <div
                                  key={rule.id || `item-visibility-rule-${ruleIndex}`}
                                  className="rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={rule.kind}
                                        onChange={(e) =>
                                          updateItemVisibilityRuleField(
                                            ruleIndex,
                                            "kind",
                                            e.target.value === "exclude"
                                              ? "exclude"
                                              : "include",
                                          )}
                                        className="h-9 rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2.5 text-xs font-semibold focus:outline-none focus:border-[var(--cms-text)]"
                                      >
                                        <option value="include">
                                          Include window
                                        </option>
                                        <option value="exclude">
                                          Exclude window
                                        </option>
                                      </select>
                                      <label className="inline-flex items-center gap-1.5 text-xs text-[var(--cms-muted)]">
                                        <input
                                          type="checkbox"
                                          checked={rule.is_active !== false}
                                          onChange={(e) =>
                                            updateItemVisibilityRuleField(
                                              ruleIndex,
                                              "is_active",
                                              e.target.checked,
                                            )}
                                          className="h-3.5 w-3.5 rounded border-[var(--cms-border)]"
                                        />
                                        Active
                                      </label>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeItemVisibilityRule(ruleIndex)}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 transition-colors hover:bg-red-500/10"
                                      aria-label="Remove item visibility rule"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cms-muted)]">
                                        Start time
                                      </label>
                                      <input
                                        type="time"
                                        value={rule.start_time_local}
                                        onChange={(e) =>
                                          updateItemVisibilityRuleField(
                                            ruleIndex,
                                            "start_time_local",
                                            e.target.value,
                                          )}
                                        className="h-9 w-full rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2.5 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cms-muted)]">
                                        End time
                                      </label>
                                      <input
                                        type="time"
                                        value={rule.end_time_local}
                                        onChange={(e) =>
                                          updateItemVisibilityRuleField(
                                            ruleIndex,
                                            "end_time_local",
                                            e.target.value,
                                          )}
                                        className="h-9 w-full rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2.5 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cms-muted)]">
                                        Start date
                                      </label>
                                      <input
                                        type="date"
                                        value={rule.start_date || ""}
                                        onChange={(e) =>
                                          updateItemVisibilityRuleField(
                                            ruleIndex,
                                            "start_date",
                                            e.target.value || null,
                                          )}
                                        className="h-9 w-full rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2.5 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cms-muted)]">
                                        End date
                                      </label>
                                      <input
                                        type="date"
                                        value={rule.end_date || ""}
                                        onChange={(e) =>
                                          updateItemVisibilityRuleField(
                                            ruleIndex,
                                            "end_date",
                                            e.target.value || null,
                                          )}
                                        className="h-9 w-full rounded-lg border border-[var(--cms-border)] bg-[var(--cms-panel)] px-2.5 text-xs focus:outline-none focus:border-[var(--cms-text)]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-1.5">
                                    {WEEKDAY_OPTIONS.map((day) => {
                                      const selected = (
                                        rule.days_of_week || []
                                      ).includes(day.value);
                                      return (
                                        <button
                                          key={`item-rule-day-${ruleIndex}-${day.value}`}
                                          type="button"
                                          onClick={() =>
                                            toggleItemVisibilityRuleDay(
                                              ruleIndex,
                                              day.value,
                                            )}
                                          className={`h-7 min-w-[2.1rem] rounded-md border px-2 text-[10px] font-semibold transition-colors ${selected
                                            ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]"
                                            : "bg-[var(--cms-panel)] text-[var(--cms-muted)] border-[var(--cms-border)] hover:text-[var(--cms-text)]"}`}
                                        >
                                          {day.label}
                                        </button>
                                      );
                                    })}
                                  </div>

                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {canEditItems && (
                      <details className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)]">
                        <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                          <div>
                            <div className="text-sm font-semibold text-[var(--cms-text)]">
                              Tags & Allergens
                            </div>
                            <div className="text-xs text-[var(--cms-muted)]">
                              Diet, spice, highlights, and allergen labels
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-[var(--cms-muted)] transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                        </summary>
                        <div className="px-4 pb-4 space-y-4">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">
                              {tagLabels.diet}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {dietTagList.map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleMetadata("tags", tag.id)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 motion-reduce:transition-none ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">
                              {tagLabels.spice}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {spiceTagList.map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleMetadata("tags", tag.id)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 motion-reduce:transition-none ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">
                              {tagLabels.highlights}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {highlightTagList.map((tag) => (
                                <button
                                  key={tag.id}
                                  onClick={() => toggleMetadata("tags", tag.id)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 motion-reduce:transition-none ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">
                              {tagLabels.allergens}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {allergenTagList.map((alg) => (
                                <button
                                  key={alg.id}
                                  onClick={() =>
                                    toggleMetadata("allergens", alg.id)
                                  }
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 motion-reduce:transition-none ${(editingItem as any).allergen_ids?.includes(alg.id) ? "bg-red-500/10 border-red-500/40 text-red-500 shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                >
                                  {alg.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="cms-modal-footer sticky bottom-0 z-10 p-4 sm:p-5 border-t border-[var(--cms-border)] flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center flex-shrink-0 rounded-b-2xl backdrop-blur-xl">
                    <div>
                      {canEditItems && editingItem.id && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Delete item?",
                              description: "This will permanently delete the item.",
                              confirmLabel: "Delete",
                              variant: "destructive",
                            });
                            if (!ok) return;
                            try {
                              const token = await getAuthToken();
                              const res = await fetch(
                                `${apiBase}/items/${editingItem.id}`,
                                {
                                  method: "DELETE",
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              if (res.ok) {
                                setEditingItem(null);
                                setPageDirty(true);
                                if (menu) fetchMenu(menu.id);
                                toast({
                                  variant: "success",
                                  title: "Item deleted",
                                });
                                return;
                              }
                              toast({
                                variant: "error",
                                title: "Failed to delete item",
                              });
                            } catch (e) {
                              console.error(e);
                              toast({
                                variant: "error",
                                title: "Failed to delete item",
                                description: "Please try again in a moment.",
                              });
                            }
                          }}
                          className="h-11 px-4 rounded-2xl border border-red-500/25 font-semibold text-red-500 hover:bg-red-500/10 transition-colors duration-150 motion-reduce:transition-none inline-flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setEditingItem(null);
                          setFileToUpload(null);
                        }}
                        className="h-11 px-5 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] font-semibold text-[var(--cms-text)] hover:bg-[var(--cms-pill)] transition-colors duration-150 motion-reduce:transition-none"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveItem}
                        disabled={
                          isSavingItem ||
                          (canEditItems
                            ? !editingItem.name ||
                            (!editingItem.price && editingItem.price !== 0)
                            : !editingItem.id || !canManageAvailability)
                        }
                        className="h-11 px-5 bg-[var(--cms-accent)] hover:bg-[var(--cms-accent-strong)] text-white rounded-2xl font-semibold transition-all duration-150 motion-reduce:transition-none disabled:opacity-50 inline-flex items-center gap-2"
                      >
                        {isSavingItem && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {isSavingItem ? "Saving..." : "Save Item"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
          )}
      </div>
    </div>
  );
}
