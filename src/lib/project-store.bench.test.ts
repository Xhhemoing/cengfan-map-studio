import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbProjectStore } from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackageEnvelope } from "./project-package";

describe.skipIf(process.env.PROJECT_LIST_BENCH !== "1")("project list benchmark", () => {
  it("reports five-run list medians for 5 MiB project packs", async () => {
    const count = Number(process.env.PROJECT_LIST_BENCH_COUNT ?? "10");
    const payload = "A".repeat(5 * 1024 * 1024);
    const store = createIndexedDbProjectStore(new IDBFactory());
    for (let index = 0; index < count; index += 1) {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      await store.put({
        id: `bench-${index}`,
        name: `Benchmark ${index}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        pack: createProjectPackageEnvelope({
          project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
          assets: [{
            id: `asset-${index}`,
            label: "5 MiB benchmark asset",
            kind: "background",
            src: `data:application/octet-stream;base64,${payload}`,
            provinceIds: [],
            source: "user",
          }],
          fonts: [],
          customTemplates: [],
          renderSettings: { mode: "normal", fixedFps: 20 },
          now: new Date(timestamp),
        }),
      });
    }

    await store.list();
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      expect(await store.list()).toHaveLength(count);
      runs.push(performance.now() - started);
    }
    const sorted = [...runs].sort((a, b) => a - b);
    console.info("PROJECT_LIST_BENCH", JSON.stringify({
      count,
      runsMs: runs.map((value) => Number(value.toFixed(3))),
      medianMs: Number(sorted[2]!.toFixed(3)),
    }));
  }, 120_000);
});
