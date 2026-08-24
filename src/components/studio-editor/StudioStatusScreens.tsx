import { MapPinned } from "lucide-react";

/** 顶栏品牌标识（加载壳、全局设置页与旧版编辑器共用同一份标记）。 */
export function StudioBrand() {
  return (
    <div className="brand">
      <MapPinned size={24} aria-hidden />
      <span className="brand-label brand-label__full">蹭饭地图工作室</span>
      <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
      <em>Beta</em>
    </div>
  );
}

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
