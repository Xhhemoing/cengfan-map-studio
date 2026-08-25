import { describe, expect, it, vi } from "vitest";
import { downloadBlob, downloadText } from "./export-poster";
import {
  fakePngBytes,
  installAnchorStub,
  installObjectUrlStubs,
  installPosterStubCleanup,
} from "./export-poster-test-fixtures";

installPosterStubCleanup();

describe("poster export", () => {
  describe("downloads", () => {
    it("delays revoking the object url and leaves no anchor behind", async () => {
      vi.useFakeTimers();
      try {
        const urls = installObjectUrlStubs();
        const { link, click } = installAnchorStub();

        downloadBlob(new Blob([fakePngBytes(16)], { type: "image/png" }), "我的毕业去向图.png");

        expect(link.getAttribute("href")).toBe("blob:mock-1");
        expect(link.download).toBe("我的毕业去向图.png");
        expect(click).toHaveBeenCalledTimes(1);
        expect(document.body.contains(link)).toBe(false);
        expect(document.querySelector("a[download]")).toBeNull();
        // 同一个任务里 revoke 会让尚未开始的下载被取消。
        expect(urls.revoked).toEqual([]);
        vi.advanceTimersByTime(1000);
        expect(urls.revoked).toEqual(["blob:mock-1"]);
        expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("revokes immediately when the download click is blocked", () => {
      const urls = installObjectUrlStubs();
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      vi.spyOn(link, "click").mockImplementation(() => { throw new Error("下载被拦截"); });
      const original = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => (tag === "a" ? link : original(tag)));

      expect(() => downloadBlob(new Blob(["png"]), "我的毕业去向图.png")).toThrow("下载被拦截");
      expect(urls.revoked).toEqual(["blob:mock-1"]);
    });

    it("routes text downloads through the same blob path", async () => {
      vi.useFakeTimers();
      try {
        const urls = installObjectUrlStubs();
        const { link } = installAnchorStub();

        downloadText("<svg/>", "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");

        expect(link.download).toBe("我的毕业去向图.svg");
        expect(urls.created[0]?.type).toBe("image/svg+xml;charset=utf-8");
        expect(urls.revoked).toEqual([]);
        vi.advanceTimersByTime(1000);
        expect(urls.revoked).toEqual(["blob:mock-1"]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
