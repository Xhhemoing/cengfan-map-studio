# Import fidelity implementation plan

> For agentic workers: execute this focused plan task by task using the executing-plans workflow.

**Goal:** Reject incomplete delimited records without shifting fields, preserve source line numbers, and align international destination parsing across text and workbooks.

**Architecture:** Keep the existing parser interfaces and project format. Carry original line numbers with each nonempty raw line, preserve explicit empty columns, and share the existing workbook scope normalizer through import-data.ts. Keep free-form whitespace parsing compatible.

**Tech stack:** TypeScript, Vitest, React/Vite UI.

## Global constraints

- Commands use pwsh; scripts start with `$ErrorActionPreference = 'Stop'`; text IO explicitly uses UTF8.
- Work on `codex/import-quality` in the isolated worktree.
- No dependency upgrades, layout redesign, collaboration behavior changes, or project migrations in this change.
- Baseline: 2452 tests passed, 6 failed, 2 skipped. Failures are recorded separately; a focused collaboration retry reproduced its timeout in isolation.

## Task 1: Parser regression tests

- [x] Create `src/lib/import-data.fidelity.test.ts` with literal fixtures covering missing leading/middle/trailing required columns for every supported explicit delimiter; verify both text parser APIs.
- [x] Cover headerless workbook fallback, original blank-line numbering, leading blank lines before headers, free-form compatibility, and text/workbook international aliases.
- [x] Cover OCR normalization preserving row boundaries.
- [x] Run the new test against unchanged production code and record the actual failures.

## Task 2: Minimal parser and documentation corrections

- [x] Update `src/lib/import-data.ts`: retain source indexes and raw column delimiters; trim cells after splitting, without discarding empty explicit columns; share the existing scope normalizer.
- [x] Update `src/lib/binary-import.ts`: use shared scope normalizer; preserve OCR newlines and tabs during whitespace normalization.
- [x] Correct README required columns and clarify optional destination type in USER_GUIDE. Do not treat a province as a city.
- [x] Run the same regression tests plus existing import and importer UI tests.

## Task 3: Verify and deliver

- [x] Run typecheck, lint, and Vite production build serially.
- [x] Inspect the diff and cover the server local-fallback path through the full suite.
- [x] Use a separate local preview to reproduce the formerly accepted incomplete row and confirm it is rejected; confirm valid records remain accepted.
- [x] Update the assessment with exact results and remaining baseline issues. Preserve original checkout and do not push or merge.

Rollback: discard this isolated worktree's parser/doc changes or revert the corresponding diff. Stored project data and package format are unchanged.
