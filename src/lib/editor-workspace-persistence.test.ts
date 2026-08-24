import { describe, expect, it } from "vitest";
import {
  describeForceSaveOutcome,
  isFresherWorkspace,
  loadStoredProject,
  shouldSaveOnPageLeave,
} from "./editor-workspace-persistence";
import { createSampleProject, type ProjectStore, type ProjectStoreHealth, type StoredProject } from "./project-store";

function stubStore(options: {
  health: ProjectStoreHealth;
  get: (id: string) => Promise<StoredProject | null>;
  healthAfterRead?: ProjectStoreHealth;
}): ProjectStore {
  let health = options.health;
  return {
    get health() {
      return health;
    },
    async list() {
      return [];
    },
    async get(id) {
      const record = await options.get(id);
      if (options.healthAfterRead) health = options.healthAfterRead;
      return record;
    },
    async put() {},
    async remove() {},
  };
}

describe("loadStoredProject", () => {
  it("reports a genuine miss on a healthy store", async () => {
    const outcome = await loadStoredProject(stubStore({ health: "persistent", get: async () => null }), "gone");

    expect(outcome).toEqual({
      status: "missing",
      observation: { reason: "not-found", healthAtRequest: "persistent", health: "persistent" },
    });
  });

  it("keeps the degraded health of both ends of the read", async () => {
    const outcome = await loadStoredProject(stubStore({ health: "memory", get: async () => null }), "unknown");

    expect(outcome.status).toBe("missing");
    expect(outcome.status === "missing" && outcome.observation.health).toBe("memory");
  });

  it("records a database that dropped while the read was in flight", async () => {
    const store = stubStore({ health: "persistent", healthAfterRead: "memory", get: async () => null });

    const outcome = await loadStoredProject(store, "unknown");

    expect(outcome.status === "missing" && outcome.observation).toEqual({
      reason: "not-found",
      healthAtRequest: "persistent",
      health: "memory",
    });
  });

  it("treats a rejected read as unreadable rather than missing", async () => {
    const store = stubStore({ health: "persistent", get: async () => { throw new Error("boom"); } });

    const outcome = await loadStoredProject(store, "any");

    expect(outcome.status === "missing" && outcome.observation.reason).toBe("read-failed");
  });

  it("treats a record that cannot be parsed as unreadable, not deleted", async () => {
    const broken = { ...createSampleProject(), pack: { nope: true } as unknown as StoredProject["pack"] };
    const store = stubStore({ health: "persistent", get: async () => broken });

    const outcome = await loadStoredProject(store, broken.id);

    expect(outcome.status === "missing" && outcome.observation.reason).toBe("read-failed");
  });

  it("returns the restored package alongside the record", async () => {
    const sample = createSampleProject();
    const store = stubStore({ health: "persistent", get: async () => sample });

    const outcome = await loadStoredProject(store, sample.id);

    expect(outcome.status).toBe("loaded");
    expect(outcome.status === "loaded" && outcome.restored.project.students.length).toBe(sample.pack.project.students.length);
  });
});

describe("describeForceSaveOutcome", () => {
  it("separates a full save, a record-only failure and a dead local store", () => {
    expect(describeForceSaveOutcome("saved", null)).toContain("强制保存完成");
    expect(describeForceSaveOutcome("failed", "quota")).toContain("项目记录写入失败（quota）");
    expect(describeForceSaveOutcome("failed", null)).toContain("浏览器本地存储不可写");
  });
});

describe("shouldSaveOnPageLeave", () => {
  const pending = {
    projectId: "proj-1",
    loading: false,
    missing: false,
    navigatingBack: false,
    syncStatus: "pending" as const,
    hasLocalEdits: false,
  };

  it("saves pending edits and unsynced local edits", () => {
    expect(shouldSaveOnPageLeave(pending)).toBe(true);
    expect(shouldSaveOnPageLeave({ ...pending, syncStatus: "saved", hasLocalEdits: true })).toBe(true);
    expect(shouldSaveOnPageLeave({ ...pending, syncStatus: "saved" })).toBe(false);
  });

  it("never writes over a project it has not finished opening", () => {
    expect(shouldSaveOnPageLeave({ ...pending, loading: true })).toBe(false);
    expect(shouldSaveOnPageLeave({ ...pending, missing: true })).toBe(false);
    expect(shouldSaveOnPageLeave({ ...pending, projectId: null })).toBe(false);
    expect(shouldSaveOnPageLeave({ ...pending, navigatingBack: true })).toBe(false);
  });
});

describe("isFresherWorkspace", () => {
  it("adopts a strictly newer snapshot only", () => {
    expect(isFresherWorkspace(undefined, "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(isFresherWorkspace("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toBe(true);
    expect(isFresherWorkspace("2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(false);
    expect(isFresherWorkspace("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(false);
    expect(isFresherWorkspace("2026-01-01T00:00:00.000Z", "not-a-date")).toBe(false);
  });
});
