import { useEffect, useRef, useState } from "react";
import type { ImportReviewRow } from "../lib/data-workspace";
import type { Student } from "../lib/project-data";
import {
  applyImportFacts, buildImportDiffPlan, importSourceKey, rosterKey, summarizeImportDiff,
  type ApplyImportDiff, type ImportDecision, type ImportDiffSession,
} from "../lib/import-diff";
import "./import-diff.css";

export function ImportDiffPreview({ session, students, source, onApply, onComplete, onCancel }: {
  session: ImportDiffSession;
  students: Student[];
  source: ImportReviewRow[];
  onApply: ApplyImportDiff;
  onComplete: (message: string) => void;
  onCancel: () => void;
}) {
  const [decisions, setDecisions] = useState(() => session.rows.map((r) => r.initial));
  const [editRows, setEditRows] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const consumed = useRef(false);
  const region = useRef<HTMLElement>(null);
  useEffect(() => { region.current?.focus(); }, []);
  const stale = rosterKey(students) !== session.baseKey || importSourceKey(source) !== session.sourceKey;
  const summary = summarizeImportDiff(session, decisions);
  const change = (index: number, d: ImportDecision) => {
    setDecisions((current) => current.map((item, i) => i === index ? d : item));
    setError("");
  };
  const confirm = () => {
    if (consumed.current || stale) return;
    try {
      const plan = buildImportDiffPlan(session, decisions, students);
      consumed.current = true;
      const result = onApply(plan);
      if (result === "stale" || result === "readonly") {
        consumed.current = false;
        setError(result === "stale" ? "名单已改变，请取消后重新比较" : "当前仅可查看，未更新名单");
        return;
      }
      onComplete(`比较完成：新增 ${summary.added}，更新 ${summary.updated}，未变化 ${summary.unchanged}，保留旧记录 ${summary.retained}，跳过候选 ${summary.skipped + session.excluded}。${result === "unchanged" ? "无数据改动" : "可一次撤销，未触发全局重排"}`);
    } catch (e) {
      consumed.current = false;
      setError(e instanceof Error ? e.message : "更新失败");
    }
  };
  return <section ref={region} className="import-diff" tabIndex={-1} aria-label="名单差异预览">
    <header><h3>比较并更新</h3><p>只更新确认的记录，未出现的旧记录一律保留。同名不代表同一人，请核对学校、城市和记录 ID。</p></header>
    <p className="import-diff__summary" role="status">新增 {summary.added} · 更新 {summary.updated} · 未变化 {summary.unchanged} · 旧记录保留 {summary.retained} · 跳过 {summary.skipped + session.excluded}</p>
    {stale && <p role="alert">名单或导入候选已改变，本次预览已失效。请取消后重新比较。</p>}
    {error && <p role="alert">{error}</p>}
    <ul className="import-diff__rows">
      {session.rows.map((row, index) => {
        const d = decisions[index]!;
        const target = d.kind === "match" ? session.students.find((s) => s.id === d.studentId) : undefined;
        const same = target && d.kind === "match" && rosterKey([target]) === rosterKey([applyImportFacts(target, row.facts, d.clearProvince)]);
        return <li key={index}>
          <strong>第 {row.sourceLine} 行：{row.facts.name}</strong>
          <span>{row.facts.university} · {row.facts.city} · {row.facts.locationScope === "international" ? "海外" : "国内"}</span>
          {same && !editRows.has(index) ? <div>未变化，保留 ID {target.id} <button type="button" className="secondary-button" onClick={() => setEditRows((rows) => new Set([...rows, index]))}>修改匹配</button></div> : <>
            <label>本行处理
              <select aria-label={`第 ${row.sourceLine} 行匹配选择`} value={d.kind === "match" ? `match:${d.studentId}` : d.kind} onChange={(event) => {
                const value = event.target.value;
                if (value.startsWith("match:")) change(index, { kind: "match", studentId: value.slice(6) });
                else if (value === "add" || value === "skip" || value === "pending") change(index, { kind: value });
              }}>
                <option value="pending">请确认是哪一条记录</option><option value="add">确认为新记录</option><option value="skip">跳过此候选</option>
                {session.students.map((s) => <option key={s.id} value={`match:${s.id}`}>{row.suggestedIds.includes(s.id) ? "候选：" : "旧记录："}{s.name} / {s.university} / {s.city} / {s.id}</option>)}
              </select>
            </label>
            {target && <p>原记录：{target.name} · {target.university} · {target.city}；ID {target.id}、{target.visibility === false ? "隐藏" : "显示"}状态将保留。</p>}
          </>}
          {target?.province && d.kind === "match" && <label className="checkbox-row boolean-control"><input type="checkbox" checked={d.clearProvince === true} onChange={(event) => change(index, { ...d, clearProvince: event.target.checked })} />清除原人工省份「{target.province}」，改由新城市定位（默认保留）</label>}
        </li>;
      })}
    </ul>
    {summary.errors.length > 0 && <p role="alert">{summary.errors.slice(0, 3).join("；")}{summary.errors.length > 3 ? `；共 ${summary.errors.length} 项待处理` : ""}</p>}
    <p>仅更新名单，不刷新全部展示框位置。城市或学校改变后，请检查受影响分组的排版。</p>
    <footer><button type="button" className="secondary-button" onClick={onCancel}>取消比较</button><button type="button" className="primary-button" disabled={stale || summary.errors.length > 0} onClick={confirm}>确认更新名单</button></footer>
  </section>;
}
