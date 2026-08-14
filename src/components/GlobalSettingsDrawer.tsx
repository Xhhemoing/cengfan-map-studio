import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./StudioUi";

export interface GlobalSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function GlobalSettingsDrawer({
  open,
  onClose,
  title = "全局设置",
  children,
}: GlobalSettingsDrawerProps) {
  if (!open) return null;

  return (
    <div className="global-settings-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="global-settings-drawer__backdrop" onClick={onClose} />
      <div className="global-settings-drawer__panel">
        <div className="global-settings-drawer__header">
          <strong>{title}</strong>
          <IconButton label="关闭" icon={<X size={16} />} variant="ghost" onClick={onClose} />
        </div>
        <div className="global-settings-drawer__content">{children}</div>
      </div>
    </div>
  );
}
