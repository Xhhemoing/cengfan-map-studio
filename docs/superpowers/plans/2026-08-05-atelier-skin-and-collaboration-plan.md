# Atelier Skin And Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editorial Atelier interface the default while retaining the existing Classic skin, then replace room-code-only collaboration with explicit, token-backed owner/editor/viewer invitations.

**Architecture:** Keep UI appearance as a per-browser preference that is completely outside `ProjectDocument`, project packages, history, canvas rendering, and collaboration operations. Add a compact shell vocabulary to the existing React/CSS application rather than replacing domain workspaces. Evolve room access from an unauthenticated room ID to opaque server-issued room access tokens and invitation grants; role checks happen at the room store boundary and every API call carries its room token.

**Tech Stack:** React, TypeScript, Vite, Vitest, plain CSS custom properties, Lucide React, Node `http` server, EventSource, existing incremental collaboration operations.

## Global Constraints

- Follow `docs/design/DESIGN-CONTRACT.md`; Atelier is default, Classic remains a persistent per-user option.
- A skin or color-theme change must never alter `ProjectDocument`, poster SVG styling, export output, zoom, undo/redo, workspace session, or collaboration payloads.
- Preserve the current `data-editor-theme` light/dark behavior; skin and color theme are separate preferences.
- Use the existing CSS system and Lucide icons. Do not add a UI framework or a second styling system.
- Retain full-screen workspaces for data, template, map style, content/layout, frame, delivery, and global settings. The three-column shell is for continuous canvas editing, not a universal container.
- Keep desktop controls compact (32px) and mobile touch targets usable. Use text plus icon for collaboration state; do not rely only on color.
- Room IDs are no longer authorization. Every room read, subscribe, transaction, and invitation action requires an opaque room access token.
- Roles are `owner`, `editor`, and `viewer`. Owners create invitations and may edit. Editors may edit. Viewers receive live state but cannot submit project operations.
- Do not claim account identity, permanent user profiles, or durable room storage. Existing in-memory room TTL behavior remains documented.
- Follow TDD per task: add the named failing test, run it and observe the expected failure, implement the smallest change, then rerun the same target test.
- Do not overwrite unrelated dirty worktree changes. Do not commit without an explicit user request.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/lib/theme.ts` | Existing color-theme preference plus new persistent UI skin preference and defaulting logic. |
| `src/lib/theme.test.ts` | Unit coverage for theme and skin storage behavior. |
| `src/components/SkinSelector.tsx` | Accessible compact skin selector, independent from light/dark toggle. |
| `src/components/SkinSelector.test.tsx` | Selector labels, selection state, and callback coverage. |
| `src/components/StudioHeader.tsx` | Shared topbar structure for full-screen workspaces: brand, project status, global actions, skin/theme controls. |
| `src/components/StudioHeader.test.tsx` | Header action and accessibility coverage. |
| `src/components/CollaborationPanel.tsx` | Presentational shared-project control: connection, role, presence, invite, join, and leave states. |
| `src/components/CollaborationPanel.test.tsx` | Collaboration state, role restriction, and invocation coverage. |
| `src/App.tsx` | Wires skin preference, standardizes shell attributes and headers, and connects collaboration state/actions. |
| `src/App.test.tsx` | End-to-end UI regressions: default Atelier, Classic persistence, skin isolation, participant controls. |
| `src/styles.css` | Semantic skin token layers and Atelier overrides for shell, controls, panels, data workspaces, and responsive behavior. |
| `src/lib/collaboration-client.ts` | Typed room-token, invitation, joining, and role-aware API client. |
| `src/lib/collaboration-client.test.ts` | Client request/header/token serialization coverage. |
| `server/collaboration.ts` | Room access-token hashing/storage, invitation grants, membership, role enforcement, participant projection. |
| `server/collaboration.test.ts` | Store-level authorization, invitation, expiry, and operation coverage. |
| `server/index.ts` | HTTP routes and SSE access checks for room membership and invitations. |
| `server/index.test.ts` | HTTP authorization and SSE response coverage. |
| `README.md` | User-facing collaboration limitation and invitation workflow documentation. |
| `docs/design/DESIGN-CONTRACT.md` | Source-of-truth contract; amend only when implementation reveals a necessary durable visual decision. |

## Task 1: Add A Persisted, Default-Atelier Skin Preference

**Files:**
- Modify: `src/lib/theme.ts`
- Modify: `src/lib/theme.test.ts`
- Create: `src/components/SkinSelector.tsx`
- Create: `src/components/SkinSelector.test.tsx`

**Interfaces:**
- Produces `export type StudioSkin = "atelier" | "classic"`.
- Produces `SKIN_STORAGE_KEY = "cengfan-map-studio:ui-skin"`.
- Produces `loadStudioSkin(storage?: Storage): StudioSkin` and `saveStudioSkin(skin: StudioSkin, storage?: Storage): void`.
- Produces `<SkinSelector skin={StudioSkin} onChange={(skin: StudioSkin) => void} />`.

- [ ] **Step 1: Write the failing preference tests**

```ts
import { loadStudioSkin, saveStudioSkin } from "./theme";

