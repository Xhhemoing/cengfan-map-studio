import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAssistantCapability, initialAssistantCapability } from "./assistant-capability";

afterEach(() => vi.unstubAllGlobals());
describe("assistant service capability", () => {
  it("declares a static site unavailable without making requests", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(initialAssistantCapability(true)).toMatchObject({ state: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([404, 405, 503])("does not treat HTTP %s as a configured service", async (status) => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status }); vi.stubGlobal("fetch", fetch);
    expect(await checkAssistantCapability()).toMatchObject({ state: "unavailable" });
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.objectContaining({ method: "GET" }));
  });
  it("requires explicit flags and distinguishes local fallback from a configured model", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ai: { agent: { primary: { configured: false }, localFallback: true } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ai: { agent: { fallback: { configured: true }, localFallback: true } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    expect((await checkAssistantCapability()).state).toBe("local-only");
    expect((await checkAssistantCapability()).state).toBe("remote");
    expect((await checkAssistantCapability()).state).toBe("unavailable");
  });
  it("rejects an HTML fallback even when its HTTP status is 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("HTML"); } }));
    expect((await checkAssistantCapability()).state).toBe("unavailable");
  });
});
