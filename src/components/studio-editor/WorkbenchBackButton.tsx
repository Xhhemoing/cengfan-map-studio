import { ArrowLeft } from "lucide-react";

export function WorkbenchBackButton({ onClick }: { onClick?: () => void }) {
  const handleClick = onClick ?? (() => { window.location.hash = "#/"; });
  return (
    <button type="button" className="secondary-button" aria-label="返回项目列表" onClick={handleClick}>
      <ArrowLeft size={16} aria-hidden /> 返回列表
    </button>
  );
}
