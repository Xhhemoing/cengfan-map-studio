import { useMemo, useState, type ComponentProps } from "react";
import type { DataHealthSummary, DataIssue, DataIssueKind } from "../lib/data-health";
import type { ProjectDocument } from "../lib/project-document";
import type { DataViewId, MapTemplateId } from "../lib/project-data";
import { DataOverview } from "./DataOverview";
import { DataPresentationPanel } from "./DataPresentationPanel";
import { DataQualityPanel } from "./DataQualityPanel";
import { DataWorkspace } from "./DataWorkspace";
import type { CustomTemplateOption, TemplateOption } from "./TemplatePicker";
import { PanelHeader } from "./StudioUi";
import { GlobalDataNavigation, globalDataViewLabel } from "./global-data/GlobalDataNavigation";
import { GlobalDataStatus } from "./global-data/GlobalDataStatus";

export type GlobalDataView = "overview" | "roster" | "quality" | "mapping" | "presentation";


export function GlobalDataScreen({
  project,
  initialView = "overview",
  summary,
  issues,
  dataViewLabel,
  selectedStudentId,
  onSelectStudent,
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

  const activeLabel = globalDataViewLabel(activeView);

  return (
    <main className="global-data-screen" aria-label="全局数据工作台">
      <GlobalDataStatus summary={summary} />

      <div className="global-data-layout">
        <GlobalDataNavigation activeView={activeView} onChange={(view) => {
          setActiveView(view);
          if (view !== "quality" && view !== "mapping") setIssueFilter(null);
        }} />

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
