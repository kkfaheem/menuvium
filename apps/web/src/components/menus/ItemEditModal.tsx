"use client";

import { useState, useEffect, useRef } from "react";
import { X, Image as ImageIcon, Loader2, Check, Trash2 } from "lucide-react";
import type { Item, DietaryTag, Allergen, ItemFormData } from "@/types";

interface ItemEditModalProps {
    item: ItemFormData | null;
    categoryId?: string;
    dietaryTags: DietaryTag[];
    allergens: Allergen[];
    tagLabels: { diet: string; spice: string; highlights: string };
    groupedTags: {
        diet: DietaryTag[];
        spice: DietaryTag[];
        highlights: DietaryTag[];
    };
    canEditItems: boolean;
    canManageAvailability: boolean;
    isSaving: boolean;
    isRemovingPhoto: boolean;
    onSave: (item: ItemFormData, file: File | null) => Promise<void>;
    onRemovePhoto: () => Promise<void>;
    onClose: () => void;
}

export function ItemEditModal({
    item,
    categoryId,
    dietaryTags,
    allergens,
    tagLabels,
    groupedTags,
    canEditItems,
    canManageAvailability,
    isSaving,
    isRemovingPhoto,
    onSave,
    onRemovePhoto,
    onClose
}: ItemEditModalProps) {
    const [editingItem, setEditingItem] = useState<ItemFormData>({});
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Initialize form state when item changes
    useEffect(() => {
        if (item) {
            setEditingItem({
                ...item,
                categoryId: item.categoryId || categoryId,
                dietary_tag_ids: item.dietary_tag_ids ||
                    (item.dietary_tags?.map(t => t.id) || []),
                allergen_ids: item.allergen_ids ||
                    (item.allergens?.map(a => a.id) || [])
            });
        } else {
            setEditingItem({});
        }
        setFileToUpload(null);
        setFilePreviewUrl(null);
    }, [item, categoryId]);

    // File preview URL handling
    useEffect(() => {
        if (!fileToUpload) {
            setFilePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(fileToUpload);
        setFilePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [fileToUpload]);

    // Escape key handling for photo preview
    useEffect(() => {
        if (!isPhotoPreviewOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsPhotoPreviewOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isPhotoPreviewOpen]);

    if (!item) return null;

    const existingPhotoUrl = editingItem.photo_url || editingItem.photos?.[0]?.url;
    const displayPhotoUrl = filePreviewUrl || existingPhotoUrl;

    const handleSubmit = async () => {
        await onSave({ ...editingItem, categoryId }, fileToUpload);
    };

    const toggleTag = (type: "tags" | "allergens", id: string) => {
        const key = type === "tags" ? "dietary_tag_ids" : "allergen_ids";
        const current = editingItem[key] || [];
        const updated = current.includes(id)
            ? current.filter(x => x !== id)
            : [...current, id];
        setEditingItem({ ...editingItem, [key]: updated });
    };

    const isEditing = Boolean(editingItem.id);
    const canOnlyToggleAvailability = isEditing && !canEditItems && canManageAvailability;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-[var(--cms-bg)] border border-[var(--cms-border)] shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--cms-border)]">
                    <h2 className="text-xl font-bold">
                        {editingItem.id ? "Edit Item" : "Add Item"}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--cms-panel)]">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Photo Section */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Photo</label>
                        <div className="flex items-center gap-4">
                            {displayPhotoUrl ? (
                                <div className="relative">
                                    <img
                                        src={displayPhotoUrl}
                                        alt="Item preview"
                                        className="w-24 h-24 rounded-xl object-cover cursor-pointer"
                                        onClick={() => setIsPhotoPreviewOpen(true)}
                                    />
                                    {canEditItems && (
                                        <button
                                            onClick={async () => {
                                                if (fileToUpload) {
                                                    setFileToUpload(null);
                                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                                } else {
                                                    await onRemovePhoto();
                                                }
                                            }}
                                            disabled={isRemovingPhoto}
                                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            {isRemovingPhoto ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-3 h-3" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="w-24 h-24 rounded-xl bg-[var(--cms-panel)] flex items-center justify-center">
                                    <ImageIcon className="w-8 h-8 text-[var(--cms-muted)]" />
                                </div>
                            )}
                            {canEditItems && (
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) setFileToUpload(file);
                                        }}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 py-2 rounded-xl border border-[var(--cms-border)] hover:bg-[var(--cms-panel)] text-sm"
                                    >
                                        {displayPhotoUrl ? "Change" : "Upload"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Name</label>
                        <input
                            type="text"
                            value={editingItem.name || ""}
                            onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                            disabled={!canEditItems}
                            className="w-full px-4 py-2.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)] disabled:opacity-50"
                            placeholder="Item name"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Description</label>
                        <textarea
                            value={editingItem.description || ""}
                            onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                            disabled={!canEditItems}
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)] disabled:opacity-50 resize-none"
                            placeholder="Optional description"
                        />
                    </div>

                    {/* Price */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Price</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingItem.price ?? ""}
                            onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                            disabled={!canEditItems}
                            className="w-full px-4 py-2.5 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)] disabled:opacity-50"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Availability Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--cms-panel)]">
                        <span className="text-sm font-medium">Sold Out</span>
                        <button
                            onClick={() => setEditingItem({ ...editingItem, is_sold_out: !editingItem.is_sold_out })}
                            className={`relative w-12 h-6 rounded-full transition-colors ${editingItem.is_sold_out ? "bg-red-500" : "bg-green-500"
                                }`}
                        >
                            <span
                                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${editingItem.is_sold_out ? "left-7" : "left-1"
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Dietary Tags */}
                    {canEditItems && groupedTags.diet.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium mb-2">{tagLabels.diet}</label>
                            <div className="flex flex-wrap gap-2">
                                {groupedTags.diet.map((tag) => {
                                    const selected = editingItem.dietary_tag_ids?.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleTag("tags", tag.id)}
                                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selected
                                                    ? "bg-[var(--cms-text)] text-[var(--cms-bg)] border-transparent"
                                                    : "border-[var(--cms-border)] hover:bg-[var(--cms-panel)]"
                                                }`}
                                        >
                                            {tag.icon && <span className="mr-1">{tag.icon}</span>}
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Spice Tags */}
                    {canEditItems && groupedTags.spice.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium mb-2">{tagLabels.spice}</label>
                            <div className="flex flex-wrap gap-2">
                                {groupedTags.spice.map((tag) => {
                                    const selected = editingItem.dietary_tag_ids?.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleTag("tags", tag.id)}
                                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selected
                                                    ? "bg-[var(--cms-text)] text-[var(--cms-bg)] border-transparent"
                                                    : "border-[var(--cms-border)] hover:bg-[var(--cms-panel)]"
                                                }`}
                                        >
                                            {tag.icon && <span className="mr-1">{tag.icon}</span>}
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Allergens */}
                    {canEditItems && allergens.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Allergens</label>
                            <div className="flex flex-wrap gap-2">
                                {allergens.map((allergen) => {
                                    const selected = editingItem.allergen_ids?.includes(allergen.id);
                                    return (
                                        <button
                                            key={allergen.id}
                                            onClick={() => toggleTag("allergens", allergen.id)}
                                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selected
                                                    ? "bg-orange-500 text-white border-transparent"
                                                    : "border-[var(--cms-border)] hover:bg-[var(--cms-panel)]"
                                                }`}
                                        >
                                            {allergen.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-5 border-t border-[var(--cms-border)]">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--cms-border)] hover:bg-[var(--cms-panel)]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || (!editingItem.name && canEditItems)}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--cms-text)] text-[var(--cms-bg)] font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isSaving ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>

            {/* Photo Preview Modal */}
            {isPhotoPreviewOpen && displayPhotoUrl && (
                <div
                    className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setIsPhotoPreviewOpen(false)}
                >
                    <img
                        src={displayPhotoUrl}
                        alt="Full preview"
                        className="max-w-full max-h-full object-contain rounded-xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
