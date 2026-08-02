import { useEffect, useRef, useState } from "react";

export function RangeNumberControl({
  id,
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  suffix,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const editingRef = useRef(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    editingRef.current = false;
    const numeric = Number(draft);
    if (!Number.isFinite(numeric) || draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const committed = Math.min(max, Math.max(min, numeric));
    setDraft(String(committed));
    if (committed !== value) onCommit(committed);
  };

  return (
    <div className="range-number-control">
      <label className="range-number-control__label" htmlFor={`${id}-range`}>{label}</label>
      <input
        id={`${id}-range`}
        aria-label={`${label}滑条`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onFocus={() => { editingRef.current = true; }}
        onInput={(event) => {
          editingRef.current = true;
          setDraft(event.currentTarget.value);
        }}
        onBlur={() => commitDraft()}
      />
      <div className="range-number-control__number">
        <input
          id={id}
          aria-label={`${label}数值`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          disabled={disabled}
          onFocus={() => { editingRef.current = true; }}
          onChange={(event) => {
            editingRef.current = true;
            setDraft(event.currentTarget.value);
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            commitDraft();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
              skipBlurCommitRef.current = true;
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(String(value));
              editingRef.current = false;
              skipBlurCommitRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
    </div>
  );
}
