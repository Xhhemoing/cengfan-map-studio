import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSvgImageInlineCache, hasExternalSvgImages, inlineSvgImages, isExternalImageHref } from "./svg-image-inline";

const EMBLEM_BYTES = new Uint8Array([82, 73, 70, 70]);
const EMBLEM_BASE64 = btoa(String.fromCharCode(...EMBLEM_BYTES));

function okResponse(bytes: Uint8Array, contentType?: string): unknown {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType ?? null : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function svgWith(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10">${body}</svg>`;
}

function stubFetch(implementation: (url: string) => unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string) => implementation(url));
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  clearSvgImageInlineCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSvgImageInlineCache();
});

describe("isExternalImageHref", () => {
  it("only flags hrefs that need a network round trip", () => {
    expect(isExternalImageHref("/emblems/北京大学.webp")).toBe(true);
    expect(isExternalImageHref("https://cdn.example.com/a.png")).toBe(true);
    expect(isExternalImageHref("data:image/png;base64,AAAA")).toBe(false);
    expect(isExternalImageHref("#clip-1")).toBe(false);
    expect(isExternalImageHref("   ")).toBe(false);
    expect(isExternalImageHref(null)).toBe(false);
  });
});

describe("hasExternalSvgImages", () => {
  it("spots emblem images that still need fetching", () => {
    expect(hasExternalSvgImages(svgWith('<image href="/emblems/a.webp" width="18"/>'))).toBe(true);
    expect(hasExternalSvgImages(svgWith('<image width="18" xlink:href="/emblems/a.webp"/>'))).toBe(true);
  });

  it("stays false for posters whose images are already self-contained", () => {
    expect(hasExternalSvgImages(svgWith('<image href="data:image/png;base64,AAAA"/>'))).toBe(false);
    expect(hasExternalSvgImages(svgWith('<image href="#pattern-1"/>'))).toBe(false);
    expect(hasExternalSvgImages(svgWith('<text>无图</text><use href="#card"/>'))).toBe(false);
  });
});

describe("inlineSvgImages", () => {
  it("replaces an external emblem href with a data URL and leaves everything else alone", async () => {
    const fetchMock = stubFetch(() => okResponse(EMBLEM_BYTES, "image/webp"));
    const markup = svgWith(
      '<image href="/emblems/%E5%8C%97%E4%BA%AC%E5%A4%A7%E5%AD%A6.webp" x="1" y="2" width="18" height="18"/>'
      + '<image href="data:image/png;base64,AAAA" x="3" y="4"/>'
      + "<text>北京大学</text>",
    );

    const result = await inlineSvgImages(markup);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/emblems/%E5%8C%97%E4%BA%AC%E5%A4%A7%E5%AD%A6.webp");
    expect(result).toContain(`href="data:image/webp;base64,${EMBLEM_BASE64}"`);
    expect(result).not.toContain("/emblems/");
    expect(result).toContain('href="data:image/png;base64,AAAA"');
    expect(result).toContain("<text>北京大学</text>");
    expect(result).toContain('width="18"');
  });

  it("falls back to the file extension when the response has no content type", async () => {
    stubFetch(() => okResponse(EMBLEM_BYTES));

    const result = await inlineSvgImages(svgWith('<image href="/emblems/a.webp"/>'));

    expect(result).toContain(`href="data:image/webp;base64,${EMBLEM_BASE64}"`);
  });

  it("inlines xlink:href images too", async () => {
    stubFetch(() => okResponse(EMBLEM_BYTES, "image/webp"));

    const result = await inlineSvgImages(svgWith('<image xlink:href="/emblems/a.webp"/>'));

    expect(result).toContain(`data:image/webp;base64,${EMBLEM_BASE64}`);
    expect(result).not.toContain("/emblems/a.webp");
  });

  it("fetches each distinct URL once across images and across calls", async () => {
    const fetchMock = stubFetch(() => okResponse(EMBLEM_BYTES, "image/webp"));
    const markup = svgWith('<image href="/emblems/a.webp"/><image href="/emblems/a.webp"/><image href="/emblems/b.webp"/>');

    const first = await inlineSvgImages(markup);
    const second = await inlineSvgImages(markup);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
    expect(first.match(/data:image\/webp/g)).toHaveLength(3);
  });

  it("skips a failing image without throwing and still inlines its siblings", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("missing")) throw new Error("network down");
      return okResponse(EMBLEM_BYTES, "image/webp");
    });

    const result = await inlineSvgImages(svgWith('<image href="/emblems/missing.webp"/><image href="/emblems/ok.webp"/>'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toContain('href="/emblems/missing.webp"');
    expect(result).toContain(`data:image/webp;base64,${EMBLEM_BASE64}`);
  });

  it("skips non-ok responses", async () => {
    stubFetch(() => ({ ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }));

    const markup = svgWith('<image href="/emblems/a.webp"/>');
    await expect(inlineSvgImages(markup)).resolves.toBe(markup);
  });

  it("does not cache failures, so a later export retries", async () => {
    let shouldFail = true;
    const fetchMock = stubFetch(() => {
      if (shouldFail) throw new Error("network down");
      return okResponse(EMBLEM_BYTES, "image/webp");
    });
    const markup = svgWith('<image href="/emblems/a.webp"/>');

    await inlineSvgImages(markup);
    shouldFail = false;
    const retried = await inlineSvgImages(markup);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retried).toContain(`data:image/webp;base64,${EMBLEM_BASE64}`);
  });

  it("returns the markup untouched when there is nothing external to fetch", async () => {
    const fetchMock = stubFetch(() => okResponse(EMBLEM_BYTES, "image/webp"));
    const markup = svgWith('<image href="data:image/png;base64,AAAA"/><text>无校徽</text>');

    await expect(inlineSvgImages(markup)).resolves.toBe(markup);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the markup untouched when it cannot be parsed", async () => {
    const fetchMock = stubFetch(() => okResponse(EMBLEM_BYTES, "image/webp"));
    const broken = '<svg xmlns="http://www.w3.org/2000/svg"><image href="/emblems/a.webp">';

    await expect(inlineSvgImages(broken)).resolves.toBe(broken);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
