# Design Contract

> This document is the visual source of truth for the Cengfan Map Studio interface refresh. Poster and map styling remain project content and are not changed by UI skin selection.

## Meta

| Field | Value |
|---|---|
| Project | 蹭饭地图工作室 / Cengfan Map Studio |
| Date | 2026-08-05 |
| Primary classic | Swiss-modern - editorial grid, typographic hierarchy, and commemorative-map character |
| Secondary classic | Linear - compact workstation density and border-led controls |
| Density | compact |
| Theme | light and dark, paired semantic tokens |
| Technology mapping | CSS custom properties in `src/styles.css`, React components |

## Intent

- **Product type:** A professional map-poster workstation for graduation destination projects.
- **Users and setting:** Class organizers and professional operators import data, prepare a map poster, validate it, and deliver it. Invited collaborators need clear shared-project access.
- **Visual proposition:** An editorial map atelier: reliable and compact while the canvas retains the emotional gravity of a graduation keepsake.
- **Why this direction:** It honors the selected B direction through grid, restrained warm paper accents, and map-led composition, while retaining the operational density required for a repeated-use workstation.
- **Explicitly not:** A marketing landing page, a card-heavy dashboard, a mimic of Linear, or a decorative redesign that obscures controls.

## Brand Constraints

- Preserve the product name "蹭饭地图工作室" / "蹭饭图" and current canvas/project behavior.
- Preserve the current skin as `classic`, selectable per browser. The refreshed `atelier` skin is the default for new and existing users without a saved preference.
- Keep poster color, typography, assets, exports, undo history, and project data independent of the selected application skin.
- Use Swiss-modern structure and Linear density, not either product's logo, wordmark, brand purple, marketing copy, or proprietary artwork.

## Semantic Tokens

### Color

| Role | Atelier light | Atelier dark | Use |
|---|---|---|---|
| bg | `#ece8df` | `#171815` | Application background |
| surface | `#f8f6f0` | `#20211d` | Sidebar and panel |
| surface-2 | `#eeeae0` | `#292a25` | Active/embedded surface |
| raised | `#fffdf8` | `#242621` | Inputs, popovers, table surface |
| text | `#222a28` | `#f1eee5` | Primary text |
| text-muted | `#68716c` | `#adb3ab` | Metadata and supporting copy |
| border | `#d0cdc2` | `#3c3e38` | Default separation |
| border-strong | `#a69e90` | `#63665e` | Active control boundary |
| primary | `#315f57` | `#95c4b7` | Primary actions, current location, focus family |
| primary-fg | `#ffffff` | `#18211f` | Primary-button text |
| accent | `#bc5a43` | `#e58f77` | Editorial marker and warnings requiring attention |
| danger | `#ae493b` | `#e28876` | Destructive actions |
| success | `#24755e` | `#7ec6aa` | Ready/synchronized state |
| warning | `#9a6728` | `#e2b96d` | Needs review |
| focus-ring | `#315f57` | `#95c4b7` | Keyboard focus outline |

### Typography

| Role | Family | Size / line / weight | Notes |
|---|---|---|---|
| interface | Noto Sans SC, system-ui | 12-14px / 1.5 / 400-600 | All controls, labels, tables |
| editorial title | Noto Serif SC, Songti SC, serif fallback | 18-24px / 1.25 / 600-700 | Limited to workspace/panel headings and presentation metadata |
| body | Noto Sans SC, system-ui | 13px / 1.55 / 400 | Instructions and status text |
| label | Noto Sans SC, system-ui | 11-12px / 1.35 / 600 | Compact control labels |
| mono | DM Mono, ui-monospace | 11-13px / 1.4 / 500-700 | Room IDs, counts, version numbers |

### Space

- Base unit: `4px`.
- Scale: `4, 8, 12, 16, 20, 24, 32`.
- Compact control height: `32px`; compact table row: `36px`; panel padding: `16px` desktop and `12px` narrow layouts.

### Radius and Elevation

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `3px` | Tags and small inputs |
| `--radius-md` | `5px` | Buttons, fields, list rows |
| `--radius-lg` | `8px` | Popovers and dialogs |
| `--shadow-popover` | `0 10px 26px rgb(28 31 26 / 14%)` | Popovers only |
| `--shadow-dialog` | `0 18px 44px rgb(20 23 19 / 22%)` | Dialogs only |

## Layout Skeleton

