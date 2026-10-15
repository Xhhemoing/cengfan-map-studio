import { createCardLayoutProposals, type CardLayoutProposalRequest } from "../lib/card-layout-proposals";
import type { ProjectDocument } from "../lib/project-document";

self.onmessage = (event: MessageEvent<{ project: ProjectDocument; request: CardLayoutProposalRequest }>) => {
  try {
    self.postMessage({ proposals: createCardLayoutProposals(event.data.project, event.data.request) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "无法生成排布方案" });
  }
};
