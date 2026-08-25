import type { Ref } from "react";
import { Bot } from "lucide-react";

/** 顶栏的 AI 助手入口。ref 由壳层持有，用于抽屉关闭后把焦点还回来。 */
export function AssistantEntryButton({
  buttonRef,
  expanded,
  onOpen,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  expanded: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="打开AI助手与高级功能"
      aria-expanded={expanded}
      onClick={onOpen}
    >
      <Bot size={17} />
    </button>
  );
}
