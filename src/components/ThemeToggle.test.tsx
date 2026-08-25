import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ThemeToggle } from "./ThemeToggle";
import type { ResolvedTheme, ThemeMode } from "../lib/theme";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderToggle(mode: ThemeMode, resolvedTheme: ResolvedTheme) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onChange = vi.fn();
  flushSync(() => root.render(<ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onChange={onChange} />));
  return { button: container.querySelector("button")!, onChange };
}

function click(element: HTMLElement): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("ThemeToggle", () => {
  it("keeps a fixed accessible name and conveys the theme through aria-pressed only", () => {
    const light = renderToggle("light", "light");
    expect(light.button.getAttribute("aria-label")).toBe("暗色模式");
    expect(light.button.getAttribute("aria-pressed")).toBe("false");

    const dark = renderToggle("dark", "dark");
    // The name must not flip together with the state (name/state contradiction).
    expect(dark.button.getAttribute("aria-label")).toBe("暗色模式");
    expect(dark.button.getAttribute("aria-pressed")).toBe("true");
  });

  it("matches the tooltip to the accessible name and hides the decorative icon", () => {
    const { button } = renderToggle("light", "light");
    expect(button.getAttribute("title")).toBe(button.getAttribute("aria-label"));
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("switches to dark from light and back to light from dark", () => {
    const light = renderToggle("light", "light");
    click(light.button);
    expect(light.onChange).toHaveBeenCalledWith("dark");

    const systemDark = renderToggle("system", "dark");
    expect(systemDark.button.dataset.themeMode).toBe("system");
    click(systemDark.button);
    expect(systemDark.onChange).toHaveBeenCalledWith("light");
  });
});
