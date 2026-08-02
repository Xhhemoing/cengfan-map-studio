import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";

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
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  searchOptions: (query: string) => SearchComboboxOption[];
  allowFreeInput?: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = useMemo(() => (value.trim() ? searchOptions(value) : []), [searchOptions, value]);
  const displayOptions = useMemo(() => {
    if (!allowFreeInput || !value.trim()) return options;
    if (options.some((option) => option.value === value)) return options;
    return [{ value, label: value, detail: "使用自定义" }, ...options];
  }, [options, value, allowFreeInput]);


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
      {isOpen && displayOptions.length > 0 && (
        <div id={listId} className="search-combobox__list" role="listbox">
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
      )}
    </div>
  );
}
