import { createCardLayoutProposals, type CardLayoutProposal, type CardLayoutProposalRequest } from "./card-layout-proposals";
import type { ProjectDocument } from "./project-document";

export interface CardLayoutProposalJob {
  result: Promise<CardLayoutProposal[]>;
  cancel: () => void;
}

/** One short-lived worker per explicit comparison. Cancellation actually stops its computation. */
export function requestCardLayoutProposals(project: ProjectDocument, request: CardLayoutProposalRequest): CardLayoutProposalJob {
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let rejectJob: (error: Error) => void = () => undefined;
  const result = new Promise<CardLayoutProposal[]>((resolve, reject) => {
    rejectJob = reject;
    const finish = (proposals?: CardLayoutProposal[], error?: Error) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      if (error) reject(error);
      else resolve(proposals ?? []);
    };
    if (typeof Worker !== "undefined") {
      try {
        worker = new Worker(new URL("../workers/card-proposals.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<{ proposals?: CardLayoutProposal[]; error?: string }>) => {
          finish(event.data.proposals, event.data.error ? new Error(event.data.error) : undefined);
        };
        worker.onerror = () => finish(undefined, new Error("排布计算未完成，请重试；当前项目未更改。"));
        worker.postMessage({ project: { ...project, history: { past: [], future: [] } }, request });
        return;
      } catch {
        worker?.terminate();
        worker = undefined;
      }
    }
    // Browsers without workers and deterministic DOM tests use the same pure engine.
    timer = setTimeout(() => {
      if (settled) return;
      try { finish(createCardLayoutProposals(project, request)); }
      catch (error) { finish(undefined, error instanceof Error ? error : new Error("无法生成排布方案")); }
    }, 0);
  });
  return {
    result,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      if (timer !== undefined) clearTimeout(timer);
      rejectJob(new DOMException("已取消排布计算", "AbortError"));
    },
  };
}
