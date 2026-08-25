import { MapPinned } from "lucide-react";

/**
 * 项目模式下 IndexedDB 记录还没读回来时的加载外壳。
 * DOM 与文案与旧的 App 内联分支逐字一致:`role="status"` 是可访问性契约,
 * 「正在加载项目…」是加载态的唯一断言锚点。
 */
export function ProjectLoadingShell() {
  return (
    <main className="workbench-shell">
      <section role="status" className="workbench-loading">
        <div className="brand">
          <MapPinned size={24} />
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
          <em>Beta</em>
        </div>
        <p>正在加载项目…</p>
      </section>
    </main>
  );
}
