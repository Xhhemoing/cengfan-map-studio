import { Bot } from "lucide-react";
import type { RefObject } from "react";

export function EditorAssistantEntry({ buttonRef, open, onOpen }: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="打开AI助手与高级功能"
      aria-expanded={open}
      onClick={onOpen}
    >
      <Bot size={17} />
    </button>
  );
}