it("uses Atelier when no valid skin preference was saved", () => {
  const storage = { getItem: () => null } as unknown as Storage;
  expect(loadStudioSkin(storage)).toBe("atelier");
});

it("persists Classic without changing the color-theme preference key", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage;

  saveStudioSkin("classic", storage);

  expect(loadStudioSkin(storage)).toBe("classic");
  expect(values.get("cengfan-map-studio:theme-mode")).toBeUndefined();
});
```

- [ ] **Step 2: Run the target test and verify red**

Run: `npx vitest run src/lib/theme.test.ts`

Expected: FAIL because `loadStudioSkin` and `saveStudioSkin` are not exported.

- [ ] **Step 3: Implement the smallest storage API**

```ts
export type StudioSkin = "atelier" | "classic";
export const SKIN_STORAGE_KEY = "cengfan-map-studio:ui-skin";

export function loadStudioSkin(storage?: Storage): StudioSkin {
  try {
    return (storage ?? window.localStorage).getItem(SKIN_STORAGE_KEY) === "classic"
      ? "classic"
      : "atelier";
  } catch {
    return "atelier";
  }
}

export function saveStudioSkin(skin: StudioSkin, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(SKIN_STORAGE_KEY, skin);
  } catch {
    // Storage access is optional for editor operation.
  }
}
```

- [ ] **Step 4: Run the target test and verify green**

Run: `npx vitest run src/lib/theme.test.ts`

Expected: PASS with the existing theme tests and new skin tests.

- [ ] **Step 5: Write the failing selector test**

```tsx
it("announces and changes the selected interface skin", () => {
  const onChange = vi.fn();
  const root = createRoot(container);
  flushSync(() => root.render(<SkinSelector skin="atelier" onChange={onChange} />));

  const classic = container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!;
  expect(classic.getAttribute("aria-pressed")).toBe("false");
  click(classic);
  expect(onChange).toHaveBeenCalledWith("classic");
});
```

- [ ] **Step 6: Run the selector test and verify red**

Run: `npx vitest run src/components/SkinSelector.test.tsx`

Expected: FAIL because `SkinSelector` does not exist.

- [ ] **Step 7: Implement the compact selector with Lucide icons and native buttons**

```tsx
export function SkinSelector({ skin, onChange }: {
  skin: StudioSkin;
  onChange: (skin: StudioSkin) => void;
}) {
  return (
    <div className="skin-selector" role="group" aria-label="界面样式">
      <button type="button" aria-label="切换到 Atelier 界面" aria-pressed={skin === "atelier"}
        onClick={() => onChange("atelier")} title="Atelier 界面">
        <PanelsTopLeft size={16} aria-hidden />
      </button>
      <button type="button" aria-label="切换到经典界面" aria-pressed={skin === "classic"}
        onClick={() => onChange("classic")} title="经典界面">
        <History size={16} aria-hidden />
      </button>
    </div>
  );
}
```

Use `currentColor` Lucide icons, 32px visible controls, focus-visible styling, and no text-only pill controls.

- [ ] **Step 8: Run selector and preference tests**

Run: `npx vitest run src/lib/theme.test.ts src/components/SkinSelector.test.tsx`

Expected: PASS.

## Task 2: Establish The Shared Atelier Shell Without Replacing Workspaces

**Files:**
- Create: `src/components/StudioHeader.tsx`
- Create: `src/components/StudioHeader.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `ThemeMode`, `ResolvedTheme`, `StudioSkin`, `ThemeToggle`, and `SkinSelector`.
- Produces `<StudioHeader projectLabel, projectStatus, skin, onSkinChange, themeMode, resolvedTheme, onThemeChange, actions, workflow?>`.
- `App` renders `data-editor-skin={skin}` together with existing `data-editor-theme={resolvedTheme}` for every app-shell branch.

