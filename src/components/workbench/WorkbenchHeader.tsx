import { FolderOpen, MapPinned, Plus } from "lucide-react";
import type { RefObject } from "react";

export function WorkbenchHeader({ importInputRef, onCreateProject, onImportProject }: {
  importInputRef: RefObject<HTMLInputElement | null>;
  onCreateProject: () => void;
  onImportProject: (file: File | null) => void;
}) {
  return (
    <header className="workbench-header">
      <div className="workbench-brand">
        <span className="workbench-brand-mark"><MapPinned size={20} /></span>
        <span><strong>蹭饭地图工作室</strong><small>项目工作台</small></span>
      </div>
      <div className="workbench-actions">
        <button type="button" className="secondary-button" aria-label="导入工程包" onClick={() => importInputRef.current?.click()}>
          <FolderOpen size={16} /> 导入
        </button>
        <button type="button" className="primary-button" aria-label="新建项目" onClick={onCreateProject}>
          <Plus size={16} /> 新建项目
        </button>
        <input ref={importInputRef} type="file" accept="application/json,.json" aria-label="导入工程包文件" className="workbench-file-input" onChange={(event) => onImportProject(event.target.files?.[0] ?? null)} />
      </div>
    </header>
  );
}