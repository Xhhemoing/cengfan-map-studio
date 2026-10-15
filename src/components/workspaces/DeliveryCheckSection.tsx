import { CheckCircle2, ChevronDown, Info, TriangleAlert } from "lucide-react";
import type { ProjectDocument } from "../../lib/project-document";
import type { DeliveryIssue } from "./DeliveryWorkspace";
import "./delivery-checks.css";

const fieldLabels: Record<string, string> = { title: "标题", name: "姓名", university: "院校", city: "城市" };
const textRoleLabels: Record<string, string> = { eyebrow: "眉题", title: "标题", subtitle: "副标题", stats: "统计", watermark: "水印", note: "注释", custom: "文字" };

function sceneObjectLabel(project: ProjectDocument, id: string): string | undefined {
  const labels: Record<string, string> = { map: "地图", cards: "数据展示框", guests: "嘉宾板块", canvas: "画布" };
  if (labels[id]) return labels[id];
  const text = project.textElements.find((item) => item.id === id);
  if (text) return `${textRoleLabels[text.role]}：${text.content.trim() || "未填写内容"}`;
  const asset = project.assetElements.find((item) => item.id === id);
  if (asset) return `素材：${asset.label || "未命名素材"}`;
  if (project.cards.positions?.[id]) return `数据卡片：${id}`;
  return undefined;
}

function resourceObjectLabel(project: ProjectDocument, target: string): string {
  const labels: Record<string, string> = { background: "画布背景", map: "地图", "map-labels": "地图标签", "guests:title": "嘉宾标题", "guests:people": "嘉宾名单" };
  if (labels[target]) return labels[target];
  if (target.startsWith("text:")) return sceneObjectLabel(project, target.slice(5)) ?? `文字：${target.slice(5)}`;
  if (target.startsWith("asset:")) return sceneObjectLabel(project, target.slice(6)) ?? `素材：${target.slice(6)}`;
  if (target.startsWith("province:")) return `${target.slice(9)} · 省份外观`;
  if (target.startsWith("map-label:")) return `${target.slice(10)} · 地图标签`;
  if (target.startsWith("cards:")) return `数据卡片 · ${fieldLabels[target.slice(6)] ?? target.slice(6)}`;
  if (target.startsWith("guest:")) {
    const id = target.slice(6);
    return `嘉宾：${project.guests.people.find((person) => person.id === id)?.name || id}`;
  }
  if (target.startsWith("display-frame:")) {
    const id = target.slice(14);
    if (id === "style") return "展示框 · 整体字体";
    const frame = project.cards.displayFrame;
    const item = [...(frame?.fixed.items ?? []), ...(frame?.flow.blocks ?? [])].find((item) => item.id === id);
    return `展示框 · ${item?.content || (item?.field && fieldLabels[item.field]) || id}`;
  }
  return target || "资源";
}

function issueObjectLabel(project: ProjectDocument, item: DeliveryIssue, studentRows: ReadonlyMap<string, number>): string {
  if (item.kind === "data") {
    const row = studentRows.get(item.issue.studentId);
    const name = item.issue.studentName.trim() || "未命名学生";
    return row ? `${name} · 第 ${row} 行` : name;
  }
  if (item.kind === "resource") return resourceObjectLabel(project, item.issue.target);
  const directLabel = sceneObjectLabel(project, item.issue.id);
  if (directLabel) return directLabel;
  const labels = item.issue.id.split(":").map((id) => sceneObjectLabel(project, id)).filter(Boolean);
  return labels.length ? Array.from(new Set(labels)).join(" / ") : `排版对象：${item.issue.id}`;
}

function issueKey(item: DeliveryIssue, index: number): string {
  if (item.kind === "data") return `data-${item.issue.studentId}-${item.issue.kind}-${index}`;
  if (item.kind === "layout") return `layout-${item.issue.id}-${item.issue.kind}-${index}`;
  return `resource-${item.issue.target}-${item.issue.kind}-${index}`;
}

export function DeliveryCheckSection({
  title,
  project,
  issues,
  onLocate,
  informational = false,
  emptyLabel,
}: {
  title: string;
  project: ProjectDocument;
  issues: DeliveryIssue[];
  onLocate: (issue: DeliveryIssue) => void;
  informational?: boolean;
  emptyLabel?: string;
}) {
  const needsReview = !informational && issues.length > 0;
  const studentRows = new Map(project.students.map((student, index) => [student.id, index + 1]));
  const checkState = informational ? "info" : needsReview ? "warning" : emptyLabel ? "empty" : "passed";
  const heading = <>
    <div><strong>{title}</strong><small>{emptyLabel ?? `${issues.length} 项${informational ? "说明" : needsReview ? "待处理" : " · 通过"}`}</small></div>
    {informational || emptyLabel
      ? <Info size={17} aria-label={emptyLabel ?? "补充说明，无需修正"} />
      : needsReview ? <TriangleAlert size={17} aria-label="有待处理问题" /> : <CheckCircle2 size={17} aria-label="检查通过" />}
  </>;
  return (
    <section className="delivery-workspace__check" aria-label={title} data-check-kind={informational ? "info" : "warning"} data-check-state={checkState}>
      {issues.length === 0 ? <header>{heading}</header> : <details open={needsReview}>
        <summary>{heading}<ChevronDown size={14} className="delivery-workspace__check-disclosure" aria-hidden="true" /></summary>
        <div className="delivery-workspace__issue-list">
          {issues.map((item, index) => {
            const label = issueObjectLabel(project, item, studentRows);
            return <button key={issueKey(item, index)} type="button" aria-label={`定位${label}：${item.issue.detail}`} onClick={() => onLocate(item)}>
              <span className="delivery-workspace__issue-description"><strong>{label}</strong><span>{item.issue.detail}</span></span><small>定位</small>
            </button>;
          })}
        </div>
      </details>}
    </section>
  );
}