- [ ] **Step 1: Write the failing StudioHeader accessibility test**

```tsx
it("keeps project state, skin selection, and labeled global actions in the shared header", () => {
  render(<StudioHeader projectLabel="2026 毕业去向图" projectStatus="已保存" skin="atelier"
    onSkinChange={vi.fn()} themeMode="light" resolvedTheme="light" onThemeChange={vi.fn()}
    actions={<button type="button" aria-label="导出 PNG">导出</button>} />);

  expect(screen.getByText("2026 毕业去向图")).toBeTruthy();
  expect(screen.getByText("已保存")).toBeTruthy();
  expect(screen.getByRole("group", { name: "界面样式" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "导出 PNG" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the target test and verify red**

Run: `npx vitest run src/components/StudioHeader.test.tsx`

Expected: FAIL because `StudioHeader` does not exist.

- [ ] **Step 3: Implement StudioHeader as a presentational component**

Keep it free of `ProjectDocument` and routing knowledge. It renders a brand block, a compact project/status block, optional `workflow` content only where the host explicitly provides it, and a global-actions region. Use `aria-live="polite"` on the short saved/sync status only.

- [ ] **Step 4: Run the StudioHeader test and verify green**

Run: `npx vitest run src/components/StudioHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing App skin isolation tests**

```tsx
it("defaults the editor shell to Atelier and persists Classic without touching project data", () => {
  const container = renderLegacyApp();
  const shell = container.querySelector<HTMLElement>(".app-shell")!;
  const before = serializeProjectDocument(/* current project fixture */);

  expect(shell.dataset.editorSkin).toBe("atelier");
  click(container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!);

  expect(shell.dataset.editorSkin).toBe("classic");
  expect(window.localStorage.getItem("cengfan-map-studio:ui-skin")).toBe("classic");
  expect(serializeProjectDocument(/* current project fixture */)).toBe(before);
});
```

Use the existing App test helpers and existing export/canvas assertions rather than introducing a parallel project fixture system.

- [ ] **Step 6: Run the App target test and verify red**

Run: `npx vitest run src/App.test.tsx -t "defaults the editor shell to Atelier"`

Expected: FAIL because `data-editor-skin` and the skin control are absent.

- [ ] **Step 7: Wire skin state through all App shell branches**

1. Initialize `skin` with `loadStudioSkin()` and persist it with `saveStudioSkin(skin)` in a separate effect.
2. Put `data-editor-skin={skin}` on every `.app-shell`, including template, data, map, frame, export, content, global-settings, and canvas-editor returns.
3. Replace repeated brand/theme markup incrementally with `StudioHeader` where its action slots match. Do not change any workflow-stage handlers or workspace props.
4. Keep the existing StageStepper in full-screen workspaces until Task 4 moves or restyles navigation deliberately; do not delete a working navigation path as part of extraction.

- [ ] **Step 8: Add Atelier token layer and the initial shell recipes**

Append a scoped token layer, preserving existing Classic values as the default fallback:

```css
.app-shell[data-editor-skin="atelier"] {
  --editor-bg: #f0f0eb;
  --editor-surface: #fbfbf9;
  --editor-surface-raised: #ffffff;
  --editor-surface-muted: #f3f3ef;
  --editor-ink: #202321;
  --editor-ink-muted: #737570;
  --editor-line: #e4e4de;
  --editor-accent: #24665a;
  --editor-accent-soft: #e8f1eb;
  --editor-danger: #b25440;
  --editor-focus: #24665a;
}
```

