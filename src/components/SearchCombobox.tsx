import { createPortal } from "react-dom";
import { type CSSProperties, type KeyboardEvent, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface SearchComboboxOption {
  value: string;
  label: string;
  detail?: string;
}

export function SearchCombobox({
  label,
  value,
  placeholder,
  searchOptions,
  allowFreeInput,
  portal = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  searchOptions: (query: string) => SearchComboboxOption[];
  allowFreeInput?: boolean;
  portal?: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
  const options = useMemo(() => (value.trim() ? searchOptions(value) : []), [searchOptions, value]);
  const displayOptions = useMemo(() => {
    if (!allowFreeInput || !value.trim()) return options;
    if (options.some((option) => option.value === value)) return options;
    return [{ value, label: value, detail: "使用自定义" }, ...options];
  }, [options, value, allowFreeInput]);

  const updatePortalPosition = useCallback(() => {
    const input = inputRef.current;
    if (!portal || !isOpen || displayOptions.length === 0 || !input) return;
    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
    const spaceAbove = Math.max(0, rect.top - 8);
    const placeAbove = spaceAbove > spaceBelow && spaceBelow < 120;
    const availableSpace = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(1, Math.min(168, availableSpace));
    const top = placeAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4;
    setPortalStyle({
      left: Math.max(8, rect.left),
      maxHeight,
      top,
      width: rect.width,
    });
  }, [displayOptions.length, isOpen, portal]);

  useLayoutEffect(() => {
    if (!portal || !isOpen || displayOptions.length === 0) {
      return;
    }
    updatePortalPosition();
    const handleViewportChange = () => updatePortalPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [displayOptions.length, isOpen, portal, updatePortalPosition]);


  const selectOption = (option: SearchComboboxOption) => {
    onChange(option.value);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (displayOptions.length > 0) {
        setIsOpen(true);
        setActiveIndex((current) => (current + 1) % displayOptions.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (displayOptions.length > 0) {
        setIsOpen(true);
        setActiveIndex((current) => (current <= 0 ? displayOptions.length - 1 : current - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (isOpen && activeIndex >= 0) {
        selectOption(displayOptions[activeIndex]!);
      } else if (allowFreeInput && value.trim()) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const listbox = (
    <div
      id={listId}
      className={`search-combobox__list${portal ? " search-combobox__list--portal" : ""}`}
      role="listbox"
      style={portal ? portalStyle ?? undefined : undefined}
    >
      {displayOptions.map((option, index) => (
        <button
          id={`${listId}-option-${index}`}
          key={option.value}
          type="button"
          role="option"
          aria-selected={activeIndex === index}
          className={activeIndex === index ? "is-active" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectOption(option)}
        >
          <span>{option.label}</span>
          {option.detail && <small> · {option.detail}</small>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="search-combobox">
      <input
        ref={inputRef}
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={isOpen && options.length > 0}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        role="combobox"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && displayOptions.length > 0 && (portal ? portalStyle ? createPortal(listbox, document.body) : null : listbox)}
    </div>
  );
}
