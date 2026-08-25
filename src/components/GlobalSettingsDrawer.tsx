import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "./StudioUi";

export interface GlobalSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function GlobalSettingsDrawer({
  open,
  onClose,
  title = "全局设置",
  children,
}: GlobalSettingsDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // While open: move focus into the dialog; on close/unmount restore it to the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLElement>(".global-settings-drawer__close") ?? panel;
    initial?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="global-settings-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
    >
      <div className="global-settings-drawer__backdrop" onClick={onClose} />
      <div className="global-settings-drawer__panel" ref={panelRef} tabIndex={-1}>
        <div className="global-settings-drawer__header">
          <strong id={titleId}>{title}</strong>
          <IconButton
            label={`关闭${title}`}
            icon={<X size={16} aria-hidden />}
            variant="ghost"
            className="global-settings-drawer__close"
            onClick={onClose}
          />
        </div>
        <div className="global-settings-drawer__content">{children}</div>
      </div>
    </div>
  );
}
