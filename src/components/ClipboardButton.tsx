import { Copy } from "lucide-react";
import { useClipboardFeedback } from "../lib/use-clipboard-feedback";

export function ClipboardButton({ text, label, title, iconOnly = false }: {
  text: string;
  label: string;
  title?: string;
  iconOnly?: boolean;
}) {
  const { copy, status } = useClipboardFeedback(text);
  return <>
    <button type="button" aria-label={label} title={title ?? label} disabled={status === "copying"} onClick={() => void copy(text)}>
      <Copy size={15} aria-hidden="true" />{!iconOnly && label}
    </button>
    {status === "copied" && <small role="status">已复制</small>}
    {status === "error" && <small role="alert">无法复制，请手动选择文本后复制。</small>}
  </>;
}
