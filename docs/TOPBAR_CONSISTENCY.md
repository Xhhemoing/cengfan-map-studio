# Shared application topbar

## Scope and ownership

`StudioTopbar.tsx` and `styles/studio-topbar.css` own the editing header.
The five production stages, legacy content editor and global settings all
delegate to this component. They may supply actions, not alternate header markup.

Above 1120px, brand, workflow and actions share one 56px toolbar row. Equal
side tracks keep the five workflow steps centred independently of page tools.
This replaces the previous always-two-row design at the user's request.
At 1120px and below the same header wraps: 56px for brand/actions and 48px
for navigation. The workflow is never moved into the sidebar or tools menu.
Step names remain visible, and the active item scrolls into view on stage
changes or viewport resizing. DOM order is brand, workflow, then actions.

Assistant/history remain visible. Page/project tools use the labelled "more
actions" disclosure at every width so their changing count cannot crowd out
steps. Controls stay mounted exactly once; none of their callbacks are removed.
Escape, outside interaction, navigation, leaving the header and crossing the
wrap breakpoint close the disclosure. Escape restores focus to its trigger.

Global settings uses `embeddedHeader` to omit its standalone toolbar.
The app shell fills the remaining workspace with flex; the header height token
tracks 56px desktop / 104px narrow. Footer/status/notice space participates in
layout. Poster/export content is outside these CSS rules.

## Regression checks

Run sequentially:

```sh
npx vitest run src/components/StudioTopbar.test.tsx src/components/StudioTopbar.interactions.test.tsx src/components/StudioTopbar.ownership.test.ts
npm run typecheck
npm run lint
npm test
npm run build
```

The `Topbar browser regression` workflow starts the real Vite app with its
bundled sample. It checks both skins, both themes and 320/390/768/1120/1121/
1280/1440px viewports, navigating five stages, legacy content, all six settings
sections and back: 364 page checks. Both sides of the wrapping breakpoint
are included. Assertions cover same-row desktop navigation, centring, no tool
overlap, stable cross-page geometry/colors, correct workspace bounds, current
step visibility, no duplicate toolbar and no browser runtime exceptions.
The tools menu is opened on desktop as well as mobile; menu bounds, Escape
and focus restoration are checked. Screenshots and measurements are retained
as a seven-day CI artifact. Coverage counts here describe the test matrix;
a successful run for the current commit is still required as delivery evidence.

Browser tooling is pinned and installed only in that isolated CI job; the
application dependency manifest and lockfile are unchanged. No user data,
secrets or backend credentials are used. A normal revert rolls back this UI
change without data migration.
