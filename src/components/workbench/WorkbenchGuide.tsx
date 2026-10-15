import { ArrowRight, FileSpreadsheet, MapPinned, PackageCheck } from "lucide-react";

/** Keep the making path available without competing with returning users' projects. */
export function WorkbenchGuide() {
  return (
    <details className="workbench-guide">
      <summary>第一次制作？看看从名单到成品的三个步骤 <ArrowRight size={16} aria-hidden="true" /></summary>
      <ol>
        <li><FileSpreadsheet size={20} aria-hidden="true" /><div><strong>准备名单</strong><p>新建项目，在「名单」中导入 Excel、CSV 或粘贴文本，检查姓名、院校和城市。</p></div></li>
        <li><MapPinned size={20} aria-hidden="true" /><div><strong>编辑地图</strong><p>选择地图与版式，调整卡片、文字和素材。也可以打开下方示例先体验。</p></div></li>
        <li><PackageCheck size={20} aria-hidden="true" /><div><strong>检查与交付</strong><p>在「交付」中检查问题，导出 PNG / SVG 成品，并导出工程包备份。</p></div></li>
      </ol>
      <p className="workbench-guide__storage">项目保存在当前浏览器中。换设备或清理浏览器前，请导出工程包；顶部「导入工程包」用于恢复项目。</p>
    </details>
  );
}
