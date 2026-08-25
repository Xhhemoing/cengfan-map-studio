import { ChevronDown, RefreshCw } from "lucide-react";
import { useRef } from "react";
import {
  CARD_LAYOUT_MODE_OPTIONS,
  cardLayoutModeLabel,
} from "../../lib/card-layout-modes";
import { normalizeLayoutMode, type CardLayoutModeValue } from "../../lib/scene-document";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import "./LayoutRecalcMenu.css";

export interface LayoutRecalcMenuProps {
  layoutMode?: CardLayoutModeValue;
  onRecalc: (mode?: CardLayoutModeValue) => void;
}

/**
 * 五个制作阶段共用的顶栏重算控件：主按钮按当前算法刷新位置，
 * 右侧箭头打开算法清单，点一项即切换算法并重算。
 */
export function LayoutRecalcMenu({ layoutMode, onRecalc }: LayoutRecalcMenuProps) {
  const current = normalizeLayoutMode(layoutMode);
  const currentLabel = cardLayoutModeLabel(current);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const pick = (mode: CardLayoutModeValue) => {
    menuRef.current?.removeAttribute("open");
    onRecalc(mode);
  };

  return (
    <ToolbarGroup label="重算展示框" className="layout-recalc">
      <ToolbarButton
        label="刷新展示框位置"
        title={`刷新展示框位置（当前：${currentLabel}）`}
        icon={<RefreshCw size={18} />}
        data-stage-action="refresh-display-frame-positions"
        onClick={() => onRecalc()}
      />
      <details ref={menuRef} className="layout-recalc__menu">
        <summary
          className="toolbar-button icon-button layout-recalc__toggle"
          aria-label="选择排布算法"
          title="选择排布算法"
        >
          <ChevronDown size={16} />
        </summary>
        <div className="layout-recalc__popover" role="menu" aria-label="排布算法">
          <p className="layout-recalc__current">当前：{currentLabel}</p>
          {CARD_LAYOUT_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === current}
              data-layout-mode={option.id}
              onClick={() => pick(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </details>
    </ToolbarGroup>
  );
}
