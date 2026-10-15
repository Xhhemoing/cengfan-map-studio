import { useRef, useState } from "react";

export function useClipboardFeedback(scope?: string) {
  const [receipt, setReceipt] = useState<{ status: "idle" | "copying" | "copied" | "error"; text?: string }>({ status: "idle" });
  // A new invitation or room must never inherit another text's copy receipt.
  // Keep an in-flight operation disabled until it settles, then show only its own result.
  const status = receipt.status === "copying" || scope === undefined || receipt.text === scope ? receipt.status : "idle";
  const pending = useRef(false);
  const copy = async (text: string): Promise<boolean> => {
    if (pending.current) return false;
    pending.current = true;
    setReceipt({ status: "copying", text });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setReceipt({ status: "copied", text });
      return true;
    } catch {
      // Do not echo clipboard contents, especially invitation credentials.
      setReceipt({ status: "error", text });
      return false;
    } finally {
      pending.current = false;
    }
  };
  return { copy, status };
}
