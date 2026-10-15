import type { ProjectTransaction } from "../../lib/project-document";
import { createCardLayoutProposalTransaction } from "../../lib/card-layout-proposals";
import type { CardLayoutOptimizationController } from "../../lib/use-card-layout-optimization";
import { CardLayoutOptimizationPanel } from "../workspaces/CardLayoutOptimizationPanel";

export function EditorLayoutOptimization({ controller, canEdit, onCommit, onPreviewStart, reportStatus }: {
  controller: CardLayoutOptimizationController;
  canEdit: boolean;
  onCommit: (transaction: ProjectTransaction) => void;
  onPreviewStart: () => void;
  reportStatus: (message: string) => void;
}) {
  return <CardLayoutOptimizationPanel
    canEdit={canEdit}
    controller={{ ...controller,
      generate: () => { onPreviewStart(); return controller.generate(); },
      preview: (id) => { onPreviewStart(); controller.preview(id); },
    }}
    onApply={(proposal) => onCommit(createCardLayoutProposalTransaction(proposal, (applied) => {
      if (applied) controller.clear();
      reportStatus(applied ? "已应用排布方案，可撤销恢复" : "项目已变化，请重新生成方案");
    }))}
  />;
}
