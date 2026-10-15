import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssistantStepDetail } from "./AssistantStepDetail";
import type { AgentStep } from "../lib/agent-session";

let unmount: (() => void) | undefined;
afterEach(() => unmount?.());
function render(result: Record<string, unknown>) {
  const container = document.createElement("div"); const root = createRoot(container); unmount = () => flushSync(() => root.unmount());
  const step: AgentStep = { id: "a", name: "update_cards", arguments: { patch: { fontSize: 600 } }, result: { id: "a", ok: true, content: JSON.stringify(result) }, risk: "low" };
  flushSync(() => root.render(<AssistantStepDetail step={step} />)); return container;
}
describe("factual proposal result", () => {
  it("shows actual values and clamping instead of echoing requested values", () => {
    const container = render({ diff: [{ path: "cards.fontSize", before: 12, after: 48, requested: 600, normalized: true }], measurementStatus: "estimated" });
    expect(container.textContent).toContain("字号：12 → 48");
    expect(container.textContent).toContain("允许值"); expect(container.textContent).toContain("仍为估算");
    expect(container.textContent).not.toContain("→ 600");
  });
  it("does not claim a change for no-op results and reports actual metrics", () => {
    const container = render({ noop: true, metrics: { before: { issueCount: 4 }, after: { issueCount: 4 } } });
    expect(container.textContent).toContain("无需修改"); expect(container.textContent).toContain("排版问题 4 → 4");
  });
});
