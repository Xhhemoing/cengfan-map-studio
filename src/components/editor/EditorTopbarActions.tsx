/**
 * 顶栏右侧的项目动作簇:返回工作台、导出与工程、帮助与反馈、界面主题。
 * 三个阶段外壳共用同一份装配,App 只交出节点与外观状态。
 */
import type { ReactNode } from "react";
import type { ResolvedTheme, StudioSkin, ThemeMode } from "../../lib/theme";
import { HelpFeedbackMenu } from "../HelpFeedbackMenu";
import { SkinSelector } from "../SkinSelector";
import { ToolbarGroup } from "../StudioUi";
import { ThemeToggle } from "../ThemeToggle";

export interface EditorAppearanceControls {
  skin: StudioSkin;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onSkinChange: (skin: StudioSkin) => void;
  onThemeChange: (mode: ThemeMode) => void;
}

export interface EditorTopbarActionsProps {
  backButton: ReactNode;
  exportActions: ReactNode;
  appearance: EditorAppearanceControls;
  onCopyEnvironment: () => void;
}

export function EditorTopbarActions({
  backButton,
  exportActions,
  appearance,
  onCopyEnvironment,
}: EditorTopbarActionsProps) {
  return (
    <>
      {backButton}
      {exportActions}
      <ToolbarGroup label="帮助与反馈">
        <HelpFeedbackMenu onCopyEnvironment={onCopyEnvironment} />
      </ToolbarGroup>
      <ToolbarGroup label="界面主题" className="topbar-action-group--theme">
        <SkinSelector skin={appearance.skin} onChange={appearance.onSkinChange} />
        <ThemeToggle mode={appearance.themeMode} resolvedTheme={appearance.resolvedTheme} onChange={appearance.onThemeChange} />
      </ToolbarGroup>
    </>
  );
}
