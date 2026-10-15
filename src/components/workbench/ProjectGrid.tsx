import { MapPinned, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ProjectListItem } from "../../lib/project-store";
import { ProjectCard } from "./ProjectCard";

/** Cards consume list metadata, not the full stored project payload. */
export type ProjectGridItem = Pick<ProjectListItem, "id" | "name" | "updatedAt" | "pack">;

export function ProjectGrid({ projects, loading, hasError, openMenuId, formatUpdatedAt, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete, onLoadSample }: {
  projects: ProjectGridItem[];
  loading: boolean;
  hasError: boolean;
  openMenuId: string | null;
  formatUpdatedAt: (value: string) => string;
  onOpen: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onRename: (project: ProjectGridItem) => void;
  onDuplicate: (project: ProjectGridItem) => void;
  onExport: (project: ProjectGridItem) => void;
  onDelete: (project: ProjectGridItem) => void;
  onLoadSample: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const term = query.trim().toLocaleLowerCase("zh-CN");
  const visible = term ? projects.filter((project) => project.name.toLocaleLowerCase("zh-CN").includes(term)) : projects;
  const clearSearch = () => { setQuery(""); searchRef.current?.focus(); };
  return <>
    <header className="workbench-section-heading">
      <div>
        <h1>我的项目</h1>
        <p>继续编辑，或从一张新地图开始。</p>
      </div>
      {!loading && !hasError && <span className="workbench-project-count" role="status">{term ? `${visible.length} / ${projects.length} 个项目` : `${projects.length} 个项目`}</span>}
    </header>
    {projects.length > 0 && <div className="workbench-search">
      <label htmlFor={searchId}><Search size={16} aria-hidden="true" /><span className="workbench-search__label">搜索项目</span></label>
      <input ref={searchRef} id={searchId} type="search" placeholder="按项目名称搜索" value={query} onChange={(event) => setQuery(event.target.value)} />
      {query && <button type="button" aria-label="清空项目搜索" title="清空搜索" onClick={clearSearch}><X size={16} aria-hidden="true" /></button>}
    </div>}
    <section className="workbench-grid" aria-label="项目列表" aria-busy={loading}>
      {loading && projects.length === 0 ? (
        <div className="workbench-empty" role="status">
          <span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} /></span>
          <strong>正在加载项目…</strong>
          <p>稍候，正在读取本机项目列表。</p>
        </div>
      ) : projects.length === 0 && !hasError ? (
        <div className="workbench-empty">
          <span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} /></span>
          <strong>还没有项目</strong>
          <p>点击「新建项目」或「导入」，做毕业去向、开学合影或校庆班级图。</p>
          <button type="button" className="secondary-button" aria-label="载入示例项目" onClick={onLoadSample}>载入示例项目</button>
        </div>
      ) : visible.length === 0 && !hasError ? (
        <div className="workbench-empty">
          <span className="workbench-empty__mark" aria-hidden="true"><Search size={22} /></span>
          <strong>没有匹配的项目</strong>
          <p>试试其他名称，或清空搜索查看全部项目。</p>
          <button type="button" className="secondary-button" onClick={clearSearch}>查看全部项目</button>
        </div>
      ) : visible.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          updatedAtLabel={formatUpdatedAt(project.updatedAt)}
          menuOpen={openMenuId === project.id}
          onOpen={() => onOpen(project.id)}
          onToggleMenu={() => onToggleMenu(project.id)}
          onRename={() => onRename(project)}
          onDuplicate={() => onDuplicate(project)}
          onExport={() => onExport(project)}
          onDelete={() => onDelete(project)}
        />
      ))}
    </section>
  </>;
}
