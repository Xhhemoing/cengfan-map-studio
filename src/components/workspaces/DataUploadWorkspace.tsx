import { CheckCircle2, LocateFixed, MapPinned, ShieldCheck } from "lucide-react";
import { useState, type ComponentProps, type KeyboardEvent } from "react";
import type { DataHealthSummary, DataIssue } from "../../lib/data-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { Student } from "../../lib/project-data";
import { searchProvinces } from "../../lib/search-catalog";
import { resolveStudentLocation } from "../../lib/student-data";
import { AssetPanel } from "../AssetPanel";
import { DataQualityPanel } from "../DataQualityPanel";
import { DataWorkspace } from "../DataWorkspace";
import { SearchCombobox } from "../SearchCombobox";
import { CompactButton, PanelHeader } from "../StudioUi";

export type DataAssetPanelProps = Omit<ComponentProps<typeof AssetPanel>, "selectedProvince" | "selectedProvinceStyle" | "onCreateDecoration">;

function provinceOptions(query: string): Array<{ value: string; label: string }> {
  return searchProvinces(query).map((province) => ({ value: province, label: province }));
}

function MappingIssueRow({
  student,
  issue,
  onUpdateStudent,
  onSelectStudent,
}: {
  student?: Student;
  issue: DataIssue;
  onUpdateStudent: (id: string, patch: Partial<Pick<Student, "province">>) => void;
  onSelectStudent: (id: string) => void;
}) {
  const [province, setProvince] = useState(student?.province ?? "");
  const [saved, setSaved] = useState(false);
  const applyProvince = () => {
    const next = province.trim();
    if (!next) return;
    onUpdateStudent(student?.id ?? issue.studentId, { province: next });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };
  return (
    <div className="data-quality-row data-upload-workspace__mapping-row" role="listitem">
      <div className="data-quality-row__content">
        <strong>{issue.studentName}</strong>
        <small>{issue.detail}</small>
      </div>
      <div className="data-upload-workspace__mapping-controls">
        <SearchCombobox
          label={`为 ${issue.studentName} 指定省份`}
          value={province}
          allowFreeInput
          portal
          onChange={setProvince}
          searchOptions={provinceOptions}
        />
        <CompactButton
          aria-label={`为 ${issue.studentName} 应用省份覆盖`}
          onClick={applyProvince}
          disabled={!province.trim()}
        >
          {saved ? "已指定" : "指定省份"}
        </CompactButton>
      </div>
      <CompactButton
        icon={<LocateFixed size={14} aria-hidden />}
        aria-label={`定位${issue.studentName}`}
        variant="secondary"
        onClick={() => onSelectStudent(issue.studentId)}
      >
        定位到名单
      </CompactButton>
    </div>
  );
}

function selectStudentRow(id: string, onSelectStudent: (studentId: string) => void, delegate?: (studentId: string) => void) {
  delegate?.(id);
  onSelectStudent(id);
  const row = Array.from(document.querySelectorAll<HTMLElement>("[data-student-row]")).find((item) => item.dataset.studentRow === id);
  if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
}

export type DataUploadWorkspaceProps = {
  project: ProjectDocument;
  summary: DataHealthSummary;
  issues: DataIssue[];
  dataWorkspaceProps: ComponentProps<typeof DataWorkspace>;
  assetPanelProps: DataAssetPanelProps;
  onCreateDecoration: NonNullable<ComponentProps<typeof AssetPanel>["onCreateDecoration"]>;
  onSelectStudent: (id: string) => void;
};

/**
 * Center content of the DATA stage: the upload workbench header (title + live
 * roster status) and the roster/import table. The 数据质量/素材库 rail is a
 * sibling component (`DataUploadRail`) rendered by the unified right rail.
 */
export function DataUploadWorkspace({
  project: _project,
  summary,
  issues: _issues,
  dataWorkspaceProps,
  assetPanelProps: _assetPanelProps,
  onCreateDecoration: _onCreateDecoration,
  onSelectStudent,
}: DataUploadWorkspaceProps) {
  const handleSelectStudent = (id: string) => {
    selectStudentRow(id, onSelectStudent, dataWorkspaceProps.onSelectStudent);
  };

  return (
    <main className="data-upload-workspace data-upload-workspace--expanded" aria-label="数据与素材工作台">
      <header className="data-upload-workspace__header">
        <div className="data-upload-workspace__title">
          <strong>数据与素材</strong>
          <span>导入、筛选、校验、地图映射与素材</span>
        </div>
        <div className="data-upload-workspace__status" aria-label="数据与素材状态">
          <span><strong>{summary.total}</strong> 总记录</span>
          <span><strong>{summary.visible}</strong> 可见</span>
          <span><strong>{summary.duplicate ?? 0}</strong> 重复</span>
        </div>
      </header>
      <div className="data-upload-workspace__body">
        <section className="data-upload-workspace__data" aria-label="导入和数据表">
          <DataWorkspace
            {...dataWorkspaceProps}
            hideDataExpression
            hideTemplateDownload
            compactRosterControls
            selectedStudentId={dataWorkspaceProps.selectedStudentId}
            onSelectStudent={handleSelectStudent}
          />
        </section>
      </div>
    </main>
  );
}

