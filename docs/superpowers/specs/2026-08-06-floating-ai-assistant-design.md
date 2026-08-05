# Floating AI Assistant Design

## Goal

Replace the hidden sidebar AI entry with a persistent-in-viewport floating AI workspace that is available from the editor, supports multiple in-memory conversations, exposes proposed changes before application, and lets the user exclude individual proposed steps.

## Product Decisions

- The legacy editor's secondary horizontal editor toolbar is removed. Its canvas-only controls are intentionally out of scope for relocation because the requested surface should prioritize the working canvas and AI access.
- The assistant starts minimized as a circular fixed button in the lower-right viewport corner. It shows a numeric badge when one or more completed conversations still have unapplied accepted changes.
- Opening the button reveals a fixed floating window. Its header is draggable within the viewport; closing minimizes it without discarding its conversations. On narrow screens the window uses the available viewport width and remains movable only within visible bounds.
- Conversation history is retained in React memory for the current application lifetime, not persisted to browser storage or sent outside the existing AI API. Refreshing the application clears the list.
- A new conversation creates an independent `AgentSession`. Users can select a completed conversation from the history list and continue it with a follow-up request. Running conversations cannot be switched away, deleted, or duplicated.
- Each completed conversation renders: the user request, the model's summary, its proposed write steps, risk/result state, and a checkbox per valid write step. Read-only inspection calls are omitted from the proposal list.
- All valid write steps start selected. The user can clear any step before applying. Applying uses only the selected calls in original order against the project snapshot taken when that conversation began. This avoids applying an unchecked call and preserves the existing single project transaction/history entry model.
- Applying selected changes creates one existing `source: "ai"` transaction. A successfully applied conversation is no longer counted by the launcher badge. A conversation with at least one remaining selected unapplied step is counted exactly once, even if it is not the active conversation.
- Conservative mode remains default. Smart mode retains existing behavior: it may automatically apply an all-low-risk outcome; its completed conversation is then marked applied. High-risk outcomes always require a user action.
- Cancellation, request failures, fallback/provider status, 70-second per-round timeout, and agent API behavior remain owned by `AgentSession`; the UI only presents its state.

## Architecture

### `AgentSession`

`AgentSession` continues to own transport, conversation protocol, tool validation, shadow project, and API-side budget state. It gains deterministic proposal application helpers:

- retain the starting project snapshot;
- store the write call order already represented by `AgentStep`;
- expose `transactionForSteps(stepIds: ReadonlySet<string>): ProjectTransaction`, which replays selected valid write calls from the starting project in original order and returns an `ai` transaction;
- return no write transaction when `stepIds` is empty.

Replaying is deliberately local and uses the existing `execute` rules so the selected subset cannot circumvent client-side tool or field validation. Tool execution during replay must not add history conversation messages, progress events, or duplicate visible steps.

### `AgentAssistant`

The existing component becomes the floating interaction surface. Its component state owns an ordered list of `AssistantConversation` records:

```ts
type AssistantConversation = {
  id: string;
  title: string;
  session: AgentSession;
  request: string;
  status: "draft" | "running" | "completed" | "failed" | "cancelled" | "applied";
  summary: string;
  error: string;
  steps: AgentStep[];
  selectedStepIds: string[];
  mode: "conservative" | "smart";
};
```

The active record is the only editable/runnable one. The component reports the current shadow preview through `onPreview`; selecting a completed conversation previews its selected steps only. It reports the number of completed conversations with selected, unapplied write steps through `onPendingCountChange`.

The header uses pointer capture to move the panel. Movement is disabled for controls within the header. Coordinates are clamped so the window header remains reachable, and reset only when the browser viewport shrinks beyond its current bounds.

### `App`

`App` removes `contentView` and the "画布图层 / AI 助手" segmented control in the legacy sidebar, leaving the layer controls uninterrupted. It renders `AgentAssistant` at the top-level editor surface and passes existing project/assets/preview/commit callbacks. The pending count lives inside the assistant because it is only needed to render its own launcher badge.

The standard content workspace is the primary landing screen, so it also receives the floating assistant. The assistant does not alter project data until the existing `commitProjectTransaction` callback is called.

## UI and Accessibility

- Launcher: button with `aria-label="打开 AI 助手"`; badge is textual for screen readers.
- Panel: `role="dialog"`, `aria-label="AI 助手"`, title header, close/minimize button, history navigation, new-conversation command, mode radio group, request textarea, send/cancel command, result/proposal list, and apply-selected command.
- History entries use buttons with an active state and meaningful title/request excerpt. Completed/unapplied entries are visibly marked.
- Step checkboxes include a label derived from tool name and proposed fields. Failed/rejected steps cannot be selected or applied.
- No new runtime dependency or API route is required.

## Error Handling

- Empty messages never call the session.
- A pre-existing running conversation is cancelled on component unmount, matching existing behavior.
- Failed or cancelled conversations remain in history with their status and request so the user can start a new one; they never increment the pending badge.
- If a selected-step replay produces no valid write changes, application is disabled and preview is cleared.

## Tests

- `AgentSession`: selected-step transaction changes only selected fields, preserves ordering, and does not include deselected calls.
- `AgentAssistant`: starts minimized; opens via launcher; creates/switches conversations; exposes completed proposal and pending badge; deselecting a step prevents it from reaching `onCommit`; apply marks a conversation resolved; cancelled sessions never commit.
- `App`: the old content AI tab is absent, the standard content workspace exposes the floating launcher, and the legacy editor does not render `.editor-toolbar`.
- Existing AI session, App, and assistant tests remain green; run TypeScript, lint, build, the relevant Vitest set, and full tests serially before delivery.

## Non-Goals

- Persisting conversations across reloads or devices.
- Replacing the existing API, model routing, safety checks, budget receipts, or transaction history format.
- Applying a partial change by mutating another conversation's committed project history.
