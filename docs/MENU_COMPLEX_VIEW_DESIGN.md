# Menuvium Design: Complex View-Only Menus (Choice Groups, Visibility Windows, Item Drawer)

## Scope
This design covers three features for **view-only** menus (no cart/checkout):
1. Choice Groups on items (e.g., "Choose base: Chicken / Shrimp / Veg")
2. Time/date visibility for items and options
3. Compact item detail drawer/modal for exploring options

## Current Baseline
- Item/category/menu schema: `services/api/models.py`
- Public menu payload endpoint: `services/api/routers/menus.py` (`GET /menus/public/{menu_id}`)
- Public menu rendering + item modal: `apps/web/src/app/r/[slug]/page.tsx`
- Shared card/list layout component: `apps/web/src/components/public-menu/ThemeLayout.tsx`

## Product Rules (View-Only)
- No add-to-cart and no order submission.
- Choices are for **information architecture and discoverability**.
- Selection inside drawer is local UI state only (not persisted server-side for guests).
- Visibility is server-evaluated in menu timezone to avoid client clock drift.

---

## 1) Choice Groups Data Model

### New Tables
1. `ItemOptionGroup`
- `id: UUID`
- `item_id: UUID (FK item.id)`
- `name: str` (e.g., "Choose your base")
- `description: Optional[str]`
- `selection_mode: str` (`single` | `multiple`)
- `min_select: int` (default `0`)
- `max_select: Optional[int]` (null = unlimited for multiple)
- `display_style: str` (`chips` | `list` | `cards`)
- `position: int`
- `is_active: bool` (default `true`)

2. `ItemOption`
- `id: UUID`
- `group_id: UUID (FK itemoptiongroup.id)`
- `name: str`
- `description: Optional[str]`
- `image_url: Optional[str]`
- `badge: Optional[str]` (e.g., "Popular", "Chef's Pick")
- `position: int`
- `is_default: bool` (for `single` groups)
- `is_active: bool`

### API Shapes (read)
- Extend `ItemRead` with:
  - `option_groups: ItemOptionGroupRead[]`
- `ItemOptionGroupRead` includes ordered `options: ItemOptionRead[]`

### Manager UX
- Add "Display Options" section in item editor:
  - Create/reorder groups
  - Configure `single/multiple`, `min/max`, style
  - Add/reorder options with optional image/description/badge

---

## 6) Time/Date Visibility

### Timezone
- Add `menu.timezone: str` (IANA; default `UTC`, configurable in menu settings).

### New Table
3. `VisibilityRule`
- `id: UUID`
- `target_type: str` (`item` | `option`)
- `target_id: UUID`
- `kind: str` (`include` | `exclude`)
- `days_of_week: list[int]` (0=Mon..6=Sun)
- `start_time_local: time`
- `end_time_local: time` (supports overnight windows)
- `start_date: Optional[date]`
- `end_date: Optional[date]`
- `is_active: bool`
- `priority: int`

### Evaluation Rules
- Evaluate against **menu timezone** at request time.
- `exclude` always overrides `include`.
- If no include rules: visible unless excluded.
- If include rules exist: visible only when any include matches and no exclude matches.
- Public endpoint returns only currently visible items/options.

### Manager UX
- In item and option editors, add "Visibility" builder:
  - Always visible (default)
  - Weekly windows (day + time)
  - Optional date range (seasonal)
  - Exclusion windows (blackouts)

---

## 9) Item Detail Drawer/Modal

### Interaction Model
- Keep card list simple; click opens drawer.
- Mobile: bottom sheet (full-width, rounded top).
- Desktop: centered panel with constrained width.

### Drawer Sections
1. Header: image, item name, short description, price
2. Choice groups:
  - `single` -> radio-style cards/chips
  - `multiple` -> toggle chips/checkbox rows
  - labels: "Choose 1", "Choose up to 2", "Optional"
3. Dietary/allergen metadata
4. AR status/actions (existing behavior)

### Behavior
- Default selections prefilled from `is_default`.
- Selection validity is indicated in UI (required incomplete state), even though there is no checkout.
- Optional summary at bottom: "Selected: Shrimp base, Medium spice".

---

## Public API Response Example (trimmed)
```json
{
  "id": "menu-id",
  "timezone": "America/Toronto",
  "categories": [
    {
      "id": "cat-id",
      "items": [
        {
          "id": "item-id",
          "name": "Noodles",
          "option_groups": [
            {
              "id": "grp-1",
              "name": "Choose your base",
              "selection_mode": "single",
              "min_select": 1,
              "max_select": 1,
              "display_style": "chips",
              "options": [
                { "id": "opt-1", "name": "Chicken", "is_default": true },
                { "id": "opt-2", "name": "Shrimp" },
                { "id": "opt-3", "name": "Vegetable" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Rollout Plan
1. Backend schema + Alembic migrations (`ItemOptionGroup`, `ItemOption`, `VisibilityRule`, `menu.timezone`).
2. Extend `MenuRead` and public endpoint loading/filtering.
3. Update frontend types in `apps/web/src/types/index.ts`.
4. Manager item editor: options + visibility builder.
5. Public page drawer upgrade and option rendering.
6. Add tests for visibility evaluation (timezone + overnight windows + include/exclude precedence).

## Non-Goals (for this phase)
- Pricing deltas, bundles, cart validation, checkout submission.
- Inventory sync by option.
