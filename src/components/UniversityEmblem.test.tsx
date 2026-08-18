import { type ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UniversityEmblem } from "./UniversityEmblem";
import { resetUniversityEmblemMapForTests } from "../lib/university-emblem-lookup";

function render(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(element);
    flushSync(() => {});
  });
  return host;
}

function installIntersectionObserver(intersecting: boolean) {
  const callbackHolder: { cb?: IntersectionObserverCallback } = {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        callbackHolder.cb = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  return {
    fire() {
      act(() => {
        callbackHolder.cb?.([{ isIntersecting: intersecting } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
      });
    },
  };
}

describe("UniversityEmblem", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    resetUniversityEmblemMapForTests();
  });

  it("renders nothing for an empty university", () => {
    const host = render(<UniversityEmblem university="" />);
    expect(host.querySelector(".university-emblem")).toBeNull();
  });

  it("shows a placeholder while out of view (no network request yet)", () => {
    installIntersectionObserver(false);
    const host = render(<UniversityEmblem university="浙江大学" size={24} />);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".university-emblem__placeholder")?.textContent).toBe("浙");
  });

  it("loads the emblem image only after entering the viewport", async () => {
    const observer = installIntersectionObserver(true);
    const host = render(<UniversityEmblem university="浙江大学" />);
    observer.fire();
    await vi.waitFor(() => expect(host.querySelector("img")).not.toBeNull());
    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/emblems/浙江大学.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to the placeholder when the image fails to load", async () => {
    const observer = installIntersectionObserver(true);
    const host = render(<UniversityEmblem university="浙江大学" />);
    observer.fire();
    await vi.waitFor(() => expect(host.querySelector("img")).not.toBeNull());
    const img = host.querySelector("img") as HTMLImageElement;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(host.querySelector(".university-emblem__placeholder")).not.toBeNull();
    expect(host.querySelector("img")).toBeNull();
  });

  it("shows the first-character placeholder for universities without an emblem", async () => {
    installIntersectionObserver(true);
    const host = render(<UniversityEmblem university="北京航空航天大学北海学院" />);
    await vi.waitFor(() => expect(host.querySelector(".university-emblem__placeholder")?.textContent).toBe("北"));
    expect(host.querySelector("img")).toBeNull();
  });
});
