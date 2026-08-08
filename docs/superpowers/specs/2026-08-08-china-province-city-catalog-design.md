# China Province City Catalog Design

## Goal

Replace the incomplete hand-maintained city catalog with complete mainland, municipality, Hong Kong, Macau, and Taiwan province/city metadata that is stored in this repository and can be regenerated from the `province-city-china` npm package.

## Scope

- Include province- and prefecture/city-level data only.
- Keep browser lookup synchronous and offline by importing a generated TypeScript catalog.
- Preserve existing free-form matching behavior, including municipality inputs and the established aliases for Beijing, Shanghai, Hong Kong, Macau, and Taipei.
- Do not add district, county, town, address selector UI, or runtime network requests.

## Architecture

`scripts/sync-china-locations.mjs` downloads the selected `province-city-china` release from the npm registry, extracts only `dist/province.json` and `dist/city.json`, validates their shape and province relationships, and emits `src/data/china-locations.ts`. The generated module contains provenance metadata, a province catalog, and the city catalog used by `src/lib/search-catalog.ts`.

The sync command defaults to the npm `latest` tag and accepts `--version <semver>` for deterministic regeneration. The checked-in generated output is the production source of truth. A failed download, malformed payload, or missing province mapping must leave the existing generated file untouched and exit non-zero.

## Data Model

```ts
export interface ProvinceCatalogEntry {
  code: string;
  name: string;
}

export interface CityCatalogEntry {
  code: string;
  name: string;
  province: string;
  aliases: string[];
}
```

City aliases include the suffix-free city name where unambiguous, plus the compatibility aliases formerly held by the handwritten catalog. Municipality records are derived from their province record because the upstream city file begins at prefecture level. Hong Kong, Macau, and Taiwan records are retained when upstream data supplies them, or synthesized from the province catalog where required for compatibility with the existing map.

## Error Handling

- The generator rejects non-2xx registry or tarball responses, invalid JSON, duplicate codes, and city rows whose two-digit province code has no province entry.
- Generation occurs in memory and writes its target only after validation and rendering succeed.
- The UI continues to treat unknown locations as unresolved; no fallback network request occurs in the browser.

## Tests

- Unit tests cover full-catalog city resolution for locations omitted by the old hand-authored file, municipality resolution, province-prefixed input, and province search independent of city coverage.
- Script tests run against injected registry/tarball fixtures and assert generated deterministic output plus non-destructive failure behavior.
- Run focused Vitest suites, lint, and production build before delivery.
