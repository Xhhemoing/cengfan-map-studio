MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 2 — card-layout cache key invariants

## Added test

- `src/lib/card-layout-cache.invariants.cycle3.test.ts`
  - Uses identical origin-relative rings at two origins and requires distinct
    complete keys, while confirming their serialized ring segments are equal.
    This isolates the origin as the value preventing a collision.
  - Uses the same origin and non-polygon inputs with one changed ring point,
    and requires both the serialized ring segments and complete keys to differ.
    Polygon bounds are intentionally unchanged so the ring coordinate itself
    must discriminate the keys.

No production file was edited.

## Validation

```sh
npx vitest run \
  src/lib/card-layout-cache.invariants.cycle3.test.ts \
  src/lib/card-layout-cache.affine.cycle3.test.ts
```

```text
Test Files  2 passed (2)
Tests       3 passed (3)
```

The requested affine test was re-run as part of this command and passed.

```sh
npx eslint src/lib/card-layout-cache.invariants.cycle3.test.ts
# exit 0
```

No Git command was run.
