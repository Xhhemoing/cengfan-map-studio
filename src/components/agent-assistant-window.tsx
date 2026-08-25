import { useEffect, useRef, type ReactNode } from "react";
import { Minus, Plus, Sparkles, X } from "lucide-react";
import { useAssistantConversationState } from "./agent-assistant-model";

const PANEL_WIDTH = 390;
const HEADER_MIN_VISIBLE = 52;

/** 悬浮窗外壳：标题栏动作 + 指针拖拽（键盘等价物为「重置窗口位置」按钮）。位置状态存在会话 Provider，最小化后仍保留。 */
export function AgentAssistantWindow({
  onNewConversation,
  onMinimize,
  onClose,
  children,
}: {
  onNewConversation: () => void;
  onMinimize: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { position, setPosition } = useAssistantConversationState();
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const clamp = () => {
      setPosition((current) => current ? {
        x: Math.max(0, Math.min(current.x, Math.max(0, window.innerWidth - PANEL_WIDTH))),
        y: Math.max(0, Math.min(current.y, Math.max(0, window.innerHeight - HEADER_MIN_VISIBLE))),
      } : current);
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [position, setPosition]);

  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, label, textarea")) return;
    const panel = event.currentTarget.closest(".agent-assistant-window") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setPosition({ x: Math.max(0, rect.left), y: Math.max(0, rect.top) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.max(0, Math.min(event.clientX - drag.offsetX, Math.max(0, window.innerWidth - PANEL_WIDTH)));
    const y = Math.max(0, Math.min(event.clientY - drag.offsetY, Math.max(0, window.innerHeight - HEADER_MIN_VISIBLE)));
    setPosition({ x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  return (
    <section
      className="agent-assistant-window"
      role="dialog"
      aria-label="AI 助手"
      style={position ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto" } : undefined}
    >
      <header className="agent-assistant-header" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span><Sparkles size={16} aria-hidden /> AI 助手</span>
        <div className="agent-assistant-header-actions">
          <button type="button" title="新建对话" aria-label="新建对话" onClick={onNewConversation}><Plus size={15} aria-hidden /></button>
          <button type="button" title="最小化 AI 助手" aria-label="最小化 AI 助手" onClick={onMinimize}><Minus size={15} aria-hidden /></button>
          <button type="button" title="重置窗口位置" aria-label="重置窗口位置" onClick={() => setPosition(null)}><Sparkles size={15} aria-hidden /></button>
          <button type="button" title="关闭 AI 助手" aria-label="关闭 AI 助手" onClick={onClose}><X size={15} aria-hidden /></button>
        </div>
      </header>
      {children}
    </section>
  );
}
