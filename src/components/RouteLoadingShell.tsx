import { MapPinned } from "lucide-react";

/**
 * 路由代码块下载期间的稳定外壳。
 * 它只依赖入口已经加载的品牌基础组件，不读取项目数据，也不创建新的 store。
 */
export function RouteLoadingShell({ message }: { message: string }) {
  return (
    <main className="workbench-shell">
      <section role="status" className="workbench-loading">
        <div className="brand">
          <MapPinned size={24} />
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
          <em>Beta</em>
        </div>
        <p>{message}</p>
      </section>
    </main>
  );
}
