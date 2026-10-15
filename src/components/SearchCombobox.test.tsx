import { act, type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCities, searchUniversities } from "../lib/search-catalog";
import {
  SearchCombobox,
  type SearchComboboxOption,
} from "./SearchCombobox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    act(() => flushSync(() => root.unmount()));
    container.remove();
  });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => flushSync(() => root.render(element)));
  return container;
}

function changeInput(input: HTMLInputElement, value: string): void {
  act(() => flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }));
}

function pressKey(input: HTMLInputElement, key: string): void {
  act(() => flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))));
}

function click(element: Element): void {
  act(() => flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))));
}

function universityOptions(query: string): SearchComboboxOption[] {
  return searchUniversities(query).map((university) => ({
    value: university.name,
    label: university.name,
    detail: university.city,
  }));
}

function cityOptions(query: string): SearchComboboxOption[] {
  return searchCities(query).map((city) => ({
    value: city.name,
    label: city.name,
    detail: city.province,
  }));
}

function ComboboxHarness({
  label,
  options,
  portal = false,
  allowFreeInput = false,
}: {
  label: string;
  options: (query: string) => SearchComboboxOption[];
  portal?: boolean;
  allowFreeInput?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchCombobox
        label={label}
        value={value}
        placeholder={label}
        searchOptions={options}
        portal={portal}
        allowFreeInput={allowFreeInput}
        onChange={setValue}
      />
      <output data-testid="selected-value">{value}</output>
    </>
  );
}