Add paired dark values under `[data-editor-skin="atelier"][data-editor-theme="dark"]`. Style the topbar, left navigation, canvas toolbar, inspector, primary/secondary/icon buttons, focus rings, compact numeric labels, and popovers using these variables. Do not target `.poster`, SVG text, or canvas fill classes in skin selectors.

- [ ] **Step 9: Run UI and theme regression tests**

Run: `npx vitest run src/lib/theme.test.ts src/components/SkinSelector.test.tsx src/components/StudioHeader.test.tsx src/App.test.tsx`

Expected: PASS.

## Task 3: Expand Atelier Coverage To Data, Full-Screen Workspaces, And Responsive States

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/DataWorkspace.tsx` only if a semantic hook/label needed by CSS is missing
- Modify: `src/components/GlobalSettingsScreen.tsx` only if it needs the shared skin control/header slot
- Modify: `src/App.test.tsx`
- Modify: existing focused component tests only when behavior changes

**Interfaces:**
- Consumes `data-editor-skin` and `data-editor-theme` applied by Task 2.
- Produces no project data or API changes.

- [ ] **Step 1: Write a failing DOM-level regression for the data workspace skin boundary**

```tsx
it("keeps the student data table semantic while the Atelier shell is active", () => {
  const container = renderLegacyApp();
  openPeopleData(container);

  expect(container.querySelector(".app-shell")?.dataset.editorSkin).toBe("atelier");
  expect(container.querySelector(".student-table thead th")?.textContent).toContain("学生");
  expect(container.querySelector(".student-table tbody tr")).not.toBeNull();
});
```

- [ ] **Step 2: Run the target test and verify red**

Run: `npx vitest run src/App.test.tsx -t "Atelier shell is active"`

Expected: FAIL before the Task 2 app-shell skin attribute reaches the full-screen data path.

- [ ] **Step 3: Implement semantic CSS coverage by surface**

Add one clearly marked Atelier section in `src/styles.css` in this order:

1. Shell, topbar, workflow navigation, left/right panels, canvas surround.
2. Inputs, selects, buttons, segmented controls, range fields, focus states, disabled states.
3. Data workspace: table header, rows, selected/hidden/error rows, import review, data summary, empty states.
4. Full-screen workspaces: template gallery, global settings, map style, content/layout, and delivery check rows.
5. Collaboration popover and export dialog.
6. <=1120px inspector drawer and <=760px mobile toolbar/navigation.

Use single-level panels with dividers. Preserve sticky table headers, 36px rows, tabular numeric text, and existing screen-reader labels. Do not add decorative gradients, nested cards, changing font sizes by viewport width, or non-semantic hard-coded colors in JSX.

- [ ] **Step 4: Add reduced-motion and typography finishing rules**

```css
.app-shell[data-editor-skin="atelier"] :is(h1, h2, h3) { text-wrap: balance; }
.app-shell[data-editor-skin="atelier"] :is(.panel-note, .asset-panel__hint, .data-workspace small) { text-wrap: pretty; }
.app-shell[data-editor-skin="atelier"] :is(.summary-number strong, .zoom-label, .workflow-stepper__status small) { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
  .app-shell[data-editor-skin="atelier"] *, .app-shell[data-editor-skin="atelier"] *::before, .app-shell[data-editor-skin="atelier"] *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

Only transition `background-color`, `border-color`, `box-shadow`, `color`, `opacity`, and `transform`; never use `transition: all`.

- [ ] **Step 5: Run targeted UI regressions**

Run: `npx vitest run src/App.test.tsx src/components/DataWorkspace.test.tsx src/components/GlobalSettingsScreen.test.tsx`

Expected: PASS.

## Task 4: Make The Shared Project UI Role-Aware Before Changing Server Authorization

**Files:**
- Create: `src/components/CollaborationPanel.tsx`
- Create: `src/components/CollaborationPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces `type CollaborationRole = "owner" | "editor" | "viewer"` in `src/lib/collaboration-client.ts` (implemented in Task 5).
- `CollaborationPanel` input:

```ts
type CollaborationPanelProps = {
  roomId: string | null;
  role: CollaborationRole | null;
  participants: Array<{ id: string; displayName: string; role: CollaborationRole }>;
  status: CollaborationStatus;
  message: string;
  onCreateRoom: () => void;
  onJoinRequest: (roomId: string, inviteToken: string) => void;
  onCreateInvitation: (role: Exclude<CollaborationRole, "owner">) => void;
  onLeaveRoom: () => void;
};
```

- [ ] **Step 1: Write failing presentation tests**

```tsx
it("shows participant role and withholds invitation controls from editors", () => {
  render(<CollaborationPanel roomId="ROOM01" role="editor" status="connected" message="已同步"
    participants={[{ id: "p1", displayName: "林舟", role: "owner" }, { id: "p2", displayName: "陈澈", role: "editor" }]}
    onCreateRoom={vi.fn()} onJoinRequest={vi.fn()} onCreateInvitation={vi.fn()} onLeaveRoom={vi.fn()} />);

  expect(screen.getByText("编辑者")).toBeTruthy();
  expect(screen.getByText("2 位协作者")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "邀请协作者" })).toBeNull();
});

