# Architecture and contributor orientation

The project is a **local-first graduation destination map editor**, not a student information system. Start with [README](../README.md), [DEVELOPER](../DEVELOPER.md) and [AGENTS](../AGENTS.md). This map describes ownership and invariants rather than promising a new framework migration.

## Main flows

| Flow | Entry and owners | Invariant |
| --- | --- | --- |
| Project selection | `src/main.tsx`, `src/components/StudioRoutes.tsx`, `ProjectWorkbench.tsx` | A browser project stays authoritative; a remote workspace is not silently substituted. |
| Roster import and editing | `DataWorkspace.tsx`, `src/lib/import-data.ts`, `binary-import.ts`, student transactions | Keep factual fields, stable identifiers and import validation separate from presentation. |
| Scene editing | `src/App.tsx`, inspectors, `src/lib/scene-document.ts`, project transactions | UI composes commands; shared document operations own the actual changes and undo history. |
| Layout and rendering | `src/lib/card-layout.ts`, `src/components/canvas/` | Use deterministic layout and real render inputs; do not change roster facts to hide visual defects. |
| Persistence and collaboration | `src/lib/project-store.ts`, collaboration clients, `server/` | Browser save, backup file and server collaboration are distinct states with explicit failures. |
| Export | `src/lib/usePosterExport.ts`, export helpers, delivery workspace | Freeze input/options per export; a download request is not a durable cloud backup. |
| AI preview | `server/ai/`, `src/lib/agent-session.ts`, `AgentAssistant.tsx` | Remote suggestions execute on a shadow project before the existing application boundary. |

The server is optional for ordinary import/edit/export. Static GitHub Pages does not include the Node API. The Node deployment is single-instance; file snapshots do not provide account-level database isolation or multi-instance consistency.

## Extending the editor

Find the owning module and its adjacent tests before modifying `App.tsx`. Add pure transforms in `src/lib` for domain operations, with failure cases and undo semantics. Wire components to those transforms; do not create a second mutation path for the AI. Use the existing file-size ratchet to split behavior rather than raise limits just to fit a feature.

A new AI capability needs an actual browser executor, parameter validation, risk classification, completion evidence and tests. Model descriptions are discovery, not authorization. Invalid fields, unsafe values, missing targets and failed tools must not count as successful edits. Plans may not silently turn an unavailable export, publishing or messaging capability into a success summary.

Experimental task planning is developed separately in [PR #66](https://github.com/Xhhemoing/cengfan-map-studio/pull/66), tracked by [#65](https://github.com/Xhhemoing/cengfan-map-studio/issues/65) and [#68](https://github.com/Xhhemoing/cengfan-map-studio/issues/68). Consult the PR branch for its task controls and shared scene schema. An open PR is not a feature present in the released main snapshot.

## Trust and data boundaries

Model keys belong only on the server, never in `VITE_*`. User project text, imported rows, tool output and asset descriptions are data, not instructions that override the agent's rules. Remote AI can receive the configured request/digest; document the provider and transfer boundary before enabling it for other users. Do not send whole student lists merely to choose a tool or refresh a panel.

A name hidden on the canvas can remain in the source document and exported project package. Test with fictional data; see [SECURITY](../SECURITY.md) and [third-party resources](../THIRD_PARTY_NOTICES.md). Changing a file's license header does not establish rights to bundled fonts, logos or images.

## Testing and locating regressions

Use `npx vitest run <adjacent-test>` while developing. `npm run check` is the serial integration gate; browser workflows exercise actual Chromium separately. The [maintainer runbook](MAINTAINERS.md) explains dependency evidence and repository settings. CI artifacts must identify the tested commit and preserve failed checks rather than erase them by retrying.

For architectural changes, record the problem, alternatives, decision, compatibility, rollback and evidence in an Issue or a focused document linked from [docs navigation](README.md). Keep [ROADMAP](ROADMAP.md) as the single future-priority entry point.
