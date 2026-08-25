import { afterEach, vi } from "vitest";

/**
 * 伪造的 PNG 编码结果字节数（1800×1200 海报的量级），用来对比 blob 通道与
 * base64 通道的物化体积。取 3 的倍数，base64 往返后字节数才不会因补位漂移。
 */
export const FAKE_PNG_BYTES = 1_999_998;

export function fakePngBytes(size = FAKE_PNG_BYTES): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  return bytes;
}

export function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

/**
 * 所有 canvas / Image / URL 替身都是全局或 document 级的，漏掉一次还原就会让
 * 后面的用例读到上一个用例的编码器。每个拆分文件在顶层调一次这个安装器。
 */
export function installPosterStubCleanup(): void {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}

export interface CanvasMockOptions {
  /** 不提供 toBlob（模拟 jsdom / 老浏览器）。 */
  withoutToBlob?: boolean;
  /** toBlob 回 null（编码器拒绝），应降级到 toDataURL。 */
  toBlobReturnsNull?: boolean;
  toDataURL?: () => string;
}

export function installCanvasStub(options: CanvasMockOptions = {}) {
  const context = { fillStyle: "", font: "", fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
  const dataUrl = `data:image/png;base64,${"A".repeat(base64Length(FAKE_PNG_BYTES))}`;
  const canvas: Record<string, unknown> = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(options.toDataURL ?? (() => dataUrl)),
  };
  if (!options.withoutToBlob) {
    canvas.toBlob = vi.fn((callback: BlobCallback) => {
      callback(options.toBlobReturnsNull ? null : new Blob([fakePngBytes()], { type: "image/png" }));
    });
  }
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : original(tag),
  );
  return { canvas, context, dataUrl };
}

export function installAnchorStub() {
  const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
  const click = vi.spyOn(link, "click").mockImplementation(() => {});
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
    tag === "a" ? link : original(tag),
  );
  return { link, click };
}

/** 记录 object URL 生命周期，用于「只回收一次、且在 load/error 之后」的断言。 */
export function installObjectUrlStubs() {
  const created: Blob[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    counter += 1;
    return `blob:mock-${counter}`;
  });
  const revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  return { created, revoked, createObjectURL, revokeObjectURL };
}

export function installImmediateImageStub(): void {
  class ReadyImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", ReadyImage);
}

export function installBrokenImageStub(): void {
  class BrokenImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
  }
  vi.stubGlobal("Image", BrokenImage);
}

/** blob: URL 一律解码失败，data: URL 正常出图；`attempted` 记录尝试过的协议前缀。 */
export function installBlobHostileImageStub(): { attempted: string[] } {
  const attempted: string[] = [];
  class BlobHostileImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      attempted.push(value.slice(0, 5));
      const failed = value.startsWith("blob:");
      queueMicrotask(() => (failed ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", BlobHostileImage);
  return { attempted };
}

/** 图片停在加载中，直到调用方 `release()`，用来观察 revoke 的时机。 */
export function installDeferredImageStub(): { release: () => void } {
  let settle: (() => void) | undefined;
  class DeferredImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      settle = () => this.onload?.();
    }
  }
  vi.stubGlobal("Image", DeferredImage);
  return { release: () => settle?.() };
}

/** 在假计时器下延迟 `delayMs` 才 load，用来压测加载期限。 */
export function installSlowImageStub(delayMs: number): void {
  class SlowImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      window.setTimeout(() => this.onload?.(), delayMs);
    }
  }
  vi.stubGlobal("Image", SlowImage);
}

export function installHungImageStub(): void {
  class HungImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { /* 永不落地 */ }
  }
  vi.stubGlobal("Image", HungImage);
}

/** 约 8MB 的合成海报：真实标记结构 + 中文姓名，encodeURIComponent 会显著膨胀。 */
export function createSyntheticSvg(targetChars = 8_000_000): string {
  const row = '<text x="120" y="240" fill="#215d75" font-family="Noto Sans SC" font-size="28">'
    + "李思远 · 清华大学 · 北京市</text>"
    + '<path d="M120.5 240.25 L188.75 302.5 L240 330" stroke="#215d75" stroke-width="1.5" fill="none"/>';
  const parts: string[] = ['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200">'];
  let length = parts[0].length;
  while (length < targetChars) {
    parts.push(row);
    length += row.length;
  }
  parts.push("</svg>");
  return parts.join("");
}
