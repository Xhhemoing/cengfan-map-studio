import { ArrowLeft } from "lucide-react";

/**
 * 编辑器顶栏的「返回列表」按钮。默认行为直接改 hash 回工作台;
 * 项目模式下由 App 传入 onClick,先把未保存的编辑落盘再离开。
 */
export function WorkbenchBackButton({ onClick }: { onClick?: () => void }) {
  const handleClick = onClick ?? (() => { window.location.hash = "#/"; });
  return (
    <button type="button" className="secondary-button" aria-label="返回项目列表" onClick={handleClick}>
      <ArrowLeft size={16} /> 返回列表
    </button>
  );
}