it("explains viewer restrictions without hiding live room state", () => {
  render(/* same setup with role="viewer" */);
  expect(screen.getByText("仅查看")).toBeTruthy();
  expect(screen.getByText(/无法修改此工程/)).toBeTruthy();
});
```

- [ ] **Step 2: Run the component test and verify red**

Run: `npx vitest run src/components/CollaborationPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the collaboration panel**

Render it as a popover-compatible section, not a modal. Owners get `邀请编辑者` and `邀请查看者`; editors/viewers never receive invitation buttons. Show presence count, role text, connection state, and a short persisted-room warning. Invitation token display must be copyable but must include a warning that the recipient should keep it private.

- [ ] **Step 4: Run component tests and verify green**

Run: `npx vitest run src/components/CollaborationPanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Wire the panel into App without enabling unauthorized actions yet**

Replace the present `ProjectMenu` collaboration markup with `CollaborationPanel` or render the panel from the menu’s existing popover. Map existing room connection state to temporary owner-only local state while Task 5 changes the client types. Do not remove existing create/join controls before their tokenized replacements are wired.

- [ ] **Step 6: Run App collaboration regressions**

Run: `npx vitest run src/App.test.tsx -t "collaboration"`

Expected: PASS with current behavior still reachable and the new status semantics visible.

## Task 5: Introduce Token-Backed Room Access, Membership, And Invitations At The Store Layer

**Files:**
- Modify: `server/collaboration.ts`
- Modify: `server/collaboration.test.ts`
- Modify: `src/lib/collaboration-client.ts`
- Modify: `src/lib/collaboration-client.test.ts`

**Interfaces:**
- Produces `export type CollaborationRole = "owner" | "editor" | "viewer"`.
- Produces:

```ts
type RoomAccess = { participantId: string; accessToken: string; role: CollaborationRole; displayName: string };
type RoomParticipant = { id: string; displayName: string; role: CollaborationRole };
type RoomInvitation = { token: string; role: "editor" | "viewer"; expiresAt: string };

