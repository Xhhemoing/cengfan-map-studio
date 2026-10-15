import { RefreshCw } from "lucide-react";
import { templatePickerProps } from "../../lib/editor-template-actions";
import { CardScopeInspector } from "../inspector/CardScopeInspector";
import { ToolbarButton } from "../StudioUi";
import { ReferenceCardStyleRail, ReferenceCardStyleWorkspace } from "../workspaces/ReferenceCardStyleWorkspace";
import type { StageSlots } from "../StudioLayoutTemplate";
import type { StageLayoutScreenProps } from "./StageLayoutScreen";

export function createFrameStageSlots(props: StageLayoutScreenProps): StageSlots {
  const { renderProject: project, selection, userFonts, onPatch, onReset } = props;
  const framePicker = templatePickerProps(props.templateActions);
  const ids = selection.type === "cards" && (!selection.scopeGrouping || selection.scopeGrouping === project.cards.grouping) ? selection.ids ?? [] : [];
  return {
    stageActions: <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={props.onRefreshPositions} />,
    rightRail: <ReferenceCardStyleRail
      project={project}
      cards={project.cards}
      userFonts={userFonts}
      onPatch={(patch) => onPatch({ type: "cards" }, patch)}
      onResetCards={() => onReset({ type: "cards" })}
      templates={framePicker.templates}
      currentTemplateId={framePicker.currentTemplateId}
      customTemplates={framePicker.customTemplates}
      onApplyTemplate={framePicker.onApplyTemplate}
      onApplyCustomTemplate={framePicker.onApplyCustomTemplate}
      onSaveTemplate={framePicker.onSaveTemplate}
      optimizationPanel={props.optimizationPanel}
      scopedInspector={<CardScopeInspector
        key={`${project.cards.grouping}:${ids.join("|")}`}
        cards={project.cards}
        ids={ids}
        userFonts={userFonts}
        onPatch={onPatch}
        onReset={onReset}
      />}
    />,
    workspace: <ReferenceCardStyleWorkspace
      project={project}
      selection={selection}
      userFonts={userFonts}
      onSelect={props.onSelect}
      onMoveCard={props.onMoveCard}
      onMoveGuests={props.onMoveGuests}
      onCardPositionsResolved={props.onCardPositionsResolved}
      onSceneResolved={props.onSceneResolved}
    />,
  };
}
