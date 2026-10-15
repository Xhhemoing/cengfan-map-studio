import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AgentSession } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import type { UserFont } from "../lib/fonts";
import type { ProjectDocument } from "../lib/project-document";
import type { ResolvedProjectScene } from "../lib/resolved-scene";
import type { SceneSelection } from "../lib/scene-document";
import { rebaseTextSession, type AssistantConversation } from "./agent-assistant-state";

export function useAssistantSceneContext({ scene, userFonts, selection, contextStage, project, assets, conversations, setConversations, activeRunRef, projectGenerationRef, onPreview }: {
  scene?: ResolvedProjectScene | null;
  userFonts?: UserFont[];
  selection?: SceneSelection;
  contextStage?: string;
  project: ProjectDocument;
  assets: UserAsset[];
  conversations: AssistantConversation[];
  setConversations: Dispatch<SetStateAction<AssistantConversation[]>>;
  activeRunRef: MutableRefObject<AgentSession | null>;
  projectGenerationRef: MutableRefObject<number>;
  onPreview?: (project: ProjectDocument | null) => void;
}) {
  const previousFontRevision = useRef(scene?.fontRevision);
  const fontRevision = scene?.fontRevision;
  useEffect(() => {
    for (const conversation of conversations) {
      if (conversation.status === "running") continue;
      conversation.session.setTaskContext({ taskBrief: conversation.taskBrief, selection, stage: contextStage, userFonts, scene });
    }
    if (previousFontRevision.current === fontRevision) return;
    previousFontRevision.current = fontRevision;
    activeRunRef.current?.cancel();
    projectGenerationRef.current += 1;
    setConversations((current) => current.map((conversation) => {
      const session = rebaseTextSession(project, assets, conversation);
      session.setTaskContext({ taskBrief: conversation.taskBrief, selection, stage: contextStage, userFonts, scene });
      return { ...conversation, session, status: conversation.status === "running" || conversation.status === "completed" ? "draft" : conversation.status, steps: [], selectedStepIds: [], resumable: false, staleNotice: "字体测量已变化，旧提案已取消；任务目标与保留约束已保留，请重新规划。" };
    }));
    onPreview?.(null);
  }, [activeRunRef, assets, contextStage, conversations, fontRevision, onPreview, project, projectGenerationRef, scene, selection, setConversations, userFonts]);
}
