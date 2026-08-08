# China Province City Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a complete, offline province/city catalog that can be regenerated from the upstream `province-city-china` data package.

**Architecture:** A Node sync script resolves a package release, fetches its tarball, reads only province and city JSON, validates and normalizes it, then writes a checked-in TypeScript module. The existing search catalog consumes that generated data synchronously, so import and search flows gain coverage without browser requests or UI changes.

**Tech Stack:** Node.js ESM scripts, TypeScript, React/Vite, Vitest, npm registry, `province-city-china` (MIT).

## Global Constraints

- Only province and city/prefecture data may be imported; no district or town data.
- Production browser code must use checked-in static data and make no location-data network request.
- Default synchronization targets npm `latest`; `--version <semver>` makes a run reproducible.
- Preserve established compatibility aliases and canonical map province names.
- Do not alter unrelated dirty worktree files.
- Follow TDD: run every new focused test while red before implementation, then rerun green.

---

### Task 1: Add the deterministic province/city synchronization pipeline

**Files:**
- Create: `scripts/sync-china-locations.mjs`
- Create: `scripts/sync-china-locations.test.ts`
- Create: `src/data/china-locations.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `syncChinaLocations(options): Promise<{ version: string; provinces: number; cities: number }>` for testable orchestration.
- Produces `src/data/china-locations.ts` exporting `ProvinceCatalogEntry`, `CityCatalogEntry`, `chinaProvinces`, `chinaCities`, and `chinaLocationSource`.
- Provides `npm run data:sync:china-locations [-- --version <semver>]`.

- [ ] **Step 1: Write failing script tests**

```ts
it("writes province and city data from an injected upstream release", async () => {
  const result = await syncChinaLocations({
    version: "8.5.8",
    fetch: fixtureFetch({ provinceRows, cityRows }),
    outputPath,
  });

  expect(result).toEqual({ version: "8.5.8", provinces: 2, cities: 3 });
  expect(await readFile(outputPath, "utf8")).toContain('name: "杭州市"');
});

it("does not overwrite the existing catalog when upstream data is invalid", async () => {
  await writeFile(outputPath, "existing catalog");
  await expect(syncChinaLocations({ fetch: invalidFixtureFetch, outputPath }))
    .rejects.toThrow("missing province");
  expect(await readFile(outputPath, "utf8")).toBe("existing catalog");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/sync-china-locations.test.ts`

Expected: FAIL because the synchronization module does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
export async function syncChinaLocations({ version, fetch = globalThis.fetch, outputPath } = {}) {
  const release = version ?? await resolveLatestVersion(fetch);
  const { provinceRows, cityRows } = await fetchPackageRows(release, fetch);
  const catalog = normalizeLocationRows(provinceRows, cityRows);
  await writeFile(outputPath, renderCatalog(catalog, release));
  return { version: release, provinces: catalog.provinces.length, cities: catalog.cities.length };
}
```

Fetch npm metadata and the tarball, parse `dist/province.json` and `dist/city.json`, validate codes and relationships, synthesize municipality/compatibility entries, and write only after the entire result is valid. Add the npm command. Run the command once to create the checked-in generated catalog from version `8.5.8`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/sync-china-locations.test.ts`

Expected: PASS with both generation and non-destructive failure cases.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/sync-china-locations.mjs scripts/sync-china-locations.test.ts src/data/china-locations.ts
git commit -m "feat: add synced China province-city catalog"
```

### Task 2: Migrate lookup code to generated static data

**Files:**
- Modify: `src/lib/search-catalog.ts`
- Modify: `src/lib/search-catalog.test.ts`
- Delete: `src/data/china-cities.ts`

**Interfaces:**
- Consumes `chinaCities` and `chinaProvinces` from `src/data/china-locations.ts`.
- Preserves `searchCities(query, limit)`, `searchProvinces(query, limit)`, and `resolveCity(city)` return signatures.

- [ ] **Step 1: Write failing test**

```ts
it("resolves a city omitted from the old hand-maintained catalog", () => {
  expect(resolveCity("沧州")).toMatchObject({
    city: "沧州市",
    province: "河北省",
    status: "resolved",
  });
});

it("searches every generated province even without a matching city", () => {
  expect(searchProvinces("西藏", 5)).toEqual(["西藏自治区"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/search-catalog.test.ts`

Expected: FAIL because `沧州` is absent from the old catalog and province search derives from city rows.

- [ ] **Step 3: Write minimal implementation**

```ts
import { chinaCities, chinaProvinces, type CityCatalogEntry } from "../data/china-locations";

export function searchProvinces(query: string, limit = 8): string[] {
  return searchCatalog(chinaProvinces.map((province) => ({ name: province.name, aliases: [] })), query, limit)
    .map((entry) => entry.name);
}
```

Keep existing ranking and resolution behavior. Remove the hand-authored catalog only after all imports use the generated module.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/search-catalog.test.ts src/lib/student-data.test.ts`

Expected: PASS, including legacy aliases and full-data cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search-catalog.ts src/lib/search-catalog.test.ts src/data/china-cities.ts
git commit -m "feat: resolve locations from complete static catalog"
```

### Task 3: Verify delivery behavior and document refresh workflow

**Files:**
- Modify: `README.md`
- Modify: `src/lib/search-catalog.test.ts`

**Interfaces:**
- Documents `npm run data:sync:china-locations` and version-pinned invocation.
- Confirms consumer-visible resolution of municipality, special administrative region, Taiwan, and an ordinary upstream city.

- [ ] **Step 1: Write final regression test**

```ts
it("keeps municipality and special-region aliases compatible with imports", () => {
  expect(resolveCity("北京")).toMatchObject({ city: "北京市", province: "北京市" });
  expect(resolveCity("香港")).toMatchObject({ city: "香港特别行政区", province: "香港特别行政区" });
  expect(resolveCity("台北")).toMatchObject({ city: "台北市", province: "台湾省" });
});
```

- [ ] **Step 2: Run regression test to verify it fails or identifies a compatibility gap**

Run: `npx vitest run src/lib/search-catalog.test.ts`

Expected: Any missing compatibility entry fails with its unresolved result; if existing coverage already makes it pass, add a newly uncovered generated-city assertion before implementation.

- [ ] **Step 3: Finish compatibility aliases and document data refresh**

Add only aliases required for prior behavior and explain that synchronization fetches `province-city-china` at update time while the emitted TypeScript module is what ships to browsers. State that the command includes province/city data only.

- [ ] **Step 4: Run focused verification**

Run: `npx vitest run scripts/sync-china-locations.test.ts src/lib/search-catalog.test.ts src/lib/student-data.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md src/lib/search-catalog.test.ts
git commit -m "docs: document China location catalog refresh"
```

### Task 4: Run project-wide validation

**Files:**
- Verify only; no source changes expected.

**Interfaces:**
- Confirms that generated static data compiles in Vite and existing application tests retain their contracts.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: exit code 0 with no failed tests.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Verify generated catalog and source metadata**

Run: `node -e "import('./src/data/china-locations.ts').then(({chinaProvinces, chinaCities}) => console.log(chinaProvinces.length, chinaCities.length))"`

Expected: nonzero province and city counts; browser source remains the generated static module.

- [ ] **Step 5: Confirm no task-owned uncommitted files**

```bash
git status --short
```

Expected: no task-owned uncommitted files; never stage or revert unrelated user work.
