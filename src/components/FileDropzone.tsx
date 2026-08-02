import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { fileMatchesAccept } from "../lib/file-accept";

export type FileDropzoneProps = {
  id?: string;
  label: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  icon?: ReactNode;
  variant?: "default" | "secondary" | "compact";
  className?: string;
  onFile: (file: File) => void;
  onReject?: (reason: string) => void;
};

function getDroppedFile(event: DragEvent): File | null {
  const transfer = event.dataTransfer;
  if (!transfer) return null;
  if (transfer.files && transfer.files.length > 0) return transfer.files[0] ?? null;
  return null;
}

export function FileDropzone({
  id,
  label,
  hint,
  accept,
  disabled = false,
  busy = false,
  busyLabel = "处理中...",
  icon,
  variant = "default",
  className = "",
  onFile,
  onReject,
}: FileDropzoneProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const zoneRef = useRef<HTMLLabelElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inactive = disabled || busy;

  // Keep latest props available to native listeners without re-binding constantly.
  const stateRef = useRef({ accept, inactive, onFile, onReject });
  useEffect(() => {
    stateRef.current = { accept, inactive, onFile, onReject };
  }, [accept, inactive, onFile, onReject]);

  const emitFile = (file: File | null | undefined) => {
    const current = stateRef.current;
    if (!file || current.inactive) return;
    if (!fileMatchesAccept(file, current.accept)) {
      const reason = "文件格式不支持";
      setError(reason);
      current.onReject?.(reason);
      return;
    }
    setError("");
    current.onFile(file);
  };

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    const node = zoneRef.current;
    if (!node) return;

    const onDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (stateRef.current.inactive) return;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (stateRef.current.inactive) return;
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    };

    const onDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = event.relatedTarget as Node | null;
      if (next && node.contains(next)) return;
      setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      if (stateRef.current.inactive) return;
      emitFile(getDroppedFile(event));
    };

    // Native listeners are more reliable for DnD than React synthetic events under jsdom.
    node.addEventListener("dragenter", onDragEnter);
    node.addEventListener("dragover", onDragOver);
    node.addEventListener("dragleave", onDragLeave);
    node.addEventListener("drop", onDrop);

    return () => {
      node.removeEventListener("dragenter", onDragEnter);
      node.removeEventListener("dragover", onDragOver);
      node.removeEventListener("dragleave", onDragLeave);
      node.removeEventListener("drop", onDrop);
    };
  }, []);

  const classes = [
    "file-dropzone",
    `file-dropzone--${variant}`,
    dragging ? "is-dragging" : "",
    inactive ? "is-disabled" : "",
    busy ? "is-busy" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const displayIcon = busy
    ? <Loader2 size={16} className="spin" aria-hidden />
    : (icon ?? <Upload size={16} aria-hidden />);

  return (
    <div className="file-dropzone-wrap">
      <label
        ref={zoneRef}
        htmlFor={inputId}
        className={classes}
        data-file-dropzone=""
        aria-disabled={inactive || undefined}
      >
        <span className="file-dropzone__icon">{displayIcon}</span>
        <span className="file-dropzone__body">
          <span className="file-dropzone__label">{busy ? busyLabel : label}</span>
          {hint && !busy ? <span className="file-dropzone__hint">{hint}</span> : null}
          {!busy && !hint ? <span className="file-dropzone__hint">点击或拖拽到此处</span> : null}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          hidden
          disabled={inactive}
          onChange={(event) => {
            emitFile(event.target.files?.[0]);
            clearInput();
          }}
        />
      </label>
      {error ? (
        <p className="file-dropzone__error" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