- **Navigation:** Hybrid shell: a 56-60px topbar for project identity, workflow stage, shared-project state, global commands, and export; task navigation resides in the stable left panel; the right panel is contextual inspection.
- **Map as primary artifact:** The canvas remains visually central. Atelier skin uses a restrained warm surround and a fine editorial rule; it never puts the map inside a decorative card.
- **Panels:** Border-led, flat surfaces. Panel sections use rule-separated groups rather than nested cards.
- **Data work:** Tables use sticky headers, 36px rows, clear selected state, numeric tabular figures, and tooltips for icon-only actions.
- **Breakpoints:** At <=1120px, contextual inspection becomes an on-demand panel. At <=760px, workspace navigation becomes a scrollable task strip/drawer and the canvas keeps a stable minimum working width.

## Component Recipes

1. **Topbar:** Product mark, project title/status, workflow stepper, share state, undo/redo, zoom, skin/theme controls, and one strongest action. Warm paper/light or ink/dark surface, no oversized branding.
2. **Button:** 32px high; 5px radius; 12-13px semibold text. `primary` is filled green; `secondary` is raised surface with a border; `ghost` gains surface-2 on hover; destructive is explicit. Every icon-only button has `aria-label` and `title`.
3. **Input and select:** 32px high; raised surface and 1px border; focus outline uses `focus-ring`; errors pair text/icon with color.
4. **Navigation item:** Stable 36-44px item with icon, label, optional compact state marker. Current item has an inset primary rule plus a light active surface, rather than a large rounded pill.
5. **Panel section:** Title and compact metadata first, then a single vertical control group. Use a divider between sections. Avoid card-inside-card stacks.
6. **Data table:** Sticky header, 36px rows, muted metadata, hover surface, selected left rule, and batch controls only when needed.
7. **Shared-project status:** A topbar status control showing room name, role, connection state, live participant count, and non-color status text. The details popover contains share management and leave controls.
8. **Modal and popover:** 8px radius, strong border, limited shadow, keyboard escape/return focus behavior, and no content clipping.

## Motion Grammar

- Micro feedback: `120-160ms`; panel/popover transitions: `180-220ms`; no decorative scene motion.
- Use ease-out for reveals and selection feedback.
- Honor `prefers-reduced-motion` by making nonessential transitions immediate.

## Do and Don't

**Do**

- Let map and poster preview carry editorial emotion; keep controls quiet and operational.
- Use borders and rhythmic spacing before shadows or color blocks.
- Make sync, conflict, role, and readiness states explicit in text and icons.
- Maintain one semantic token system across global data, editor, settings, AI, and delivery surfaces.

**Don't**

- Do not change `ProjectDocument`, generated poster appearance, or export output when changing a UI skin.
- Do not introduce gradients, oversized rounded cards, ornamental blobs, or decorative animation.
- Do not use a borrowed purple primary or a copied Linear/Swiss brand asset.
- Do not grant edit access merely because a participant knows a room ID; access must use an explicit invitation grant in the collaboration workstream.

## Implementation Map

| Contract item | Code location |
|---|---|
| Skin preference, default, migration | `src/lib/theme.ts` and tests |
| Skin selector and topbar status | `src/components/ThemeToggle.tsx`, new skin control, `src/App.tsx` |
| Semantic tokens and skin overrides | `src/styles.css` |
| Shared-room participant and role UI | `src/App.tsx`, new collaboration components |
| Client collaboration protocol | `src/lib/collaboration-client.ts`, `src/lib/collaboration-operations.ts` |
| Room membership and authorization | `server/collaboration.ts`, `server/index.ts` |
| Existing regression coverage | `src/App.test.tsx`, component/unit tests, `server/*.test.ts` |

## Acceptance Checklist

- [ ] Atelier is default when no skin preference exists; `classic` remains selectable and persists per user.
- [ ] Switching skins or themes never mutates project content, export output, undo/redo state, zoom, or synchronization data.
- [ ] Desktop, tablet, and mobile layouts preserve the map editing path and no control text overflows.
- [ ] Every interactive component has hover, focus-visible, disabled, and selected/error states where relevant.
- [ ] The core editor, data workspace, global settings, AI assistant, delivery, and collaboration popover use the same semantic vocabulary.
- [ ] Shared rooms display role, presence, and connection/conflict state without relying on color alone.
- [ ] Invitations express recipient role; only authorized editors may submit operations.
- [ ] Existing import/export, layout, AI, room-sync, and project-package tests remain green.

## Changelog

| Date | Change |
|---|---|
| 2026-08-05 | Initial atelier/workstation contract, legacy skin retention, and role-aware collaboration direction. |
