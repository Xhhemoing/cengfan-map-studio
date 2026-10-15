import { resolveStudentLocation } from "../../lib/student-data";
import { DeliveryCheckSection } from "./DeliveryCheckSection";
import type { DeliveryRailProps } from "./DeliveryWorkspace";

type DeliveryChecksProps = Pick<DeliveryRailProps, "project" | "dataIssues" | "layoutIssues" | "resourceIssues" | "fontIssues" | "onLocate" | "onEditRoster">;

export function DeliveryChecks({ project, dataIssues, layoutIssues, resourceIssues, fontIssues, onLocate, onEditRoster }: DeliveryChecksProps) {
  const dataWarnings = dataIssues.filter((issue) => issue.severity === "warning");
  const dataNotes = dataIssues.filter((issue) => issue.severity === "info");
  const warningCount = dataWarnings.length + layoutIssues.length + resourceIssues.length + fontIssues.length;
  const visibleStudents = project.students.filter((student) => student.visibility !== false);
  const rosterState = project.students.length === 0 ? "empty" : visibleStudents.length === 0 ? "hidden" : "visible";
  const provinceCount = new Set(visibleStudents.map((student) => student.province?.trim() || resolveStudentLocation(student).province).filter(Boolean)).size;

  return <section className="delivery-workspace__check-results" aria-label="检查结果">
    {rosterState !== "visible" && <div className="delivery-workspace__roster-notice" data-roster-state={rosterState}>
      <strong>{rosterState === "empty" ? "当前是空白模板" : "当前海报不显示学生"}</strong>
      <p>{rosterState === "empty"
        ? "名单还没有学生。如需制作毕业去向图，请先完善名单；也可以导出空白模板或工程包备份。"
        : `完整名单有 ${project.students.length} 人，目前全部隐藏。请确认这是预期的展示范围；工程包仍保存完整名单。`}</p>
      {onEditRoster && <button type="button" className="secondary-button" onClick={onEditRoster}>{rosterState === "empty" ? "完善名单" : "检查名单可见性"}</button>}
    </div>}
    {warningCount === 0 && rosterState === "visible" && <p className="delivery-workspace__all-clear" role="status">
      {dataNotes.length ? "没有待处理问题" : "检查全部通过"}：{visibleStudents.length} 人 · 覆盖 {provinceCount} 个省市。
      {dataNotes.length > 0 && `另有 ${dataNotes.length} 项数据说明，请确认展示范围。`}
    </p>}
    {warningCount > 0 && <p className="delivery-workspace__pending-summary">{warningCount} 项待处理，建议导出前检查。可展开各项查看对象与原因。</p>}
    <div className="delivery-workspace__check-list">
      <DeliveryCheckSection project={project} title="数据完整性" issues={dataWarnings.map((issue) => ({ kind: "data", issue }))} onLocate={onLocate} emptyLabel={project.students.length === 0 && dataWarnings.length === 0 ? "暂无名单" : undefined} />
      <DeliveryCheckSection project={project} title="排版问题" issues={layoutIssues.map((issue) => ({ kind: "layout", issue }))} onLocate={onLocate} />
      <DeliveryCheckSection project={project} title="资源缺失" issues={resourceIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      <DeliveryCheckSection project={project} title="字体问题" issues={fontIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      {dataNotes.length > 0 && <DeliveryCheckSection project={project} title="数据说明" issues={dataNotes.map((issue) => ({ kind: "data", issue }))} onLocate={onLocate} informational />}
    </div>
  </section>;
}
