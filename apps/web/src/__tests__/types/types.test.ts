import type { Menu, Category, Item, DietaryTag } from "@/types";
import { createMockItem, createMockCategory, createMockMenu, createMockDietaryTag } from "../utils/testUtils";

describe("Type Definitions", () => {
    describe("Item", () => {
        it("should create a valid Item with required fields", () => {
            const item: Item = {
                id: "item-1",
                name: "Burger",
                price: 12.99,
                is_sold_out: false
            };

            expect(item.id).toBe("item-1");
            expect(item.name).toBe("Burger");
            expect(item.price).toBe(12.99);
            expect(item.is_sold_out).toBe(false);
        });

        it("should allow optional fields", () => {
            const item: Item = {
                id: "item-1",
                name: "Burger",
                description: "A juicy burger",
                price: 12.99,
                is_sold_out: false,
                position: 0,
                photo_url: "https://example.com/burger.jpg",
                photos: [{ url: "https://example.com/burger.jpg", s3_key: "items/burger.jpg" }],
                dietary_tags: [{ id: "vegan", name: "Vegan", icon: "🌱" }],
                allergens: [{ id: "gluten", name: "Gluten" }]
            };

            expect(item.description).toBe("A juicy burger");
            expect(item.photos).toHaveLength(1);
            expect(item.dietary_tags).toHaveLength(1);
        });
    });

    describe("Category", () => {
        it("should create a valid Category with items", () => {
            const category: Category = {
                id: "cat-1",
                name: "Appetizers",
                items: [createMockItem()]
            };

            expect(category.id).toBe("cat-1");
            expect(category.name).toBe("Appetizers");
            expect(category.items).toHaveLength(1);
        });

        it("should allow optional rank field", () => {
            const category: Category = {
                id: "cat-1",
                name: "Appetizers",
                rank: 5,
                items: []
            };

            expect(category.rank).toBe(5);
        });
    });

    describe("Menu", () => {
        it("should create a valid Menu with categories", () => {
            const menu: Menu = {
                id: "menu-1",
                name: "Lunch Menu",
                slug: "menu-uuid-123",
                categories: [createMockCategory()]
            };

            expect(menu.id).toBe("menu-1");
            expect(menu.name).toBe("Lunch Menu");
            expect(menu.categories).toHaveLength(1);
        });

        it("should allow optional theme and banner", () => {
            const menu: Menu = {
                id: "menu-1",
                name: "Lunch Menu",
                slug: "menu-uuid-123",
                theme: "noir",
                banner_url: "https://example.com/banner.jpg",
                is_active: true,
                categories: []
            };

            expect(menu.theme).toBe("noir");
            expect(menu.banner_url).toBe("https://example.com/banner.jpg");
            expect(menu.is_active).toBe(true);
        });
    });

    describe("Mock Factories", () => {
        it("should create mock item with defaults", () => {
            const item = createMockItem();
            expect(item.id).toBe("item-1");
            expect(item.name).toBe("Test Item");
        });

        it("should allow overrides for mock item", () => {
            const item = createMockItem({ name: "Custom Item", price: 25 });
            expect(item.name).toBe("Custom Item");
            expect(item.price).toBe(25);
        });

        it("should create mock menu with defaults", () => {
            const menu = createMockMenu();
            expect(menu.id).toBe("menu-1");
            expect(menu.categories).toHaveLength(1);
        });

        it("should create mock dietary tag", () => {
            const tag = createMockDietaryTag({ name: "Gluten-Free" });
            expect(tag.name).toBe("Gluten-Free");
            expect(tag.id).toBe("tag-1");
        });
    });
});
