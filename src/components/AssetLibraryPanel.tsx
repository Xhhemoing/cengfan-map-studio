import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ComponentProps } from "react";
import { AssetPanel } from "./AssetPanel";
import { IconButton, PanelHeader } from "./StudioUi";

export type AssetLibraryPanelProps = ComponentProps<typeof AssetPanel> & {
  defaultCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
};

const STORAGE_KEY = "cengfan-map-studio:asset-library-collapsed";

function readCollapsed(defaultValue: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

export function AssetLibraryPanel({
  defaultCollapsed = false,
  onCollapseChange,
  ...assetPanelProps
}: AssetLibraryPanelProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(defaultCollapsed));

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
    onCollapseChange?.(next);
  };

  if (collapsed) {
    return (
      <aside className="asset-library-panel asset-library-panel--collapsed" aria-label="素材库（已折叠）">
        <div className="asset-library-panel__header">
          <IconButton
            label="展开素材库"
            icon={<ChevronRight size={16} />}
            variant="ghost"
            onClick={toggle}
          />
        </div>
        <div className="asset-library-panel__icon-hint" aria-hidden>
          素
        </div>
      </aside>
    );
  }

  return (
    <aside className="asset-library-panel" aria-label="素材库">
      <PanelHeader
        title="素材库"
        actions={
          <IconButton
            label="折叠素材库"
            icon={<ChevronLeft size={16} />}
            variant="ghost"
            onClick={toggle}
          />
        }
      />
      <div className="asset-library-panel__content">
        <AssetPanel {...assetPanelProps} />
      </div>
    </aside>
  );
}