store.create(snapshot, { clientId, displayName }): { room, access: RoomAccess };
store.join(id, { inviteToken, clientId, displayName }): { room, access: RoomAccess };
store.createInvitation(id, accessToken, role): RoomInvitation;
store.authorize(id, accessToken, capability: "read" | "write" | "invite"): RoomParticipant;
store.apply(id, accessToken, transaction): CollaborationRoom;
store.subscribe(id, accessToken, listener): () => void;
```

- [ ] **Step 1: Write failing store tests for invitation authorization**

```ts
it("permits an invited editor to update a room and rejects a viewer write", () => {
  const store = createRoomStore({ generateId: () => "ROLE01", generateSecret: () => "secret" });
  const owner = store.create({ title: "初始" }, { clientId: "owner", displayName: "创建者" });
  const editorInvite = store.createInvitation("ROLE01", owner.access.accessToken, "editor");
  const viewerInvite = store.createInvitation("ROLE01", owner.access.accessToken, "viewer");
  const editor = store.join("ROLE01", { inviteToken: editorInvite.token, clientId: "editor", displayName: "编辑同学" });
  const viewer = store.join("ROLE01", { inviteToken: viewerInvite.token, clientId: "viewer", displayName: "查看同学" });

  expect(store.apply("ROLE01", editor.access.accessToken, {
    txId: "editor-1", clientId: "editor", baseVersion: 0, snapshot: { title: "编辑完成" },
  }).snapshot).toEqual({ title: "编辑完成" });

  expect(() => store.apply("ROLE01", viewer.access.accessToken, {
    txId: "viewer-1", clientId: "viewer", baseVersion: 1, snapshot: { title: "越权" },
  })).toThrowError(expect.objectContaining({ code: "ROOM_FORBIDDEN" }));
});
```

- [ ] **Step 2: Run the store test and verify red**

Run: `npx vitest run server/collaboration.test.ts -t "invited editor"`

Expected: FAIL because the store has no invitation or access-token API.

- [ ] **Step 3: Implement minimal secure room access**

1. Add a `generateSecret?: () => string` test option, defaulting to `randomBytes(32).toString("base64url")`.
2. Store only a SHA-256 hash of access tokens and invitation tokens, never the raw token.
3. Store participants as immutable public projections plus a private token-hash record. Return `{ id, displayName, role }` only.
4. Owner `create` returns its raw access token once. An invitation token is single-use and is removed after `join`.
5. `authorize(..., "read")` permits all roles, `"write"` permits owner/editor, and `"invite"` permits owner only.
6. Add `ROOM_FORBIDDEN`, `INVITATION_INVALID`, and `INVITATION_EXPIRED` error codes. Preserve existing `ROOM_NOT_FOUND`, version conflict, TTL, subscriber cap, and operation-rebase behavior.
7. Attach public `participants` and current caller’s `role` only at the HTTP projection layer in Task 6; do not leak token hashes in a store copy.

- [ ] **Step 4: Add edge-case tests and run the store suite**

Add tests that a random token cannot read, only an owner creates invitations, an invitation cannot be consumed twice, an expired invitation fails, room TTL clears invitation/token state, and an existing rebase still succeeds for two authorized editors.

Run: `npx vitest run server/collaboration.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing client header and invitation tests**

```ts
it("sends the room access token for reads and writes", async () => {
  const request = vi.fn(() => ok({ id: "ROLE01", version: 1, ready: true }));
  await fetchRoom("role01", "room-access-token", request);

  expect(request).toHaveBeenCalledWith("/api/rooms/ROLE01", {
    headers: { "X-Cengfan-Room-Token": "room-access-token" },
  });
});
```

- [ ] **Step 6: Run the client test and verify red**

Run: `npx vitest run src/lib/collaboration-client.test.ts -t "room access token"`

Expected: FAIL because fetch functions do not accept an access token.

- [ ] **Step 7: Implement typed token/invitation client methods**

Change the client signatures deliberately:

```ts
createRoom({ clientId, displayName, snapshot, request? })
fetchRoom(roomId, accessToken, request?)
joinRoom({ roomId, inviteToken, clientId, displayName, request? })
createRoomInvitation(roomId, accessToken, role, request?)
submitRoomSnapshot(roomId, accessToken, transaction, request?)
submitRoomOperations(roomId, accessToken, transaction, request?)
subscribeRoom(roomId, accessToken, onSnapshot, onError, options?)
```

Centralize the `X-Cengfan-Room-Token` header in a helper. Do not put room access tokens in EventSource query strings; use a short-lived SSE ticket endpoint in Task 6 because EventSource cannot attach custom headers.

- [ ] **Step 8: Run client tests**

Run: `npx vitest run src/lib/collaboration-client.test.ts`

Expected: PASS.

