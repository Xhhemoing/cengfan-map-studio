# Shared application topbar

## Scope and ownership

`StudioTopbar.tsx` and `styles/studio-topbar.css` own the editing header.
The five production stages, legacy content editor and global settings all
delegate to this component. They may supply actions, not alternate header markup.

The main toolbar is 56px and the workflow row is 48px in both skins and themes.
Workflow items have stable widths, full text labels and their own horizontal
scrolling area. The active item scrolls into view when the stage changes.
Page-specific actions cannot displace workflow navigation.

At 1120px and below, secondary page/project tools move into the labelled
"more actions" disclosure. They stay mounted exactly once. Escape, outside
pointer interaction, navigation and focus leaving the header close it.
History stays visible; disabled states and existing action callbacks are retained.

Global settings uses `embeddedHeader` to omit its standalone toolbar.
The app shell sizes the remaining workspace with flex instead of subtracting
different hard-coded header heights for different skins. Footer/status/notice
space participates in layout. Poster/export content is outside these CSS rules.

## Regression checks

Run sequentially:

```sh
npx vitest run src/components/StudioTopbar.test.tsx src/components/StudioTopbar.interactions.test.tsx src/components/StudioTopbar.ownership.test.ts
npm run typecheck
npm run lint
npm test
npm run build
```

The `Topbar browser regression` workflow additionally starts the real Vite app
with its bundled sample project. It measures both skins, both themes and
320/390/768/1440px viewports, navigating five stages, legacy content, all six
settings sections and back. It checks identical header/brand/navigation/history
geometry, token colors, workspace bounds, lack of duplicated settings headers,
runtime exceptions, mobile project-menu bounds, Escape and focus restoration.
Screenshots and measurements are retained as a seven-day CI artifact.

Browser tooling is pinned and installed only in that isolated CI job; the
application dependency manifest and lockfile are unchanged. No user data,
secrets or backend credentials are used. A normal revert rolls back this UI
change without data migration.
