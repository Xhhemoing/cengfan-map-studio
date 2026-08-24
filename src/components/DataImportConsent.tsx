/**
 * 导入侧的出境闸门:本地规则读不全时,粘贴原文(含学生姓名)才会被送去第三方模型,
 * 而送出前必须先拿到用户的明确同意。显式点「智能识别」和一键导入的自动升级共用这一条路径。
 */
import { useRef, useState } from "react";
import { loadAiParseConsent, saveAiParseConsent, type AiParseConsent } from "../lib/use-studio-preferences";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";

export type AiUploadSource = "paste" | "ocr";

export interface AiUploadConsentGate {
  /** 询问期间为 true:此时不能再触发一次上送,否则等待中的 promise 会被顶掉。 */
  isAsking: boolean;
  pendingSource: AiUploadSource | null;
  rememberedConsent: AiParseConsent | null;
  rememberChoice: boolean;
  setRememberChoice: (value: boolean) => void;
  /** 未取得同意时返回 false,调用方必须保留本地结果。 */
  requestConsent: (source: AiUploadSource) => Promise<boolean>;
  settleConsent: (granted: boolean) => void;
  clearRememberedConsent: () => void;
}

export function useAiUploadConsent(onMessage: (message: string) => void): AiUploadConsentGate {
  const [rememberedConsent, setRememberedConsent] = useState<AiParseConsent | null>(() => loadAiParseConsent());
  const [sessionConsent, setSessionConsent] = useState(false);
  const [pendingSource, setPendingSource] = useState<AiUploadSource | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);
  const resolvePending = useRef<((granted: boolean) => void) | null>(null);

  const requestConsent = (source: AiUploadSource): Promise<boolean> => {
    if (sessionConsent || rememberedConsent === "granted") return Promise.resolve(true);
    if (rememberedConsent === "denied") return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolvePending.current = resolve;
      setPendingSource(source);
    });
  };

  const settleConsent = (granted: boolean) => {
    if (rememberChoice) {
      const next: AiParseConsent = granted ? "granted" : "denied";
      setRememberedConsent(next);
      saveAiParseConsent(next);
    }
    // 同意后本次会话不再重复询问；拒绝只在勾了「记住」时长期生效，
    // 否则下次仍旧询问，一次拒绝不会把用户永久锁在本地识别里。
    if (granted) setSessionConsent(true);
    setPendingSource(null);
    setRememberChoice(false);
    const resolve = resolvePending.current;
    resolvePending.current = null;
    resolve?.(granted);
  };

  const clearRememberedConsent = () => {
    setRememberedConsent(null);
    saveAiParseConsent(null);
    onMessage("已恢复询问：下次智能识别前会重新确认是否发送粘贴文本");
  };

  return {
    isAsking: pendingSource !== null,
    pendingSource,
    rememberedConsent,
    rememberChoice,
    setRememberChoice,
    requestConsent,
    settleConsent,
    clearRememberedConsent,
  };
}

/** 记住「不发送」之后的回头路，避免一次拒绝把智能识别永久关死。 */
export function AiUploadConsentMemo({ gate }: { gate: AiUploadConsentGate }) {
  if (gate.rememberedConsent !== "denied") return null;
  return (
    <p className="panel-note ai-consent__memo">
      已记住「不发送原文」，智能识别只使用本地规则。
      <CompactButton variant="ghost" aria-label="重新询问是否发送原文" onClick={gate.clearRememberedConsent}>
        重新询问
      </CompactButton>
    </p>
  );
}

export function AiUploadConsentDialog({ gate }: { gate: AiUploadConsentGate }) {
  if (!gate.pendingSource) return null;
  return (
    <div
      className="import-review ai-consent"
      role="dialog"
      aria-labelledby="ai-parse-consent-title"
      aria-describedby="ai-parse-consent-body"
    >
      <PanelHeader id="ai-parse-consent-title" title="发送到智能识别前请确认" meta="仅用于本次名单解析" />
      <p className="panel-note" id="ai-parse-consent-body">
        {gate.pendingSource === "ocr" ? "本地 OCR 规则" : "本地规则"}没能读全这段文字。
        继续会把你粘贴的原文（含学生姓名）发送给第三方 AI 服务，仅用于解析成候选名单。
        选择「仅用本地识别」则原文不出本机，未识别的行会照实列出。
      </p>
      <label className="ai-consent__remember">
        <input
          type="checkbox"
          aria-label="记住我的选择"
          checked={gate.rememberChoice}
          onChange={(event) => gate.setRememberChoice(event.target.checked)}
        />
        记住我的选择，下次不再询问
      </label>
      <ActionGroup label="智能识别发送确认" className="review-actions">
        <CompactButton variant="secondary" aria-label="仅用本地识别" onClick={() => gate.settleConsent(false)}>
          仅用本地识别
        </CompactButton>
        <ActionButton aria-label="同意并发送" onClick={() => gate.settleConsent(true)}>
          同意并发送
        </ActionButton>
      </ActionGroup>
    </div>
  );
}
