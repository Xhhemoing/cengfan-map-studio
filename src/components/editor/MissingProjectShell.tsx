import { MapPinned } from "lucide-react";
import {
  resolveMissingProjectNotice,
  type MissingProjectObservation,
} from "../../lib/missing-project-notice";

/**
 * 项目记录读不回来时的恢复外壳。文案由 `resolveMissingProjectNotice` 依据
 * 观测(缺失 / 存储降级)决定;`data-missing-project` 与 `data-store-health`
 * 是降级模式回归测试的锚点,DOM 与旧的 App 内联分支逐字一致。
 */
export function MissingProjectShell({ observation }: { observation: MissingProjectObservation }) {
  const notice = resolveMissingProjectNotice(observation);
  return (
    <main className="workbench-shell">
      <section
        className="workbench-error workbench-error--recover"
        role="alert"
        data-missing-project={notice.kind}
        data-store-health={observation.health}
      >
        <span className="workbench-brand-mark"><MapPinned size={22} /></span>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
        <div className="workbench-error-actions">
          <button type="button" className="primary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>
            返回项目列表
          </button>
        </div>
      </section>
    </main>
  );
}
