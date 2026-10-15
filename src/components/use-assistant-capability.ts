import { useEffect, useRef, useState } from "react";
import { checkAssistantCapability, initialAssistantCapability } from "../lib/assistant-capability";

export function useAssistantCapability() {
  const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "1";
  const [capability, setCapability] = useState(() => initialAssistantCapability(publicDemo));
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);
  const check = async () => {
    if (publicDemo || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setCapability({ state: "checking", detail: "正在检测 AI 服务…" });
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const next = await checkAssistantCapability(controller.signal);
      if (pending.current === controller) setCapability(next);
    } catch {
      if (pending.current === controller) setCapability({ state: "unavailable", detail: "AI 服务检测超时，可继续使用本地排版与体检。" });
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
    }
  };
  return { capability, check, publicDemo, canPlan: capability.state !== "unavailable" && capability.state !== "checking" };
}
