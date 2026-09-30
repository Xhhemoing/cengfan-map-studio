// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseReadyStep, JEV_ENDPOINT, resolveJevConfig, type JevConfig } from "./jev-decision";
import type { TaskStep } from "./task-plan";

const config: JevConfig = { apiKey: "test-key", model: "jev-latest", timeoutMs: 100, minConfidence: 0.85 };
const steps: TaskStep[] = [
  { id: "private-id-a", title: "private-student-name", tool: "inspect_project", arguments: { path: "private-data" }, dependsOn: [] },
  { id: "private-id-b", title: "private-goal", tool: "check_health", arguments: {}, dependsOn: [] },
];
function payload(confidence = 0.95, choice = "option_1") {
  return { answers: { next_step: { type: "choice", choice, confidence, probabilities: { option_0: 0.05, option_1: 0.95 } } } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("opt-in Jev decision boundary", () => {
  it("is disabled without both explicit provider and independent key", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(resolveJevConfig({ JEV_API_KEY: "key" })).toBeUndefined();
    expect(resolveJevConfig({ AI_DECISION_PROVIDER: "jev" })).toBeUndefined();
    expect((await chooseReadyStep(steps)).source).toBe("deterministic");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends only code-owned metadata to the official endpoint", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => payload() })); vi.stubGlobal("fetch", fetchMock);
    expect(await chooseReadyStep(steps, config)).toMatchObject({ source: "jev", stepId: "private-id-b" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect(String(init.body)).not.toContain("private-");
    expect(String(init.body)).not.toContain("test-key");
    expect(init.redirect).toBe("error");
  });
  it("falls back on low confidence, unknown choices, invalid probabilities and HTTP errors", async () => {
    const invalid = [payload(0.4), payload(0.99, "execute_anything"), {}, { answers: { next_step: { ...payload().answers.next_step, probabilities: { option_0: 9, option_1: 9 } } } }];
    for (const value of invalid) {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => value })));
      expect(await chooseReadyStep(steps, config)).toMatchObject({ source: "deterministic", stepId: steps[0]!.id });
    }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect((await chooseReadyStep(steps, config)).source).toBe("deterministic");
  });
  it("enforces a deadline even when the transport ignores abort", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const pending = chooseReadyStep(steps, config);
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toMatchObject({ source: "deterministic", reason: "timeout" });
  });
  it("propagates cancellation rather than executing a fallback choice", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const controller = new AbortController();
    const pending = chooseReadyStep(steps, config, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: "AI_ABORTED" });
    controller.abort(); await assertion;
  });
  it("does not spend a remote call for a single ready step", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await chooseReadyStep(steps.slice(0, 1), config)).chargedTokens).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
