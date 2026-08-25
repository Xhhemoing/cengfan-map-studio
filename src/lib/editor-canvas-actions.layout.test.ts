// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorCanvasActions } from "./editor-canvas-actions";
import { applyTransaction, createProjectDocument, type ProjectTransaction } from "./project-document";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("refreshDisplayFramePositions with a layout algorithm", () => {
  it("applies a chosen layout algorithm and clears positions in one step", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { "card-1": { x: 5, y: 6 } } } }),
    });
    const transactions: ProjectTransaction[] = [];
    const messages: string[] = [];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const actions = createEditorCanvasActions({
      project,
      selection: { type: "canvas" },
      readCardPositions: () => ({ "card-1": { x: 11, y: 22 } }),
      clearCardPositions: () => undefined,
      commitProject: () => undefined,
      commitTransaction: (transaction) => transactions.push(transaction),
      setSelection: () => undefined,
      setStatusMessage: (message) => messages.push(message),
      snap: (x, y) => ({ x, y }),
    });

    actions.refreshDisplayFramePositions("right-stack");

    expect(transactions[0]!.label).toBe("按右侧单列重算展示框");
    expect(transactions[0]!.apply(project).cards).toMatchObject({ layoutMode: "right-stack", positions: {} });
    expect(messages).toEqual(["已按右侧单列重算展示框位置"]);
  });
});
