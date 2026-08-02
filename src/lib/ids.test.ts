import { describe, expect, it, vi } from "vitest";
import { createId } from "./ids";

describe("createId", () => {
  it("creates a usable id when randomUUID is unavailable", () => {
    const randomUuid = globalThis.crypto.randomUUID;
    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: undefined });

    expect(createId("student")).toMatch(/^student-[a-z0-9-]+$/);

    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: randomUuid });
  });
});