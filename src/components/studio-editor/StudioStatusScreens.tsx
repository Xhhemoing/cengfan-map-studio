import { MapPinned } from "lucide-react";
import { StudioBrand } from "./StudioBrand";

/** 项目模式的加载壳（IndexedDB 项目记录读取完成前显示）。 */
export function ProjectLoadingScreen() {
  return (
    <main className="workbench-shell">
      <section role="status" className="workbench-loading">
        <StudioBrand />
        <p>正在加载项目…</p>
      </section>
    </main>
  );
}

/** 项目链接失效（记录不存在或已删除）时的恢复指引。 */
export function ProjectMissingScreen() {
  return (
    <main className="workbench-shell">
      <section className="workbench-error workbench-error--recover" role="alert">
        <span className="workbench-brand-mark"><MapPinned size={22} aria-hidden /></span>
        <strong>项目不存在或已删除</strong>
        <p>这个链接指向的项目已经不在本机项目列表中了。可以回到项目列表继续编辑其他项目。</p>
        <div className="workbench-error-actions">
          <button type="button" className="primary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>
            返回项目列表
          </button>
        </div>
      </section>
    </main>
  );
}
