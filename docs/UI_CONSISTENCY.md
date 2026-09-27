# Studio UI consistency

## Ownership

`src/styles/studio-tokens.css` owns the application palettes, font stack, control
heights, radii, contrast text and surface aliases. `src/styles/studio-chrome.css`
owns shared native controls and workbench presentation. Both load after the
legacy stylesheet in `src/main.tsx`; new shared rules should go here rather than
adding another skin-specific override to the legacy sheet.

`src/lib/studio-theme.ts` consumes the same tokens for MUI typography, buttons,
inputs, menus and dialogs. Keep CSS-variable colors on MUI's native-color path;
JavaScript color parsers cannot safely derive colors from `var(...)` strings.

The existing `atelier` and `classic` skin settings remain supported. The live
`.app-shell` attributes select document-level tokens through `:has()`, as well as
shell-level tokens. This is intentional: menus/dialogs can be portalled to body,
and the workbench does not execute the editor's document-theme effect. Aliases
must be declared in the scope where their inputs change, not only inherited
from a light root. The application already targets modern CSS browsers.

## Presentation rules

- Use the shared sans-serif stack for application UI. Poster SVG typography,
  template previews, colors and exported content remain project-owned.
- Use 36px controls, 32px explicitly compact controls, and 44px controls on
  narrow/coarse-pointer screens. Do not resize checkbox, radio, color, range or
  file inputs with a blanket form-control rule.
- Use neutral secondary actions and a filled accent primary action. Danger
  actions retain their own semantic color; disabled controls remain disabled.
- Use 6px control radii, 10px panels/menus and 14px workbench cards/dialogs.
  Reserve shadows for overlays, not every nested panel.
- Keep one workbench page heading. Suppress the project count during loading
  or a storage error rather than implying that an unreadable store is empty.

## Validation before merge

Run these serially (the repository's heavy-task lock rejects overlapping jobs):

```sh
npx vitest run src/lib/studio-theme.test.ts src/components/workbench/ProjectGrid.presentation.test.tsx
npm run typecheck
npm run lint
npm test
npm run build
```

The theme tests protect token bindings, typography, contrast colors, native
color derivation and control density. The grid tests protect page semantics,
loading announcements and error/empty-state distinctions.

For browser acceptance, inspect both skins in light/dark at 320px, 390px,
768px and desktop widths. Check the workbench and each editor stage, open a
portalled menu/dialog/drawer, and switch themes while it remains open. Verify
readable text, keyboard focus, disabled/danger actions, reduced motion, long
project names, menu hit areas and no page-level horizontal overflow. An isolated
CSS fixture is useful for token/contrast checks, but is not a substitute for
running the complete React application and checking real interactions.

No schema, project-package, storage, API, map layout or export logic changes are
part of this update. Rollback is a normal revert of the UI commit; it requires
no data migration or cleanup.
