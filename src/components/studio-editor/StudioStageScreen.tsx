import { STAGE_METADATA } from "../../lib/stage-metadata";
import { StudioLayoutTemplate, type StudioLayoutTemplateProps } from "../StudioLayoutTemplate";
import { buildStageSlots, type StageSlotsContext } from "./stage-slots";
import { SkipToStageLink } from "./SkipToStageLink";
import { STUDIO_STAGE_TARGET_ID } from "./stage-target";

export type StudioStageScreenProps = Omit<
  StudioLayoutTemplateProps,
  "stageActions" | "rightRail" | "rightRailLabel" | "children"
> & {
  /** App 组合出的阶段上下文（数据、派生检查与命令回调）。 */
  ctx: StageSlotsContext;
};

/**
 * 聚焦阶段页面：跳转链接 + 布局模板 + 按阶段分派的槽位。
 * 组件边界让 buildStageSlots 在此处渲染期执行；App 仅以 JSX prop 传递
 * 上下文（其中的 posterRef 只被转发进 JSX，不在渲染期读取 current）。
 */
export function StudioStageScreen({ ctx, stage, ...template }: StudioStageScreenProps) {
  const slots = buildStageSlots(stage, ctx);
  return (
    <>
      <SkipToStageLink />
      <StudioLayoutTemplate
        {...template}
        stage={stage}
        stageActions={slots.stageActions}
        rightRail={slots.rightRail}
        rightRailLabel={STAGE_METADATA[stage].rightRailLabel}
      >
        {/* display:contents 的跳转落点：不产生布局盒，键盘焦点仍可落位（工作区自身的 main 归各阶段组件所有）。 */}
        <div id={STUDIO_STAGE_TARGET_ID} tabIndex={-1} style={{ display: "contents" }}>
          {slots.workspace}
        </div>
      </StudioLayoutTemplate>
    </>
  );
}
