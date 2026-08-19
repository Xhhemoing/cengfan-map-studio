import { describe, expect, it } from "vitest";
import {
  isPrototypePath,
  normalizePublicBasePath,
  stripPublicBase,
} from "./public-base-path";

describe("public base path", () => {
  it("normalizes missing, relative, and unprefixed values to a rooted slash path", () => {
    expect(normalizePublicBasePath(undefined)).toBe("/");
    expect(normalizePublicBasePath("")).toBe("/");
    expect(normalizePublicBasePath("./")).toBe("/");
    expect(normalizePublicBasePath("/")).toBe("/");
    expect(normalizePublicBasePath("cengfan-map-studio")).toBe("/cengfan-map-studio/");
    expect(normalizePublicBasePath("/cengfan-map-studio")).toBe("/cengfan-map-studio/");
    expect(normalizePublicBasePath("/cengfan-map-studio/")).toBe("/cengfan-map-studio/");
  });

  it("strips a GitHub Pages project base so pathname checks stay stable", () => {
    expect(stripPublicBase("/cengfan-map-studio", "/cengfan-map-studio/")).toBe("/");
    expect(stripPublicBase("/cengfan-map-studio/", "/cengfan-map-studio/")).toBe("/");
    expect(stripPublicBase("/cengfan-map-studio/prototype", "/cengfan-map-studio/")).toBe("/prototype");
    expect(stripPublicBase("/prototype", "/")).toBe("/prototype");
  });

  it("recognizes the workflow prototype path with and without a project base", () => {
    expect(isPrototypePath("/prototype", "/")).toBe(true);
    expect(isPrototypePath("/prototype/", "/")).toBe(true);
    expect(isPrototypePath("/cengfan-map-studio/prototype", "/cengfan-map-studio/")).toBe(true);
    expect(isPrototypePath("/", "/")).toBe(false);
    expect(isPrototypePath("/cengfan-map-studio/", "/cengfan-map-studio/")).toBe(false);
  });
});