## Task 6: Add HTTP Authorization, Short-Lived SSE Tickets, And Real App Joining

**Files:**
- Modify: `server/index.ts`
- Modify: `server/index.test.ts`
- Modify: `src/lib/collaboration-client.ts`
- Modify: `src/lib/collaboration-client.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/CollaborationPanel.tsx`
- Modify: `src/components/CollaborationPanel.test.tsx`

**Interfaces:**
- Adds `POST /api/rooms/:id/invitations` (owner only).
- Adds `POST /api/rooms/:id/join` (single-use invitation token).
- Adds `POST /api/rooms/:id/events-ticket` (authorized member, returns short-lived one-use ticket).
- Changes `GET /api/rooms/:id` and transaction endpoints to require `X-Cengfan-Room-Token`.
- Changes `GET /api/rooms/:id/events?ticket=<ticket>&version=<n>` to validate ticket before opening SSE.

- [ ] **Step 1: Write failing HTTP authorization tests**

```ts
it("requires a room token before returning project data", async () => {
  const created = await createRoomThroughHttp(origin, { clientId: "owner", displayName: "创建者", snapshot: { title: "private" } });

  expect((await fetch(`${origin}/api/rooms/${created.room.id}`)).status).toBe(403);
  const allowed = await fetch(`${origin}/api/rooms/${created.room.id}`, {
    headers: { "X-Cengfan-Room-Token": created.access.accessToken },
  });
  await expect(allowed.json()).resolves.toMatchObject({ snapshot: { title: "private" }, role: "owner" });
});
```

Add a separate test: owner creates an editor invite; the invite joins; the viewer’s transaction returns 403 `ROOM_FORBIDDEN`; an editor transaction succeeds; SSE ticket rejects reuse and expires under an injected clock.

- [ ] **Step 2: Run HTTP target tests and verify red**

Run: `npx vitest run server/index.test.ts -t "requires a room token"`

Expected: FAIL because room GET is currently public.

- [ ] **Step 3: Implement routes and HTTP projections**

1. Read `X-Cengfan-Room-Token` with a narrow helper; reject absent/invalid tokens with `403` and a `ROOM_FORBIDDEN` body.
2. Keep raw credentials out of all JSON and SSE room projections.
3. Project `participants` as `{ id, displayName, role }[]` and caller `role` into the API response after authorization.
4. Use a bounded, in-memory SSE ticket ledger with TTL <=60 seconds and one-use semantics. Ticket issuance requires `read` authorization and remembers the participant/token hash server-side. SSE consumes the ticket before subscribing.
5. Route invitation creation through `invite` authorization and joining through a valid invite token. Return the joining participant’s new access token once.
6. Retain all current payload size limits, CORS, security headers, transaction dedupe, and minimal transaction acknowledgements.

- [ ] **Step 4: Run the collaboration HTTP suite**

Run: `npx vitest run server/index.test.ts -t "room|collaboration|SSE"`

Expected: PASS, including existing snapshot and incremental-operation cases updated to use the owner token.

- [ ] **Step 5: Add a failing App invitation/join regression**

```tsx
it("stores the local room credential after invitation join and disables viewer edits", async () => {
  const container = renderLegacyApp();
  // Mock joinRoom to resolve an access token, role viewer, and complete room snapshot.
  // Enter the invitation data through CollaborationPanel and submit it.

  await waitFor(() => expect(window.localStorage.getItem("cengfan-map-studio:room-access:ROLE01")).toBe("viewer-token"));
  expect(container.getByText("仅查看")).toBeTruthy();
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="重新智能排版"]')?.disabled).toBe(true);
});
```

- [ ] **Step 6: Run the App target test and verify red**

Run: `npx vitest run src/App.test.tsx -t "invitation join"`

Expected: FAIL because credentials/role state are not stored and write controls remain enabled.

- [ ] **Step 7: Implement App membership persistence and write gating**

