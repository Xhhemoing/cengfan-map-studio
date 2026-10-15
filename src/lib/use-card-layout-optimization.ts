import { useEffect, useRef, useState } from "react";
import { requestCardLayoutProposals, type CardLayoutProposalJob } from "./card-layout-proposal-client";
import type { CardLayoutGoal, CardLayoutProposal } from "./card-layout-proposals";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import type { ResolvedProjectScene } from "./resolved-scene";
import type { UserFont } from "./fonts";

export interface CardLayoutOptimizationController {
  open: boolean;
  setOpen: (value: boolean) => void;
  goal: CardLayoutGoal;
  setGoal: (value: CardLayoutGoal) => void;
  scope: "all" | "selected";
  setScope: (value: "all" | "selected") => void;
  selectedCount: number;
  preserveManual: boolean;
  setPreserveManual: (value: boolean) => void;
  pending: boolean;
  error?: string;
  stale: boolean;
  proposals: CardLayoutProposal[];
  selectedId: string | null;
  selectedProposal: CardLayoutProposal | null;
  previewProject: ProjectDocument | null;
  generate: () => Promise<void>;
  preview: (id: string) => void;
  showOriginal: () => void;
  cancel: () => void;
  close: () => void;
  clear: () => void;
}

export function useCardLayoutOptimization(project: ProjectDocument, selection: SceneSelection, scene?: ResolvedProjectScene | null, userFonts?: UserFont[]): CardLayoutOptimizationController {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<CardLayoutGoal>("balanced");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [preserveManual, setPreserveManual] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [proposals, setProposals] = useState<CardLayoutProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const generation = useRef(0);
  const job = useRef<CardLayoutProposalJob | null>(null);
  const selectedIds = selection.type === "cards" && (!selection.scopeGrouping || selection.scopeGrouping === project.cards.grouping) ? selection.ids ?? [] : [];
  const scopeIds = scope === "selected" ? [...selectedIds].sort() : undefined;
  const revision = fingerprintProject(project);
  const requestKey = JSON.stringify([revision, scene?.fontRevision, goal, scope, scopeIds, preserveManual]);
  const stale = proposals.length > 0 && generatedKey !== requestKey;
  const selectedProposal = !stale ? proposals.find((proposal) => proposal.id === selectedId) ?? null : null;

  useEffect(() => () => {
    generation.current += 1;
    job.current?.cancel();
  }, [requestKey]);

  const cancel = () => {
    generation.current += 1;
    job.current?.cancel();
    job.current = null;
    setPending(false);
  };
  const clear = () => {
    cancel();
    setProposals([]);
    setSelectedId(null);
    setError(undefined);
  };
  const generate = async () => {
    cancel();
    if (scope === "selected" && selectedIds.length === 0) {
      setError("请先选中需要整理的展示框。");
      return;
    }
    const currentGeneration = generation.current;
    setPending(true);
    setPendingKey(requestKey);
    setError(undefined);
    setSelectedId(null);
    setProposals([]);
    try {
      const nextJob = requestCardLayoutProposals(project, { goal, scopeIds, preserveManual, userFonts, ...(scene?.revision === revision ? { baseScene: scene } : {}) });
      job.current = nextJob;
      const next = await nextJob.result;
      if (generation.current !== currentGeneration) return;
      setProposals(next);
      setGeneratedKey(requestKey);
      if (!next.length) setError("当前没有可整理的展示框，请先添加可见名单内容。");
    } catch (failure) {
      if (generation.current !== currentGeneration) return;
      if (!(failure instanceof DOMException && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "排布计算失败");
    } finally {
      if (generation.current === currentGeneration) {
        setPending(false);
        job.current = null;
      }
    }
  };

  return {
    open, setOpen, goal, setGoal, scope, setScope, selectedCount: selectedIds.length,
    preserveManual, setPreserveManual, pending: pending && pendingKey === requestKey, error, stale, proposals, selectedId,
    selectedProposal,
    previewProject: selectedProposal ? { ...selectedProposal.project, history: project.history } : null,
    generate,
    preview: (id) => { if (!stale) setSelectedId(id); },
    showOriginal: () => setSelectedId(null),
    cancel,
    clear,
    close: () => { clear(); setOpen(false); },
  };
}
