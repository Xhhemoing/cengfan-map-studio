import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ImportReviewRow } from "../lib/data-workspace";
import type { Student } from "../lib/project-data";
import { findDuplicateStudentGroups } from "../lib/data-duplicate";
import { createImportDiff, type ApplyImportDiff, type ImportDiffSession } from "../lib/import-diff";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";
import { ImportDiffPreview } from "./ImportDiffPreview";

export function ImportReviewPanel({ reviewRows, setReviewRows, unparsedCount, students, applyImport, onApplyImportDiff, onComplete }: {
  reviewRows: ImportReviewRow[];
  setReviewRows: Dispatch<SetStateAction<ImportReviewRow[]>>;
  unparsedCount: number;
  students: Student[];
  applyImport: (mode: "append" | "replace") => void;
  onApplyImportDiff?: ApplyImportDiff;
  onComplete: (message: string) => void;
}) {
  const [session, setSession] = useState<ImportDiffSession | null>(null);
  const [error, setError] = useState("");
  const compareButton = useRef<HTMLButtonElement>(null);
  const compare = () => {
    try { setSession(createImportDiff(students, reviewRows)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "无法比较名单"); }
  };
  const candidateSummary = useMemo(() => {
    const duplicateIds = new Set(findDuplicateStudentGroups(reviewRows.map((row, index) => ({
      id: `${row.sourceLine}-${index}`,
      name: row.name,
      university: row.university,
      city: row.city,
      locationScope: row.locationScope,
    }))).flatMap((group) => group.studentIds));
    const valid = reviewRows.filter((row) => row.name.trim() && row.university.trim() && row.city.trim());
    return {
      valid: valid.length,
      missing: reviewRows.length - valid.length,
      duplicate: reviewRows.filter((_, index) => duplicateIds.has(`${reviewRows[index]!.sourceLine}-${index}`)).length,
    };
  }, [reviewRows]);


  if (session && onApplyImportDiff) return <ImportDiffPreview session={session} students={students} source={reviewRows} onApply={onApplyImportDiff} onComplete={onComplete} onCancel={() => { setSession(null); requestAnimationFrame(() => compareButton.current?.focus()); }} />;
  return <>
    {error && <p role="alert">{error}</p>}
        <div className="import-review">
          <PanelHeader title="确认候选" meta={`有效 ${candidateSummary.valid} · 未识别 ${unparsedCount} · 缺失字段 ${candidateSummary.missing} · 重复 ${candidateSummary.duplicate}`} />
          <div className="review-list">
            {reviewRows.map((row, index) => (
              <label key={`${row.sourceLine}-${index}`} className="review-row">
                <input
                  type="checkbox"
                  checked={row.accepted}
                  onChange={(event) => {
                    setReviewRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, accepted: event.target.checked }
                          : item,
                      ),
                    );
                  }}
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.university} · {row.city}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <ActionGroup label="确认导入" className="review-actions">
            <ActionButton onClick={() => applyImport("append")}>
              追加导入
            </ActionButton>
            <CompactButton variant="secondary" onClick={() => applyImport("replace")}>
              替换全部
            </CompactButton>
            {onApplyImportDiff && <button ref={compareButton} type="button" className="secondary-button" onClick={compare}>比较并更新</button>}
          </ActionGroup>
        </div>
  </>;
}
