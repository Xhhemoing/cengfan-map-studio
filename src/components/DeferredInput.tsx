import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type DeferredInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "onChange" | "onInput" | "value"> & {
  value: string | number;
  onCommit: (value: string) => void;
};

export function DeferredInput({ value, onCommit, onBlur, onFocus, onKeyDown, ...props }: DeferredInputProps) {
  const externalValue = String(value);
  const [draft, setDraft] = useState(externalValue);
  const editingRef = useRef(false);
  const skipBlurCommitRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingRef.current) setDraft(externalValue);
  }, [externalValue]);

  // Color pickers fire many input events while dragging, then one change event
  // when the picker closes — and they never blur the input. Committing on the
  // native change keeps the map in sync without waiting for blur and produces
  // a single history entry per pick instead of one per drag step.
  useEffect(() => {
    if (props.type !== "color") return;
    const input = inputRef.current;
    if (!input) return;
    const commitColor = () => {
      const next = input.value;
      editingRef.current = false;
      skipBlurCommitRef.current = true;
      if (next !== externalValue) onCommit(next);
    };
    input.addEventListener("change", commitColor);
    return () => input.removeEventListener("change", commitColor);
  }, [externalValue, onCommit, props.type]);

  const commitDraft = () => {
    editingRef.current = false;
    if (draft !== externalValue) onCommit(draft);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      value={draft}
      onFocus={(event) => {
        editingRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        editingRef.current = true;
        setDraft(event.currentTarget.value);
      }}
      onBlur={(event) => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
        } else {
          commitDraft();
        }
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraft();
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(externalValue);
          editingRef.current = false;
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

type DeferredTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "defaultValue" | "onChange" | "onInput" | "value"> & {
  value: string;
  onCommit: (value: string) => void;
};

export function DeferredTextarea({ value, onCommit, onBlur, onFocus, onKeyDown, ...props }: DeferredTextareaProps) {
  const [draft, setDraft] = useState(value);
  const editingRef = useRef(false);
  const skipBlurCommitRef = useRef(false);

  const commitDraft = () => {
    editingRef.current = false;
    if (draft !== value) onCommit(draft);
  };

  useEffect(() => {
    if (!editingRef.current) setDraft(value);
  }, [value]);

  return (
    <textarea
      {...props}
      value={draft}
      onFocus={(event) => {
        editingRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        editingRef.current = true;
        setDraft(event.currentTarget.value);
      }}
      onBlur={(event) => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
        } else {
          commitDraft();
        }
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commitDraft();
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          editingRef.current = false;
          skipBlurCommitRef.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}
