import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestsLayer, type GuestsLayerProps } from "./GuestsLayer";
import { computeGuestPanelLayout } from "../../lib/guest-panel-layout";
import type { GuestPanelSettings, GuestPerson } from "../../lib/scene-document";

function panel(overrides: Partial<GuestPanelSettings> = {}): GuestPanelSettings {
  return {
    title: "特邀嘉宾 · 老师名单",
    x: 48,
    y: 780,
    width: 280,
    padding: 14,
    background: "#ffffff",
    opacity: 0.92,
    textColor: "#1c3154",
    fontSize: 13,
    visibility: true,
    people: [],
    ...overrides,
  };
}

function person(overrides: Partial<GuestPerson> & { id: string }): GuestPerson {
  return { name: `老师${overrides.id}`, visibility: true, ...overrides };
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

function render(guests: GuestPanelSettings, overrides: Partial<GuestsLayerProps> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  const props: GuestsLayerProps = {
    guests,
    layout: computeGuestPanelLayout(guests, 1),
    edgeColor: "#39434e",
    userFonts: [],
    exportMode: false,
    canvasWidth: 1200,
    canvasHeight: 1600,
    renderIntervalMs: 0,
    canvasPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    ...overrides,
  };
  flushSync(() => root.render(<svg><GuestsLayer {...props} /></svg>));
  return container;
}

afterEach(() => {
  vi.useRealTimers();
  while (mounted.length > 0) {
    const entry = mounted.pop()!;
    flushSync(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("GuestsLayer", () => {
  it("draws the panel frame, title and list rows at the layout offsets", () => {
    const guests = panel({
      titleTypography: { fontSize: 19 },
      peopleTypography: { color: "#556677" },
      people: [person({ id: "g1", name: "李老师", title: "班主任", note: "桃李满天下" })],
    });
    const container = render(guests);
    const layout = computeGuestPanelLayout(guests, 1);

    const group = container.querySelector("[data-guests-layer]")!;
    expect(group.getAttribute("transform")).toBe("translate(48 780)");
    expect(group.querySelector("rect")?.getAttribute("height")).toBe(String(layout.height));
    expect(container.querySelector("[data-guest-title]")?.getAttribute("font-size")).toBe("19");

    const row = container.querySelector('[data-guest-person="g1"]')!;
    expect(row.textContent).toBe("李老师 · 班主任");
    expect(row.getAttribute("fill")).toBe("#556677");
    expect(row.getAttribute("y")).toBe(String(guests.padding + 30 + layout.titleFontSize));
    expect(container.querySelector('[data-guest-note="g1"]')?.textContent).toBe("桃李满天下");
  });

  it("keeps the per-guest avatar clip ids in both display modes", () => {
    const people = [person({ id: "g1", avatarSrc: "data:image/png;base64,AA==" })];
    const list = render(panel({ people }));
    expect(list.querySelector('[data-guest-avatar="g1"] clipPath')?.getAttribute("id"))
      .toBe("guest-avatar-clip-g1");
    expect(list.querySelector('[data-guest-avatar="g1"] image')?.getAttribute("clip-path"))
      .toBe("url(#guest-avatar-clip-g1)");

    const cards = render(panel({ displayMode: "cards", people }));
    expect(cards.querySelector('[data-guest-card="g1"]')).not.toBeNull();
    expect(cards.querySelector('[data-guest-avatar="g1"] clipPath')?.getAttribute("id"))
      .toBe("guest-avatar-clip-g1");
  });

  it("falls back to an initial glyph when a card guest has no avatar", () => {
    const container = render(panel({
      displayMode: "cards",
      people: [person({ id: "g1", name: "李老师" })],
    }));
    expect(container.querySelector('[data-guest-avatar-initial="g1"]')?.textContent).toBe("李");
  });

  it("renders one text node per wrapped custom-text line", () => {
    const container = render(panel({ customText: "第一行\n第二行", people: [] }));
    const lines = container.querySelectorAll("[data-guest-custom-text]");
    expect([...lines].map((line) => line.textContent)).toEqual(["第一行", "第二行"]);
  });

  it("shows the empty-state hint only when there is neither a guest nor custom text", () => {
    expect(render(panel()).textContent).toContain("在右侧添加老师 / 嘉宾");
    expect(render(panel({ customText: "仅自定义文本" })).textContent).not.toContain("在右侧添加老师 / 嘉宾");
  });

  it("previews the drag on the DOM node and commits the clamped position on release", () => {
    vi.useFakeTimers();
    const onMoveGuests = vi.fn();
    const container = render(panel(), { onMoveGuests });
    const group = container.querySelector<SVGGElement>("[data-guests-layer]")!;
    Object.assign(group, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 60, clientY: 800 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 160, clientY: 900 })));
    flushSync(() => vi.advanceTimersByTime(20));

    // The preview writes straight to the node; no commit until pointerup.
    expect(group.getAttribute("transform")).toBe("translate(148 880)");
    expect(onMoveGuests).not.toHaveBeenCalled();

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })));
    expect(onMoveGuests).toHaveBeenCalledWith(148, 880);
  });

  it("throttles drag previews to the render interval", () => {
    vi.useFakeTimers();
    const container = render(panel(), { onMoveGuests: vi.fn(), renderIntervalMs: 100 });
    const group = container.querySelector<SVGGElement>("[data-guests-layer]")!;
    Object.assign(group, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 60, clientY: 800 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 160, clientY: 900 })));
    expect(group.getAttribute("transform")).toBe("translate(48 780)");

    flushSync(() => vi.advanceTimersByTime(100));
    expect(group.getAttribute("transform")).toBe("translate(148 880)");
  });

  it("restores the original position when the drag is cancelled", () => {
    const onMoveGuests = vi.fn();
    const container = render(panel(), { onMoveGuests });
    const group = container.querySelector<SVGGElement>("[data-guests-layer]")!;
    Object.assign(group, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });

    flushSync(() => group.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 60, clientY: 800 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 160, clientY: 900 })));
    flushSync(() => group.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })));

    expect(group.getAttribute("transform")).toBe("translate(48 780)");
    expect(onMoveGuests).not.toHaveBeenCalled();
  });

  it("drops selection affordances and drag handlers in export mode", () => {
    const onSelectGuests = vi.fn();
    const container = render(panel(), { exportMode: true, onSelectGuests, onMoveGuests: vi.fn() });
    const group = container.querySelector<SVGGElement>("[data-guests-layer]")!;
    expect(group.getAttribute("role")).toBeNull();
    expect(group.getAttribute("tabindex")).toBeNull();

    flushSync(() => group.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectGuests).not.toHaveBeenCalled();
  });

  it("reports a selection on click in editor mode", () => {
    const onSelectGuests = vi.fn();
    const container = render(panel(), { onSelectGuests });
    const group = container.querySelector<SVGGElement>("[data-guests-layer]")!;
    expect(group.getAttribute("role")).toBe("button");

    flushSync(() => group.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectGuests).toHaveBeenCalledTimes(1);
  });
});
