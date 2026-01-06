"use client";

import { useState, useEffect, useCallback } from "react";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import { fetchOrgPermissions, type OrgPermissions } from "@/lib/orgPermissions";
import type { Menu, Category, Item, DietaryTag, Allergen, ItemFormData } from "@/types";

interface UseMenuEditorOptions {
    menuId: string;
}

interface UseMenuEditorReturn {
    // State
    menu: Menu | null;
    loading: boolean;
    dietaryTags: DietaryTag[];
    allergens: Allergen[];
    orgPermissions: OrgPermissions | null;
    pageDirty: boolean;

    // Menu mutations
    updateMenuName: (name: string) => Promise<boolean>;
    updateMenuActive: (isActive: boolean) => Promise<boolean>;
    deleteMenu: () => Promise<boolean>;

    // Category mutations
    addCategory: (name: string) => Promise<boolean>;
    updateCategoryName: (categoryId: string, name: string, rank: number) => Promise<boolean>;
    deleteCategory: (categoryId: string) => Promise<boolean>;
    reorderCategories: (categories: Category[]) => Promise<void>;

    // Item mutations
    saveItem: (item: ItemFormData, file?: File | null) => Promise<boolean>;
    deleteItemPhoto: (itemId: string) => Promise<boolean>;
    reorderItems: (categoryId: string, items: Item[]) => Promise<void>;

    // Utilities
    refetch: () => Promise<void>;
    setPageDirty: (dirty: boolean) => void;
}

