import { ArrowLeft, Database, MapPinned, Rows3, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ComponentProps } from "react";
import type { DataHealthSummary, DataIssue, DataIssueKind } from "../lib/data-health";
import type { ProjectDocument } from "../lib/project-document";
import type { DataViewId, MapTemplateId } from "../lib/project-data";
import { DataOverview } from "./DataOverview";
import { DataPresentationPanel } from "./DataPresentationPanel";
import { DataQualityPanel } from "./DataQualityPanel";
import { DataWorkspace } from "./DataWorkspace";
import type { CustomTemplateOption, TemplateOption } from "./TemplatePicker";
import { CompactButton, PanelHeader } from "./StudioUi";

export type GlobalDataView = "overview" | "roster" | "quality" | "mapping" | "presentation";

const navigation: Array<{ id: GlobalDataView; label: string; description: string; icon: typeof Database }> = [
  { id: "overview", label: "数据总览", description: "查看工程数据状态", icon: Database },
  { id: "roster", label: "名单管理", description: "导入、编辑和筛选", icon: Rows3 },
  { id: "quality", label: "数据质量", description: "处理异常和缺失", icon: ShieldCheck },
  { id: "mapping", label: "地图映射", description: "修正城市和省份", icon: MapPinned },
  { id: "presentation", label: "数据呈现", description: "切换地图和卡片表达", icon: SlidersHorizontal },
];

export function GlobalDataScreen({
  project,
  initialView = "overview",
  summary,
  issues,
  dataViewLabel,
  selectedStudentId,
  onSelectStudent,
  onClose,
  onChangeDataView,
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onOpenGlobalSettings,
  dataWorkspaceProps,
}: {
  project: ProjectDocument;
  initialView?: GlobalDataView;
  summary: DataHealthSummary;
  issues: DataIssue[];
  dataViewLabel: string;
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onClose: () => void;
  onChangeDataView: (view: DataViewId) => void;
  templates: TemplateOption[];
  currentTemplateId: string;
  customTemplates: CustomTemplateOption[];
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateOption) => void;
  onSaveTemplate: () => void;
  onOpenGlobalSettings: () => void;
  dataWorkspaceProps: ComponentProps<typeof DataWorkspace>;
}) {
  const [activeView, setActiveView] = useState<GlobalDataView>(initialView);
  const [issueFilter, setIssueFilter] = useState<DataIssueKind | null>(null);

  const visibleIssues = useMemo(
    () => issueFilter ? issues.filter((issue) => issue.kind === issueFilter) : issues,
    [issueFilter, issues],
  );

  const openIssues = (kind: DataIssueKind) => {
    setIssueFilter(kind);
    setActiveView("quality");
  };

  const locateStudent = (id: string) => {
    onSelectStudent(id);
    setIssueFilter(null);
    setActiveView("roster");
  };

  const activeLabel = navigation.find((item) => item.id === activeView)?.label ?? "数据总览";

  return (
    <main className="global-data-screen" aria-label="全局数据工作台">
      <header className="global-data-header">
        <CompactButton
          className="global-data-header__back"
          icon={<ArrowLeft size={17} aria-hidden />}
          aria-label="返回编辑器"
          onClick={onClose}
        >
          返回编辑器
        </CompactButton>
        <div className="global-data-header__title">
          <span className="global-data-header__eyebrow">当前工程 · {project.students.length} 条记录</span>
          <h1>全局数据工作台</h1>
          <p>维护一份名单，统一控制地图、卡片和导出结果</p>
        </div>
        <div className="global-data-header__status" aria-label="工程数据状态">
          <span><strong>{summary.visible}</strong> 可见</span>
          <span><strong>{summary.unresolved}</strong> 未匹配</span>
          <span><strong>{summary.hidden}</strong> 隐藏</span>
        </div>
      </header>

      <div className="global-data-layout">
        <nav className="global-data-nav" role="tablist" aria-label="全局数据工作台导航">
          {navigation.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-label={label}
              aria-selected={activeView === id}
              aria-controls={`global-data-${id}`}
              tabIndex={activeView === id ? 0 : -1}
              className={activeView === id ? "is-active" : undefined}
              onClick={() => {
                setActiveView(id);
                if (id !== "quality" && id !== "mapping") setIssueFilter(null);
              }}
            >
              <Icon size={17} aria-hidden />
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </nav>

        <section
          id={`global-data-${activeView}`}
          className="global-data-content"
          role="tabpanel"
          aria-label={activeLabel}
          tabIndex={0}
        >
          {activeView === "overview" && (
            <DataOverview summary={summary} dataViewLabel={dataViewLabel} onOpenIssues={openIssues} />
          )}
          {activeView === "roster" && (
            <DataWorkspace
              {...dataWorkspaceProps}
              selectedStudentId={selectedStudentId}
              onSelectStudent={onSelectStudent}
            />
          )}
          {activeView === "quality" && (
            <DataQualityPanel issues={visibleIssues} onSelectStudent={locateStudent} />
          )}
          {activeView === "mapping" && (
            <section className="global-data-mapping" aria-label="地图映射">
              <PanelHeader title="地图映射" meta="定位中国去向，海外去向不会进入省份地图" />
              <p className="global-data-mapping__note">城市未匹配时，可以从名单管理中编辑城市，或为记录指定省份覆盖。</p>
              <DataQualityPanel
                issues={visibleIssues.filter((issue) => issue.kind === "unresolved-location" || issue.kind === "manual-province")}
                onSelectStudent={locateStudent}
              />
            </section>
          )}
          {activeView === "presentation" && (
            <DataPresentationPanel
              dataView={project.dataView}
              onChangeDataView={onChangeDataView}
              templates={templates}
              currentTemplateId={currentTemplateId}
              customTemplates={customTemplates}
              onApplyTemplate={onApplyTemplate}
              onApplyCustomTemplate={onApplyCustomTemplate}
              onSaveTemplate={onSaveTemplate}
              onOpenGlobalSettings={onOpenGlobalSettings}
            />
          )}
        </section>
      </div>
    </main>
  );
}
