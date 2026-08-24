/**
 * 把序列化后的海报 SVG 里的外链图片抓成 data URL 再回填。
 *
 * 背景：`PosterCanvas` 的校徽走 `/emblems/*.webp` 这种同源相对路径，而 PNG 导出
 * 是「SVG 当作 <img> 加载再画进 canvas」。这种 SVG-as-image 文档处于受限模式，
 * 浏览器会拒绝加载任何外部资源，校徽因此静默消失（既不报错也不留占位）。
 * 导出的 .svg 文件同理：换台机器打开就找不到 `/emblems`。
 * 头像、背景、素材已经是 data URL，所以只有校徽会丢。
 *
 * 失败一律跳过：内联是画质增强，不该把「某个校徽 404」升级成整次导出失败。
 *
 * 回滚方案：调用方（`usePosterExport` 的 exportSvg / exportPng）删掉
 * `await inlineSvgImages(...)` 这一行即可，本模块无其他副作用；缓存随之失效。
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/** `fetch` 拿不到 content-type 时按扩展名兜底，别让 data URL 带错 MIME。 */
const MIME_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

const FALLBACK_MIME = "application/octet-stream";

/** 成功结果按 URL 长期缓存；失败会被移除，下次导出重试。 */
const inlineCache = new Map<string, Promise<string | null>>();

/** 仅供测试与「换了一套素材」场景使用。 */
export function clearSvgImageInlineCache(): void {
  inlineCache.clear();
}

/** 需要内联的 href：已经是 data URL、片段引用、空值都不用管。 */
export function isExternalImageHref(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return !trimmed.startsWith("data:") && !trimmed.startsWith("#");
}

/**
 * 序列化后的 SVG 里是否还有需要联网抓取的 `<image>`。
 * 纯字符串判断，调用方可以据此决定「这次导出到底要不要变成异步」——
 * 绝大多数海报（标准卡片样式）根本没有外链图片，不该为此把同步导出改成异步。
 */
export function hasExternalSvgImages(markup: string): boolean {
  return /<image\b[^>]*\s(?:xlink:)?href\s*=\s*(["'])(?!data:|#)/.test(markup);
}

function guessMimeType(url: string): string {
  const path = url.split(/[?#]/, 1)[0] ?? "";
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? FALLBACK_MIME;
}

/** 分块转 base64：整包 `String.fromCharCode(...bytes)` 在大图上会撑爆调用栈。 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  const cached = inlineCache.get(url);
  if (cached) return await cached;

  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}`);
    const buffer = await response.arrayBuffer();
    const contentType = response.headers?.get?.("content-type") ?? "";
    const mime = contentType.split(";")[0]?.trim() || guessMimeType(url);
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`;
  })().catch(() => {
    // 失败不留缓存：404 可能只是这次网络抖动，下次导出还该再试一遍。
    inlineCache.delete(url);
    return null;
  });

  inlineCache.set(url, pending);
  return await pending;
}

interface ImageHrefTarget {
  element: Element;
  attribute: "href" | "xlink:href";
  url: string;
}

function collectImageHrefs(doc: Document): ImageHrefTarget[] {
  const targets: ImageHrefTarget[] = [];
  for (const element of Array.from(doc.getElementsByTagNameNS(SVG_NS, "image"))) {
    const href = element.getAttribute("href");
    if (isExternalImageHref(href)) {
      targets.push({ element, attribute: "href", url: href.trim() });
      continue;
    }
    const xlinkHref = element.getAttributeNS(XLINK_NS, "href") ?? element.getAttribute("xlink:href");
    if (isExternalImageHref(xlinkHref)) {
      targets.push({ element, attribute: "xlink:href", url: xlinkHref.trim() });
    }
  }
  return targets;
}

function applyDataUrl(target: ImageHrefTarget, dataUrl: string): void {
  if (target.attribute === "href") {
    target.element.setAttribute("href", dataUrl);
    return;
  }
  target.element.setAttributeNS(XLINK_NS, "xlink:href", dataUrl);
}

/**
 * 返回一份把外链 `<image>` 换成 data URL 的 SVG 源码。
 * 无外链、解析失败、环境没有 `fetch`/`DOMParser` 时原样返回；任何单张图片失败都只是跳过。
 */
export async function inlineSvgImages(markup: string): Promise<string> {
  if (!hasExternalSvgImages(markup)) return markup;
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined" || typeof fetch !== "function") {
    return markup;
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  } catch {
    return markup;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return markup;

  const targets = collectImageHrefs(doc);
  if (targets.length === 0) return markup;

  const urls = [...new Set(targets.map((target) => target.url))];
  const resolved = new Map(await Promise.all(urls.map(async (url) => [url, await fetchAsDataUrl(url)] as const)));

  let replaced = 0;
  for (const target of targets) {
    const dataUrl = resolved.get(target.url);
    if (!dataUrl) continue;
    applyDataUrl(target, dataUrl);
    replaced += 1;
  }
  if (replaced === 0) return markup;

  return new XMLSerializer().serializeToString(doc);
}
