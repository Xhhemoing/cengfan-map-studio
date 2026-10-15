import { describe, expect, it } from "vitest";
import { createSampleProject } from "./project-store";
import { createCardLayoutProposals, createCardLayoutProposalTransaction } from "./card-layout-proposals";
import { applyTransaction, undoTransaction } from "./project-document";
import { resolveProjectScene } from "./resolved-scene";
import { getCardScopeKey } from "./card-settings-scope";
import { getSceneTextMeasurer } from "./scene-text-measurement";

const sample = () => createSampleProject().pack.project;

describe("reviewable layout proposals", () => {
  it("produces at most three distinct real candidates without changing roster or typography", () => {
    const project = sample();
    const proposals = createCardLayoutProposals(project, { goal: "balanced" });
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.length).toBeLessThanOrEqual(3);
    const feasible = proposals.filter((proposal) => proposal.status === "feasible");
    expect(feasible.length).toBeGreaterThan(0);
    for (const proposal of feasible) {
      expect(proposal.project.students).toEqual(project.students);
      expect(proposal.project.cards.grouping).toBe(project.cards.grouping);
      expect(proposal.project.cards.fontSize).toBe(project.cards.fontSize);
      expect(proposal.project.cards.visibleFields).toEqual(project.cards.visibleFields);
      expect(proposal.metrics.overlapCount).toBe(0);
      expect(proposal.metrics.outOfBoundsCount).toBe(0);
      expect(proposal.metrics.minFontSize).toBeGreaterThan(0);
      expect(Object.keys(proposal.project.cards.positions ?? {})).toHaveLength(resolveProjectScene(project).cards.length);
    }
  });

  it("strict local scope leaves all other geometry and global policies unchanged", () => {
    const project = sample();
    const scene = resolveProjectScene(project);
    const target = scene.cards[0]!.group.key;
    const proposals = createCardLayoutProposals(project, { goal: "readable", scopeIds: [target], baseScene: scene });
    const proposal = proposals.find((candidate) => candidate.status === "feasible")!;
    expect(proposal).toBeDefined();
    expect(proposal.project.cards.layoutMode).toBe(project.cards.layoutMode);
    expect(proposal.project.cards.allowMapOverlap).toBe(project.cards.allowMapOverlap);
    for (const card of scene.cards.filter((card) => card.group.key !== target)) {
      expect(proposal.project.cards.positions?.[card.group.key]).toEqual({ x: card.placement.x, y: card.placement.y });
      expect(proposal.project.cards.positionSources?.[getCardScopeKey(project.cards, card.group.key)]).toBe("auto");
    }
  });

  it("locked positions stay fixed even when preserving manual positions is disabled", () => {
    const project = sample();
    const scene = resolveProjectScene(project);
    const card = scene.cards[0]!;
    project.cards.positions = { [card.group.key]: { x: card.placement.x, y: card.placement.y } };
    project.cards.positionSources = { [getCardScopeKey(project.cards, card.group.key)]: "manual" };
    project.cards.positionPolicies = { [getCardScopeKey(project.cards, card.group.key)]: "locked" };
    const proposals = createCardLayoutProposals(project, { goal: "balanced", preserveManual: false });
    for (const proposal of proposals.filter((candidate) => candidate.status === "feasible")) {
      expect(proposal.project.cards.positions?.[card.group.key]).toEqual(project.cards.positions[card.group.key]);
      expect(proposal.project.cards.positionPolicies?.[getCardScopeKey(project.cards, card.group.key)]).toBe("locked");
    }
    expect(proposals.some((candidate) => candidate.status === "feasible")).toBe(true);
  });

  it("does not turn an impossible locked conflict into an applicable result", () => {
    const project = sample();
    const ids = resolveProjectScene(project).cards.map((card) => card.group.key);
    project.cards.positions = Object.fromEntries(ids.map((id) => [id, { x: 50, y: 50 }]));
    project.cards.positionPolicies = Object.fromEntries(ids.map((id) => [getCardScopeKey(project.cards, id), "locked" as const]));
    const proposals = createCardLayoutProposals(project, { goal: "balanced" });
    expect(proposals.every((proposal) => proposal.status === "proven-infeasible")).toBe(true);
    expect(createCardLayoutProposalTransaction(proposals[0]!).apply(project)).toBe(project);
  });

  it("respects an explicit layout mode instead of substituting a different candidate", () => {
    const project = sample();
    const proposals = createCardLayoutProposals(project, { goal: "balanced", mode: "right-stack" });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.project.cards.layoutMode).toBe("right-stack");
  });

  it("keeps current text size and reports an incompatible readability floor", () => {
    const project = sample();
    project.cards.minFontSize = 40;
    const proposals = createCardLayoutProposals(project, { goal: "readable" });
    expect(proposals.every((proposal) => proposal.status === "proven-infeasible")).toBe(true);
    expect(proposals[0]!.diagnostics.some((issue) => issue.kind === "unreadable-text")).toBe(true);
    expect(proposals[0]!.project.cards.fontSize).toBe(project.cards.fontSize);
  });

  it("rejects stale object IDs rather than silently broadening scope", () => {
    expect(() => createCardLayoutProposals(sample(), { goal: "balanced", scopeIds: ["not-a-current-card"] })).toThrow("重新选择");
  });

  it("refuses stale project and stale font versions on actual application", () => {
    const project = sample();
    const proposal = createCardLayoutProposals(project, { goal: "balanced" }).find((candidate) => candidate.status === "feasible")!;
    const changed = { ...project, cards: { ...project.cards, fontSize: project.cards.fontSize + 1 } };
    expect(createCardLayoutProposalTransaction(proposal).apply(changed)).toBe(changed);
    const staleFont = { ...proposal, fontRevision: getSceneTextMeasurer().getVersion() + 1 };
    expect(createCardLayoutProposalTransaction(staleFont).apply(project)).toBe(project);
  });

  it("applies as a single undoable transaction with complete editable data", () => {
    const project = sample();
    const proposal = createCardLayoutProposals(project, { goal: "balanced" }).find((candidate) => candidate.status === "feasible")!;
    const committed = applyTransaction(project, createCardLayoutProposalTransaction(proposal));
    expect(committed.history.past).toHaveLength(project.history.past.length + 1);
    expect(committed.students).toEqual(project.students);
    const restored = undoTransaction(committed);
    expect(restored.cards).toEqual(project.cards);
    expect(restored.students).toEqual(project.students);
  });

  it("is deterministic for the same scene and request", () => {
    const project = sample();
    expect(createCardLayoutProposals(project, { goal: "balanced" })).toEqual(createCardLayoutProposals(project, { goal: "balanced" }));
  });
});