describe("SearchCombobox", () => {
  it("keeps refocused suggestions and the active option when an old blur deadline passes", () => {
    vi.useFakeTimers();
    const container = render(<><ComboboxHarness label="城市" options={cityOptions} /><button data-testid="outside">下一字段</button></>);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    const outside = container.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
    act(() => input.focus());
    changeInput(input, "杭州");
    pressKey(input, "ArrowDown");
    const activeOption = input.getAttribute("aria-activedescendant");

    act(() => outside.focus());
    act(() => { vi.advanceTimersByTime(60); });
    act(() => input.focus());
    act(() => { vi.advanceTimersByTime(120); });

    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(activeOption);
    pressKey(input, "Enter");
    expect(input.value).toBe("杭州市");
  });

  it("closes genuinely blurred suggestions and clears their active descendant", () => {
    vi.useFakeTimers();
    const container = render(<><ComboboxHarness label="城市" options={cityOptions} /><button data-testid="outside">下一字段</button></>);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    const outside = container.querySelector<HTMLButtonElement>('[data-testid="outside"]')!;
    act(() => input.focus());
    changeInput(input, "杭州");
    pressKey(input, "ArrowDown");
    act(() => outside.focus());
    act(() => { vi.advanceTimersByTime(119); });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.activeElement).toBe(outside);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(input.hasAttribute("aria-controls")).toBe(false);
  });

  it("cancels pending blur work when the combobox unmounts", () => {
    vi.useFakeTimers();
    const container = render(<><ComboboxHarness label="城市" options={cityOptions} /><button data-testid="outside">下一字段</button></>);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    act(() => input.focus());
    changeInput(input, "杭州");
    // Use the DOM timer interface instead of Window & Node's global overloads.
    const browserTimers: Pick<Window, "setTimeout" | "clearTimeout"> = window;
    const setTimeout = browserTimers.setTimeout.bind(window);
    const blurWork = vi.fn();
    const schedule = vi.spyOn(browserTimers, "setTimeout").mockImplementation((handler, delay, ...args) => {
      if (delay !== 120) return setTimeout(handler, delay, ...args);
      return setTimeout(() => {
        blurWork();
        if (typeof handler === "function") handler(...args);
      }, delay);
    });
    const cancel = vi.spyOn(browserTimers, "clearTimeout");
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="outside"]')!.focus());
    const blurIndex = schedule.mock.calls.findIndex(([, delay]) => delay === 120);
    expect(blurIndex).toBeGreaterThanOrEqual(0);
    const blurHandle = schedule.mock.results[blurIndex]!.value;
    const mounted = roots.pop()!;
    act(() => mounted.root.unmount());
    mounted.container.remove();
    expect(cancel).toHaveBeenCalledWith(blurHandle);
    act(() => { vi.advanceTimersByTime(240); });
    expect(blurWork).not.toHaveBeenCalled();
  });

  it("announces custom suggestions and removes the active descendant when closed", () => {
    const container = render(<ComboboxHarness label="城市" options={() => []} allowFreeInput />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;

    changeInput(input, "月球基地");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="listbox"]')?.id).toBe(input.getAttribute("aria-controls"));
    pressKey(input, "ArrowDown");
    expect(document.getElementById(input.getAttribute("aria-activedescendant")!)).toBe(container.querySelector('[role="option"]'));

    pressKey(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(input.hasAttribute("aria-controls")).toBe(false);
  });

  it("keeps focus on the input after keyboard or pointer selection and keeps options out of the Tab order", () => {
    const container = render(<ComboboxHarness label="城市" options={cityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    act(() => flushSync(() => input.focus()));

    changeInput(input, "杭州");
    expect([...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].every((option) => option.tabIndex === -1)).toBe(true);
    pressKey(input, "ArrowDown");
    pressKey(input, "Enter");
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");

    changeInput(input, "北京");
    click(container.querySelector('[role="option"]')!);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it.each([false, true])("consumes Escape only while a suggestion list is visible (portal=%s)", (portal) => {
    let escaped = 0;
    // The editor row handles a React key event. A native root listener runs
    // before React dispatches the child handler and cannot model that contract.
    const container = render(
      <div onKeyDown={(event) => { if (event.key === "Escape") escaped += 1; }}>
        <ComboboxHarness label="城市" options={cityOptions} portal={portal} />
      </div>,
    );
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    changeInput(input, "杭州");
    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => flushSync(() => input.dispatchEvent(first)));
    expect(first.defaultPrevented).toBe(true);
    expect(escaped).toBe(0);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    pressKey(input, "Escape");
    expect(escaped).toBe(1);
  });

  it("allows a parent form to handle Enter after suggestions have closed", () => {
    const container = render(<ComboboxHarness label="城市" options={cityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    changeInput(input, "杭州");
    pressKey(input, "ArrowDown");
    const choose = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => flushSync(() => input.dispatchEvent(choose)));
    expect(choose.defaultPrevented).toBe(true);

    const submit = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => flushSync(() => input.dispatchEvent(submit)));
    expect(submit.defaultPrevented).toBe(false);
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])("leaves IME confirmation and navigation untouched: %j", (composition) => {
    const container = render(<ComboboxHarness label="城市" options={cityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    act(() => flushSync(() => input.focus()));
    changeInput(input, "杭州");
    pressKey(input, "ArrowDown");
    const active = input.getAttribute("aria-activedescendant");
    for (const key of ["Enter", "Escape", "ArrowDown", "ArrowUp"]) {
      const event = new KeyboardEvent("keydown", { ...composition, key, bubbles: true, cancelable: true });
      act(() => flushSync(() => input.dispatchEvent(event)));
      expect(event.defaultPrevented).toBe(false);
      expect(input.value).toBe("杭州");
      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(input.getAttribute("aria-activedescendant")).toBe(active);
      expect(document.activeElement).toBe(input);
    }
    pressKey(input, "Enter");
    expect(input.value).toBe("杭州市");
  });

  it("selects the canonical university suggestion for an alias", async () => {
    const container = await render(<ComboboxHarness label="录取院校" options={universityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="录取院校"]')!;

    await changeInput(input, "北大");
    const option = [...container.querySelectorAll('[role="option"]')].find(
      (element) => element.textContent?.includes("北京大学"),
    )!;
    await click(option);

    expect(container.querySelector('[data-testid="selected-value"]')?.textContent).toBe("北京大学");
  });

  it("selects the canonical city suggestion with its province detail", async () => {
    const container = await render(<ComboboxHarness label="城市" options={cityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;

    await changeInput(input, "杭州");
    expect(container.textContent).toContain("杭州市 · 浙江省");
    const option = container.querySelector('[role="option"]')!;
    await click(option);

    expect(container.querySelector('[data-testid="selected-value"]')?.textContent).toBe("杭州市");
  });

  it("supports ArrowDown, Enter, and Escape without rejecting free text", async () => {
    const container = await render(<ComboboxHarness label="录取院校" options={universityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="录取院校"]')!;

    await changeInput(input, "北大");
    await pressKey(input, "ArrowDown");
    await pressKey(input, "Enter");
    expect(input.value).toBe("北京大学");

    await changeInput(input, "自定义学院");
    expect(input.value).toBe("自定义学院");
    await pressKey(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("mounts portal suggestions outside the combobox clipping context", async () => {
    const container = render(<ComboboxHarness label="城市" options={cityOptions} portal />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;

    await changeInput(input, "杭州");

    const list = document.body.querySelector<HTMLElement>(".search-combobox__list--portal");
    expect(list).not.toBeNull();
    expect(container.contains(list)).toBe(false);
    expect(list?.getAttribute("role")).toBe("listbox");
  });

  it("caps portal height to the available viewport space", async () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 80 });
    const container = render(<ComboboxHarness label="城市" options={cityOptions} portal />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    Object.defineProperty(input, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 30,
        height: 20,
        left: 20,
        right: 180,
        top: 10,
        width: 160,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    await changeInput(input, "杭州");

    const list = document.body.querySelector<HTMLElement>(".search-combobox__list--portal");
    expect(Number.parseFloat(list?.style.maxHeight ?? "0")).toBeLessThanOrEqual(42);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  });
});