export function useMenuEditor({ menuId }: UseMenuEditorOptions): UseMenuEditorReturn {
    const apiBase = getApiBase();
    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
    const [allergens, setAllergens] = useState<Allergen[]>([]);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);
    const [pageDirty, setPageDirty] = useState(false);

    // Fetch metadata (dietary tags and allergens)
    const fetchMetadata = useCallback(async () => {
        try {
            const [tagsRes, allergensRes] = await Promise.all([
                fetch(`${apiBase}/metadata/dietary-tags`),
                fetch(`${apiBase}/metadata/allergens`)
            ]);
            if (tagsRes.ok) setDietaryTags(await tagsRes.json());
            if (allergensRes.ok) setAllergens(await allergensRes.json());
        } catch (e) {
            console.error("Failed to fetch metadata", e);
        }
    }, [apiBase]);

    // Fetch menu with categories and items
    const fetchMenu = useCallback(async () => {
        if (!menuId) return;
        setLoading(true);
        try {
            const token = await getAuthToken();

            // Fetch menu details
            const menuRes = await fetch(`${apiBase}/menus/${menuId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!menuRes.ok) throw new Error("Failed to fetch menu");
            const menuData = await menuRes.json();

            // Fetch permissions
            try {
                const perms = await fetchOrgPermissions({ apiBase, token, orgId: menuData.org_id });
                setOrgPermissions(perms);
            } catch {
                setOrgPermissions(null);
            }

            // Fetch categories
            const catRes = await fetch(`${apiBase}/categories/${menuId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const categories = await catRes.json();

            // Ensure items array exists on each category
            const categoriesWithItems = categories.map((c: Category) => ({
                ...c,
                items: c.items || []
            }));

            setMenu({ ...menuData, categories: categoriesWithItems });
        } catch (e) {
            console.error("Failed to fetch menu", e);
        } finally {
            setLoading(false);
        }
    }, [menuId, apiBase]);

    // Initial fetch
    useEffect(() => {
        fetchMenu();
        fetchMetadata();
    }, [fetchMenu, fetchMetadata]);

    // Menu mutations
    const updateMenuName = useCallback(async (name: string): Promise<boolean> => {
        if (!menu || !name.trim()) return false;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: name.trim() })
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }, [menu, apiBase, fetchMenu]);

    const updateMenuActive = useCallback(async (isActive: boolean): Promise<boolean> => {
        if (!menu) return false;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ is_active: isActive })
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }, [menu, apiBase, fetchMenu]);

    const deleteMenu = useCallback(async (): Promise<boolean> => {
        if (!menu) return false;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.ok;
        } catch (e) {
            console.error(e);
            return false;
        }
    }, [menu, apiBase]);

    // Category mutations
    const addCategory = useCallback(async (name: string): Promise<boolean> => {
        if (!menu || !name.trim()) return false;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/categories/`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name: name.trim(),
                    menu_id: menu.id,
                    rank: menu.categories.length
                })
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }, [menu, apiBase, fetchMenu]);

    const updateCategoryName = useCallback(async (
        categoryId: string,
        name: string,
        rank: number
    ): Promise<boolean> => {
        if (!menu || !name.trim()) return false;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/categories/${categoryId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id: categoryId, name: name.trim(), rank, menu_id: menu.id })
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }, [menu, apiBase, fetchMenu]);

    const deleteCategory = useCallback(async (categoryId: string): Promise<boolean> => {
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/categories/${categoryId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error(e);
        }
        return false;
    }, [apiBase, fetchMenu]);

    const reorderCategories = useCallback(async (categories: Category[]): Promise<void> => {
        if (!menu) return;
        // Optimistic update
        setMenu({ ...menu, categories });

        try {
            const token = await getAuthToken();
            await Promise.all(
                categories.map((cat, index) =>
                    fetch(`${apiBase}/categories/${cat.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ id: cat.id, name: cat.name, rank: index, menu_id: menu.id })
                    })
                )
            );
            setPageDirty(true);
        } catch (e) {
            console.error("Failed to reorder categories", e);
            // Refetch to restore correct order
            await fetchMenu();
        }
    }, [menu, apiBase, fetchMenu]);

    // Item mutations
    const uploadFile = async (file: File): Promise<{ s3_key: string; public_url: string }> => {
        const token = await getAuthToken();
        const res = await fetch(`${apiBase}/items/upload-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ filename: file.name, content_type: file.type })
        });
        if (!res.ok) throw new Error("Failed to get upload URL");
        const { upload_url, s3_key, public_url } = await res.json();

        const uploadRes = await fetch(upload_url, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type }
        });
        if (!uploadRes.ok) throw new Error("Failed to upload file");

        return { s3_key, public_url };
    };

    const saveItem = useCallback(async (
        item: ItemFormData,
        file?: File | null
    ): Promise<boolean> => {
        if (!item.name || item.price === undefined) return false;

        try {
            const token = await getAuthToken();

            // Handle file upload if provided
            let photoKey: string | null = null;
            let photoUrl: string | null = null;
            if (file) {
                const uploadData = await uploadFile(file);
                photoKey = uploadData.s3_key;
                photoUrl = uploadData.public_url;
            }

            const payload = {
                name: item.name,
                description: item.description,
                price: item.price,
                is_sold_out: item.is_sold_out || false,
                category_id: item.categoryId,
                dietary_tag_ids: item.dietary_tag_ids || [],
                allergen_ids: item.allergen_ids || []
            };

            let res: Response;
            let itemId: string | undefined;

            if (item.id) {
                // Update existing item
                res = await fetch(`${apiBase}/items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                itemId = item.id;
            } else {
                // Create new item
                res = await fetch(`${apiBase}/items/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const data = await res.json();
                    itemId = data.id;
                }
            }

            // Link photo if uploaded
            if (res.ok && itemId && photoKey && photoUrl) {
                await fetch(`${apiBase}/items/${itemId}/photos`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ s3_key: photoKey, url: photoUrl })
                });
            }

            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error("Failed to save item", e);
        }
        return false;
    }, [apiBase, fetchMenu]);

    const deleteItemPhoto = useCallback(async (itemId: string): Promise<boolean> => {
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/items/${itemId}/photos`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setPageDirty(true);
                await fetchMenu();
                return true;
            }
        } catch (e) {
            console.error("Failed to delete photo", e);
        }
        return false;
    }, [apiBase, fetchMenu]);

    const reorderItems = useCallback(async (categoryId: string, items: Item[]): Promise<void> => {
        if (!menu) return;

        // Optimistic update
        const newCategories = menu.categories.map(cat =>
            cat.id === categoryId ? { ...cat, items } : cat
        );
        setMenu({ ...menu, categories: newCategories });

        try {
            const token = await getAuthToken();
            await Promise.all(
                items.map((item, index) =>
                    fetch(`${apiBase}/items/${item.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ position: index })
                    })
                )
            );
            setPageDirty(true);
        } catch (e) {
            console.error("Failed to reorder items", e);
            await fetchMenu();
        }
    }, [menu, apiBase, fetchMenu]);

    return {
        menu,
        loading,
        dietaryTags,
        allergens,
        orgPermissions,
        pageDirty,
        updateMenuName,
        updateMenuActive,
        deleteMenu,
        addCategory,
        updateCategoryName,
        deleteCategory,
        reorderCategories,
        saveItem,
        deleteItemPhoto,
        reorderItems,
        refetch: fetchMenu,
        setPageDirty
    };
}
