import { createPortal } from "react-dom";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  const blurTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
  const options = useMemo(() => (value.trim() ? searchOptions(value) : []), [searchOptions, value]);
  const displayOptions = useMemo(() => {
    if (!allowFreeInput || !value.trim()) return options;
    if (options.some((option) => option.value === value)) return options;
    return [{ value, label: value, detail: "使用自定义" }, ...options];
  }, [options, value, allowFreeInput]);
  const listVisible = isOpen && displayOptions.length > 0 && (!portal || portalStyle !== null);
  const activeOption = listVisible && activeIndex >= 0 ? displayOptions[activeIndex] : undefined;

  const cancelBlurTimer = () => {
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  };

  useEffect(() => () => {
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
  }, []);

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
    inputRef.current?.focus();
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
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
      if (!listVisible) return;
      event.preventDefault();
      if (activeOption) {
        selectOption(activeOption);
      } else if (allowFreeInput && value.trim()) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Escape") {
      if (listVisible) {
        event.preventDefault();
        event.stopPropagation();
      }
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
          tabIndex={-1}
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
        aria-controls={listVisible ? listId : undefined}
        aria-expanded={listVisible}
        aria-activedescendant={activeOption ? `${listId}-option-${activeIndex}` : undefined}
        role="combobox"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          cancelBlurTimer();
          setIsOpen(true);
        }}
        onBlur={() => {
          cancelBlurTimer();
          blurTimerRef.current = window.setTimeout(() => {
            blurTimerRef.current = null;
            const input = inputRef.current;
            // A quick Tab back must not let an older blur close new suggestions.
            if (!input || input.ownerDocument.activeElement === input) return;
            setIsOpen(false);
            setActiveIndex(-1);
          }, 120);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && displayOptions.length > 0 && (portal ? portalStyle ? createPortal(listbox, document.body) : null : listbox)}
    </div>
  );
}
