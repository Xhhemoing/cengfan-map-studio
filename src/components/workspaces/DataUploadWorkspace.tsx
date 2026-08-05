import { ArrowLeft, CheckCircle2, LocateFixed, MapPinned, ShieldCheck } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { DataHealthSummary, DataIssue } from "../../lib/data-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { Student } from "../../lib/project-data";
import { searchProvinces } from "../../lib/search-catalog";
import { resolveStudentLocation } from "../../lib/student-data";
import { DataQualityPanel } from "../DataQualityPanel";
import { DataWorkspace } from "../DataWorkspace";
import { SearchCombobox } from "../SearchCombobox";
import { CompactButton, PanelHeader } from "../StudioUi";

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

export function DataUploadWorkspace({
  project,
  summary,
  issues,
  dataWorkspaceProps,
  onSelectStudent,
  onClose,
}: {
  project: ProjectDocument;
  summary: DataHealthSummary;
  issues: DataIssue[];
  dataWorkspaceProps: ComponentProps<typeof DataWorkspace>;
  onSelectStudent: (id: string) => void;
  onClose: () => void;
}) {
  const handleSelectStudent = (id: string) => {
    dataWorkspaceProps.onSelectStudent?.(id);
    onSelectStudent(id);
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-student-row]")).find((item) => item.dataset.studentRow === id);
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
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
    <main className="data-upload-workspace" aria-label="上传数据工作台">
      <header className="data-upload-workspace__header">
        <CompactButton
          aria-label="返回编辑器"
          icon={<ArrowLeft size={17} aria-hidden />}
          onClick={onClose}
        >
          返回编辑器
        </CompactButton>
        <div className="data-upload-workspace__status" aria-label="上传数据状态">
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
            selectedStudentId={dataWorkspaceProps.selectedStudentId}
            onSelectStudent={handleSelectStudent}
          />
        </section>
        <aside className="data-upload-workspace__quality">
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
        </aside>
      </div>
    </main>
  );
}