export type DataUploadRailProps = {
  project: ProjectDocument;
  summary: DataHealthSummary;
  issues: DataIssue[];
  dataWorkspaceProps: {
    onSelectStudent?: (id: string) => void;
    onUpdateStudent: (id: string, patch: Partial<Pick<Student, "province">>) => void;
  };
  assetPanelProps: DataAssetPanelProps;
  onCreateDecoration: NonNullable<ComponentProps<typeof AssetPanel>["onCreateDecoration"]>;
  onSelectStudent: (id: string) => void;
};

/**
 * Right rail of the DATA stage: 数据质量/素材库 tabs, the quality panel with
 * the map-mapping issue rows and province chips, and the asset library. The
 * shell owns the rail chrome (labelled aside + resizer + mobile drawer).
 */
export function DataUploadRail({
  project,
  summary: _summary,
  issues,
  dataWorkspaceProps,
  assetPanelProps,
  onCreateDecoration,
  onSelectStudent,
}: DataUploadRailProps) {
  const [railTab, setRailTab] = useState<"quality" | "assets">("quality");
  const [assetProvince, setAssetProvince] = useState("");

  const handleRailTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = railTab === "quality" ? "assets" : "quality";
    setRailTab(next);
    document.getElementById(next === "quality" ? "data-rail-quality-tab" : "data-rail-assets-tab")?.focus();
  };

  const handleSelectStudent = (id: string) => {
    selectStudentRow(id, onSelectStudent, dataWorkspaceProps.onSelectStudent);
  };

  const mappingIssues = issues.filter(
    (issue) => issue.kind === "unresolved-location" || issue.kind === "manual-province",
  );
  const studentById = new Map(project.students.map((student) => [student.id, student]));
  const provinceDistribution = new Map<string, { count: number; overridden: boolean }>();
  for (const student of project.students) {
    if (student.locationScope === "international") continue;
    const location = resolveStudentLocation(student);
    const name = student.province?.trim() || location.province;
    if (!name) continue;
    const entry = provinceDistribution.get(name) ?? { count: 0, overridden: false };
    entry.count += 1;
    if (student.province?.trim()) entry.overridden = true;
    provinceDistribution.set(name, entry);
  }
  const distributionEntries = [...provinceDistribution.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0], "zh-CN"));

  return (
    <aside className="data-upload-workspace__rail" aria-label="数据工作台侧栏">
      <div className="data-upload-workspace__rail-tabs" role="tablist" aria-label="数据侧栏" onKeyDown={handleRailTabKeyDown}>
        <button
          type="button"
          role="tab"
          id="data-rail-quality-tab"
          aria-controls="data-rail-quality"
          aria-selected={railTab === "quality"}
          onClick={() => setRailTab("quality")}
        >
          数据质量
        </button>
        <button
          type="button"
          role="tab"
          id="data-rail-assets-tab"
          aria-controls="data-rail-assets"
          aria-selected={railTab === "assets"}
          onClick={() => setRailTab("assets")}
        >
          素材库
        </button>
      </div>
      {railTab === "quality" ? (
        <section className="data-upload-workspace__quality" id="data-rail-quality" role="tabpanel" aria-labelledby="data-rail-quality-tab">
          <PanelHeader title="数据质量" meta={`${issues.length} 项待检查`} />
          <div className="data-upload-workspace__quality-intro">
            <ShieldCheck size={18} aria-hidden />
            <span>问题只提示，不会自动删除记录。</span>
          </div>
          <DataQualityPanel issues={issues} onSelectStudent={handleSelectStudent} />

          <section className="data-upload-workspace__mapping" aria-label="地图映射">
            <PanelHeader title="地图映射 · 省份管理" meta={`${distributionEntries.length} 个省`} />
            <div className="data-upload-workspace__quality-intro">
              <MapPinned size={18} aria-hidden />
              <span>省份由城市自动解析；点击名单表格省份列的 ✎ 可为任意记录修改省份（支持自定义省份名），未匹配城市可在下方直接指定。</span>
            </div>
            <div className="data-upload-workspace__province-grid" role="list" aria-label="省份分布">
              {distributionEntries.map(([name, entry]) => (
                <span key={name} className="data-upload-workspace__province-chip" data-overridden={entry.overridden ? "true" : undefined}>
                  <strong>{name}</strong>
                  <small>{entry.count} 人{entry.overridden ? " · 已覆盖" : ""}</small>
                </span>
              ))}
            </div>
            {mappingIssues.length === 0 ? (
              <div className="data-quality-empty">
                <CheckCircle2 size={20} aria-hidden />
                <strong>城市与省份已全部定位</strong>
                <span>无需省份覆盖。</span>
              </div>
            ) : (
              <div className="data-quality-list" role="list" aria-label="地图映射问题">
                {mappingIssues.map((issue) => (
                  <MappingIssueRow
                    key={`${issue.studentId}-${issue.kind}-${studentById.get(issue.studentId)?.province ?? ""}`}
                    student={studentById.get(issue.studentId)}
                    issue={issue}
                    onUpdateStudent={dataWorkspaceProps.onUpdateStudent}
                    onSelectStudent={handleSelectStudent}
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="data-upload-workspace__assets" id="data-rail-assets" role="tabpanel" aria-labelledby="data-rail-assets-tab">
          <AssetPanel
            {...assetPanelProps}
            selectedProvince={assetProvince}
            selectedProvinceStyle={project.map.provinceStyles?.[assetProvince]}
            onCreateDecoration={onCreateDecoration}
            onSelectProvince={setAssetProvince}
          />
        </section>
      )}
    </aside>
  );
}
