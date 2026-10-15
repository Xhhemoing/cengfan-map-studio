import { useRef, useState, type ReactNode } from "react";
import type { UserAsset } from "../lib/assets";
import type { ProjectDocument } from "../lib/project-document";
import { loadAssistantConversationState } from "../lib/agent-conversation-store";
import { AssistantConversationContext, browserStorage, restoreConversation, type AssistantConversation, type Mode } from "./agent-assistant-state";

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("conservative");
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const hydrate = (project: ProjectDocument, assets: UserAsset[]) => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const storage = browserStorage();
    const saved = storage ? loadAssistantConversationState(storage, project) : null;
    if (saved) {
      setMode(saved.mode);
      setActiveId(saved.activeId);
      setConversations(saved.conversations.map((record) => restoreConversation(project, assets, record)));
    }
    setHydrated(true);
  };
  return <AssistantConversationContext.Provider value={{ open, setOpen, mode, setMode, conversations, setConversations, activeId, setActiveId, position, setPosition, hydrated, hydrate }}>{children}</AssistantConversationContext.Provider>;
}
