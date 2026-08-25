export interface Oklab {
  l: number;
  a: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export const DEFAULT_MAP_BASE = "#d6d3c2";

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channelHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_MAP_BASE;
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number];
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return clamp(value) * 255;
}

export function rgbToOklab(red: number, green: number, blue: number): Oklab {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToRgb(lab: Oklab): [number, number, number] {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function labToLch(lab: Oklab): Oklch {
  const h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), h: h < 0 ? h + 360 : h };
}

function lchToLab(lch: Oklch): Oklab {
  const radians = lch.h * Math.PI / 180;
  return { l: lch.l, a: lch.c * Math.cos(radians), b: lch.c * Math.sin(radians) };
}

export function labToHex(lab: Oklab): string {
  return rgbToHex(...oklabToRgb(lab));
}

export function colorDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function smoothRange(value: number, minimum: number, maximum: number, softness: number): number {
  if (value >= minimum && value <= maximum) return 1;
  const distance = value < minimum ? minimum - value : value - maximum;
  return clamp(1 - distance / softness);
}

export function perceptualMix(first: string, second: string, firstRatio: number): string {
  const firstLab = rgbToOklab(...hexToRgb(first));
  const secondLab = rgbToOklab(...hexToRgb(second));
  const ratio = clamp(firstRatio);
  return labToHex({
    l: firstLab.l * ratio + secondLab.l * (1 - ratio),
    a: firstLab.a * ratio + secondLab.a * (1 - ratio),
    b: firstLab.b * ratio + secondLab.b * (1 - ratio),
  });
}

export function modifyColor(color: string, patch: Partial<Oklch>): string {
  const lch = labToLch(rgbToOklab(...hexToRgb(color)));
  return labToHex(lchToLab({
    l: clamp(patch.l ?? lch.l),
    c: clamp(patch.c ?? lch.c, 0, 0.4),
    h: ((patch.h ?? lch.h) + 360) % 360,
  }));
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexToRgb(color).map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
