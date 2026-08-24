import { describe, expect, it } from "vitest";
import { createUserAsset } from "./assets";
import { posterPngExportSize } from "./export-poster";
import { runPrintPreflight } from "./print-preflight";
import { createProjectDocument } from "./project-document";

describe("print preflight journey", () => {
  it("flags print risks before a 3mm 300dpi export and clears them after correction", () => {
    const project = createProjectDocument({
      students: [{
        id: "student-print-1",
        name: "林舟",
        university: "北京大学",
        city: "北京市",
        province: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    });
    project.canvas.printBleedMm = 3;

    const background = {
      ...createUserAsset({
        label: "班级合照",
        src: "data:image/png;base64,recorded-by-fixture",
        kind: "background",
      }),
      naturalWidth: 600,
      naturalHeight: 400,
    };
    project.canvas.backgroundImageSrc = background.src;

    const preflight = runPrintPreflight(project, {
      assets: [background],
      fonts: [],
      pngScale: 300 / 96,
      transparentExport: true,
    });

    expect(preflight).toMatchObject({
      bleedMm: 3,
      exportDpi: 300,
      measuredRasters: 1,
      ready: false,
    });
    expect(preflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "low-resolution-raster", target: "background", severity: "warning" }),
      expect.objectContaining({ kind: "transparent-bleed", target: "background", severity: "warning" }),
    ]));
    expect(posterPngExportSize(project.canvas, {
      printBleedMm: project.canvas.printBleedMm,
      scale: 300 / 96,
    })).toEqual({ width: 4829, height: 3267 });

    const printReadyBackground = {
      ...background,
      naturalWidth: 5000,
      naturalHeight: 3334,
    };
    const corrected = runPrintPreflight(project, {
      assets: [printReadyBackground],
      fonts: [],
      pngScale: 300 / 96,
      transparentExport: false,
    });

    expect(corrected.issues).toEqual([]);
    expect(corrected.ready).toBe(true);
    expect(corrected.unmeasured).toEqual([]);
  });
});
