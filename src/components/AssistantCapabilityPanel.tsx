import type { AssistantCapability } from "../lib/assistant-capability";

export function AssistantCapabilityPanel({ capability, publicDemo, onCheck, onLocalLayout, onLocalDiagnose }: {
  capability: AssistantCapability;
  publicDemo: boolean;
  onCheck: () => void;
  onLocalLayout?: () => void;
  onLocalDiagnose?: () => void;
}) {
  return <section className="assistant-capability" aria-label="助手能力状态">
    <p role="status">{capability.detail}</p>
    {!publicDemo && <button type="button" disabled={capability.state === "checking"} onClick={onCheck}>{capability.state === "checking" ? "检测中…" : "检测 AI 服务"}</button>}
    {(onLocalLayout || onLocalDiagnose) && <div className="assistant-local-actions" aria-label="本地工具">
      {onLocalLayout && <button type="button" onClick={onLocalLayout}>本地智能排版</button>}
      {onLocalDiagnose && <button type="button" onClick={onLocalDiagnose}>本地排版体检</button>}
    </div>}
  </section>;
}
