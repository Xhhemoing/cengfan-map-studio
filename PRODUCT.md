# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Graduation-class organizers and design-capable educators who maintain student destination records and produce a final destination-map poster.
- Professional operators who need a dependable, high-density map-poster workstation for repeated editing, verification, layout, and delivery.
- Invited collaborators who participate in a shared project without being the project creator.

## Product Purpose

Cengfan Map Studio turns a graduating class's destination data into an editable, exportable destination-map poster. It must support the full workflow from importing and validating the roster, through map and poster layout, to high-resolution delivery.

## Positioning

The product combines structured student-destination data, deterministic geographic layout, editable poster composition, and project persistence in one workspace. The generated map is not a static template: it remains connected to project data, layout operations, and export output.

## Operating Context

Users work in a browser, often during preparation for graduation activities. They import XLSX/CSV or pasted roster data, resolve data-quality warnings, choose a map expression, edit visual assets and text, review layout, and export PNG/SVG or a reusable project package. A project can be shared with invited participants for synchronized work.

## Capabilities and Constraints

- React, Vite, TypeScript, an embedded Node API, SVG map rendering, and browser-local persistence are established implementation constraints.
- ProjectDocument is the canonical project state; UI appearance preferences must not alter poster data, undo history, or exported output.
- Existing project import/export, AI assistance, local persistence, deterministic layout, and incremental room synchronization must remain functional.
- Current room collaboration provides a creator-driven shared room and incremental synchronization. The product needs explicit participant roles so invited collaborators can access the same project appropriately.
- Interface skin choice is a per-user preference, not project content. The new skin will become the default while the current skin remains available as a legacy option.

## Brand Commitments

- Product name: "蹭饭地图工作室" / "蹭饭图".
- The product should feel like a purposeful map-poster workstation, not a generic dashboard or a marketing page.
- Graduation and reunion sentiment may appear in the creative canvas and editorial accents, while repetitive editing controls remain compact and operational.

## Evidence on Hand

- Product requirements: `docs/PROJECT_REQUIREMENTS.md`.
- Current application shell and editor: `src/App.tsx`, `src/styles.css`.
- Map canvas: `src/components/canvas/PosterCanvas.tsx`.
- Existing room synchronization: `src/lib/collaboration-client.ts`, `src/lib/collaboration-operations.ts`, `server/collaboration.ts`, and `server/index.ts`.
- No separate account system, identity provider, or durable room database is currently present. Future collaboration authorization must not claim account-level identity until it is implemented.

## Product Principles

1. Keep data, visual editing, and export in a verifiable closed loop.
2. Optimize the primary editing path for professional, repeated use before decorative expression.
3. Make poster-level sentiment visible in the creative surface without compromising tool clarity.
4. Preserve existing projects and workflows when improving presentation or collaboration.
5. Make shared access explicit, least-privilege, and understandable to participants.

## Accessibility & Inclusion

- Preserve keyboard-accessible controls, visible focus states, readable contrast, and responsive editor behavior.
- Role and synchronization status must not be communicated by color alone.