1. Store credentials only under `cengfan-map-studio:room-access:<ROOM_ID>` and remove them on explicit leave. Do not add them to project packages or workspace snapshots.
2. On create/join, persist the received `accessToken`; hydrate it only after a user chooses or returns to the same room. A room ID alone cannot resume access.
3. Pass the token to every fetch, submit, invite, and subscription call. Create/refresh an SSE ticket before creating each EventSource; reconnect must obtain a new ticket.
4. Disable transaction-generating controls when `role === "viewer"`, with clear `title` and inline explanation. Keep selection, preview, data inspection, export, and leave actions available.
5. If a token becomes invalid or a room expires, clear only the stored room credential and show a recoverable disconnected status. Never clear the local project.

- [ ] **Step 8: Run client/App collaboration tests**

Run: `npx vitest run src/lib/collaboration-client.test.ts src/components/CollaborationPanel.test.tsx src/App.test.tsx -t "collaboration|invitation|viewer"`

Expected: PASS.

## Task 7: Document, Verify, And Review The Finished Surface

**Files:**
- Modify: `README.md`
- Modify: `docs/design/DESIGN-CONTRACT.md` only for implementation-confirmed token or behavior differences
- Modify: `docs/superpowers/specs/2026-08-05-atelier-skin-and-collaboration-design.md` if created during execution to record actual authorization constraints

- [ ] **Step 1: Document real collaboration limits and recovery**

Add a concise README section covering:

```md
## 共享协作

共享房间目前保存在 API 进程内，并会在无活动一段时间后过期。创建者生成邀请链接时可选择“可编辑”或“仅查看”；邀请凭证是访问权限，应通过私密渠道发送。房间过期、令牌失效或离开房间不会删除本机工程草稿。
```

Do not claim account identity, permanent history, cross-instance persistence, or encrypted end-to-end collaboration.

- [ ] **Step 2: Run focused static checks**

Run: `npm run lint`

Expected: PASS with no TypeScript/ESLint errors.

- [ ] **Step 3: Run full test suite and production build serially**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0. If either fails, follow the repository failure → cause → fix → recheck discipline; do not rerun unchanged.

- [ ] **Step 4: Run design mechanical detector once**

Run:

```bash
node C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs --json src/App.tsx src/styles.css src/components/SkinSelector.tsx src/components/StudioHeader.tsx src/components/CollaborationPanel.tsx
```

Expected: inspect all findings, fix mechanical issues that conflict with the contract, and record any accepted residual finding for review. Do not run the detector a second time.

- [ ] **Step 5: Perform a bounded manual visual check**

Run `npm run dev` and inspect a desktop (1440px) and mobile (390px) session in one batch:

1. Verify Atelier light and dark, then Classic light and dark.
2. Open canvas editing, full-screen data, template, global settings, delivery, and collaboration panel.
3. Verify text fits, icon-only buttons show tooltips, focus is visible, no control overlaps, and poster appearance remains unchanged when switching skin/theme.
4. Verify owner, editor, and viewer collaboration states; ensure a viewer cannot generate transactions but can inspect/export/leave.

Capture screenshots of the two viewports if browser tooling is available. If unavailable, record the exact limitation and leave visual verification explicitly pending.

- [ ] **Step 6: Request a fresh completion review**

Use the available review workflow or a fresh reviewer to inspect the implementation diff, test evidence, detector output, accessibility states, and the Design Contract. Resolve only review findings in scope, then rerun the affected verification command before reporting completion.

## Coverage Review

- Skin default/persistence/isolation: Tasks 1-3.
- New Atelier visual system, primary shell, data/full-screen surfaces, responsiveness: Tasks 2-3.
- Classic skin retention: Tasks 1-3.
- Shared collaboration roles, invitations, real access control, presence projection, viewer restrictions: Tasks 4-6.
- Existing import/export/canvas/AI/project behavior preservation: Tasks 2-3 and Task 7 regression/build gates.
- Documentation and bounded visual/design review: Task 7.

## Self-Review

- Placeholder scan: no `TODO`, `TBD`, or unspecified test instructions remain.
- Type consistency: role values and client/server function names are defined in Tasks 4-6 before their consumption.
- Scope boundary: collaboration is explicitly in-memory and token-backed, not an unimplemented account system; visual work is a skin layer, not poster-data migration.
