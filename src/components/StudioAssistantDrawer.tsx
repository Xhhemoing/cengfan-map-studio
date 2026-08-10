import { useEffect, useId, useRef, type ReactNode } from "react";
import Drawer from "@mui/material/Drawer";

export type StudioAssistantDrawerProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** Element to restore focus to (e.g. the topbar opener button) on close. */
  returnFocusTo?: HTMLElement | null;
};

/**
 * Topbar-opened drawer for the AI assistant and advanced functions. Escape and
 * backdrop clicks are handled by MUI's Modal (via `onClose`); the labelled
 * close button returns focus to the opener on close.
 */
export function StudioAssistantDrawer({
  open,
  onClose,
  label,
  children,
  returnFocusTo,
}: StudioAssistantDrawerProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open && returnFocusTo) {
      returnFocusTo.focus();
    }
  }, [open, returnFocusTo]);

  return (
    <Drawer
      className="studio-assistant-drawer"
      anchor="right"
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      slotProps={{
        paper: { className: "studio-assistant-drawer__paper" },
      }}
    >
      <div className="studio-assistant-drawer__head">
        <strong id={titleId}>{label}</strong>
        <button
          ref={closeButtonRef}
          type="button"
          className="studio-assistant-drawer__close"
          aria-label={`关闭${label}`}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="studio-assistant-drawer__body">{children}</div>
    </Drawer>
  );
}
