import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const stages = [["名单", "data"], ["地图", "map"], ["版式", "frame"], ["内容", "content"], ["交付", "export"]];

async function selectStage(page, label, id) {
  await page.getByRole("navigation", { name: "制作步骤", exact: true })
    .getByRole("button", { name: new RegExp(`^${label}(?:，|$)`) }).click();
  await page.locator(`.studio-editor-shell[data-stage="${id}"]`).waitFor();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function minimumTarget(locator, minimum, description) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width >= minimum && box.height >= minimum, `${description}: expected ${minimum} px target, got ${JSON.stringify(box)}`);
}

async function inspectPreview(page) {
  const canvas = page.locator('.delivery-workspace__canvas[data-preview-mode="fit"]');
  await canvas.waitFor();
  const bounds = await canvas.evaluate((element) => {
    const svg = element.querySelector("svg.poster");
    const box = svg.getBoundingClientRect();
    const container = element.getBoundingClientRect();
    return {
      width: box.width, height: box.height,
      containerWidth: container.width,
      inside: box.left >= container.left - 1 && box.right <= container.right + 1,
      viewBoxRatio: svg.viewBox.baseVal.width / svg.viewBox.baseVal.height,
    };
  });
  assert.ok(bounds.width > 0 && bounds.height > 0);
  assert.ok(bounds.width <= bounds.containerWidth + 1 && bounds.inside, `Fit preview is clipped: ${JSON.stringify(bounds)}`);
  assert.ok(Math.abs(bounds.width / bounds.height - bounds.viewBoxRatio) < 0.01, "Fit preview must preserve the SVG aspect ratio");
  return bounds;
}

async function checkRoster(page, rail) {
  assert.equal(await page.locator(".data-upload-workspace__status").count(), 1);
  assert.equal(await page.locator(".data-workspace .data-summary").count(), 0, "Embedded roster must not duplicate its overview");
  assert.equal(await rail.locator(".data-upload-workspace__quality").getByText("数据质量", { exact: true }).count(), 1, "Quality content must have one title, excluding drawer chrome");
  const filter = page.getByRole("textbox", { name: "筛选学生", exact: true });
  await filter.fill("林舟");
  const row = page.locator(".student-table tbody tr");
  assert.equal(await row.count(), 1);
  const geometry = await row.evaluate((element) => ({
    rowTop: element.getBoundingClientRect().top,
    tableTop: element.closest("table").getBoundingClientRect().top,
    headerHeight: element.closest("table").querySelector("thead").getBoundingClientRect().height,
  }));
  assert.ok(geometry.rowTop <= geometry.tableTop + geometry.headerHeight + 1, "A filtered row must stay next to the table header");
  await filter.fill("");
}

async function checkExportControls(page, rail, options) {
  const actions = rail.getByRole("group", { name: "导出操作", exact: true });
  const buttons = actions.getByRole("button");
  assert.equal(await buttons.count(), 3);
  for (const button of await buttons.all()) assert.equal(await button.isVisible(), true, "All three export formats must remain visible");
  const minimum = options.width <= 760 ? 44 : 32;
  await minimumTarget(rail.getByRole("combobox", { name: "PNG 导出倍率", exact: true }), minimum, "PNG scale");
  for (const name of ["透明背景", "工程包包含资源"]) {
    const checkbox = rail.getByRole("checkbox", { name, exact: true });
    const initiallyChecked = await checkbox.isChecked();
    const label = checkbox.locator("..");
    const box = await label.boundingBox();
    assert.ok(box && box.height >= 44, `${name}: checkbox row must provide a 44 px click area`);
    await checkbox.uncheck();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const unchecked = await label.evaluate((element) => {
      const style = getComputedStyle(element);
      const resolveColor = (variable) => {
        const probe = document.createElement("span");
        probe.style.setProperty("color", style.getPropertyValue(variable).trim(), "important");
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      return { color: style.color, ink: resolveColor("--editor-ink"), accent: resolveColor("--editor-accent") };
    });
    assert.equal(unchecked.color, unchecked.ink, `${name}: unchecked state must be neutral`);
    await checkbox.check();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const checked = await label.evaluate((element) => getComputedStyle(element).color);
    assert.equal(checked, unchecked.accent, `${name}: checked state needs the accent style`);
    await checkbox.uncheck();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(await label.evaluate((element) => getComputedStyle(element).color), unchecked.color, "Unchecked state must restore its neutral style");
    if (initiallyChecked) await checkbox.check();
  }
  const pngColor = await actions.getByRole("button", { name: "PNG", exact: true }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  const brandColor = await page.locator(".studio-topbar .brand > svg").evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  assert.deepEqual(pngColor, brandColor, "PNG primary colors must match the themed brand");
  return { formatsVisible: 3, minimumSelectTarget: minimum, primaryColorsMatch: true };
}

/** Five real stages at each theme and responsive breakpoint, with themed rails. */
export async function checkResponsiveStages(page, helpers, options) {
  await page.locator(".workbench-card-main").first().click();
  const stageViews = [];
  for (const [label, id] of stages) {
    try {
      await selectStage(page, label, id);
      const shell = page.locator(".studio-editor-shell");
      const right = shell.locator(":scope > .studio-editor-shell__right");
      const toggle = shell.locator(".studio-editor-shell__rail-toggle");
      const geometry = await shell.evaluate((element) => {
        const width = (selector) => element.querySelector(selector)?.getBoundingClientRect().width ?? 0;
        const header = document.querySelector(".studio-topbar");
        const viewport = header.querySelector(".topbar-workflow").getBoundingClientRect();
        const active = header.querySelector('[aria-current="step"]').getBoundingClientRect();
        return {
          shellWidth: element.getBoundingClientRect().width,
          mainWidth: width(".studio-editor-shell__main"),
          leftWidth: width(".studio-editor-shell__left"),
          rightWidth: width(".studio-editor-shell__right"),
          headerHeight: header.getBoundingClientRect().height,
          activeStepVisible: active.left >= viewport.left - 1 && active.right <= viewport.right + 1,
        };
      });
      assert.equal(geometry.headerHeight, options.width <= 1120 ? 104 : 56);
      assert.equal(geometry.activeStepVisible, true, `${id}: active workflow step must remain visible`);
      const narrow = options.width <= 1120;
      assert.equal(await right.isVisible(), !narrow);
      assert.equal(await toggle.isVisible(), narrow);
      if (narrow) {
        assert.equal(geometry.rightWidth, 0);
        assert.ok(geometry.mainWidth + geometry.leftWidth >= geometry.shellWidth - 10, "Collapsed right rail must release its width to the workspace");
        await minimumTarget(toggle, 44, "Drawer entry");
      } else assert.ok(geometry.rightWidth > 0, "Desktop keeps an inline rail");
      let rail = right;
      if (narrow && ["data", "export"].includes(id)) {
        await toggle.click();
        rail = page.locator(".studio-editor-shell__drawer-paper");
        await rail.waitFor();
        assert.equal(await rail.getAttribute("data-editor-theme"), options.theme);
        assert.equal(await rail.getAttribute("data-editor-skin"), options.skin);
        assert.equal(await rail.evaluate((element) => element.classList.contains("app-shell")), true);
        await minimumTarget(rail.locator(".studio-editor-shell__drawer-close"), 44, "Drawer close");
      }
      if (id === "data") {
        // Close the modal before interacting with the underlying roster filter.
        assert.equal(await rail.locator(".data-upload-workspace__quality").getByText("数据质量", { exact: true }).count(), 1);
        if (narrow) {
          await page.keyboard.press("Escape");
          await rail.waitFor({ state: "hidden" });
          await helpers.focused(toggle);
        }
        await checkRoster(page, right);
      }
      let exportControls;
      if (id === "export") exportControls = await checkExportControls(page, rail, options);
      if (narrow && id === "export") {
        await page.keyboard.press("Escape");
        await rail.waitFor({ state: "hidden" });
        await helpers.focused(toggle);
      }
      const fit = id === "export" ? await inspectPreview(page) : undefined;
      const overflow = await helpers.noOverflow(page, `${options.skin}/${options.theme}/${options.width}/${id}`);
      const screenshot = await helpers.capture(page, `stages-${options.skin}-${options.theme}-${options.width}-${id}`);
      stageViews.push({ stage: id, ...geometry, ...overflow, exportControls, fit, screenshot });
    } catch (error) {
      const failure = new Error(`${options.skin}/${options.theme}/${options.width}/${id}: ${error.message}`, { cause: error });
      failure.stage = id;
      failure.stageViews = stageViews;
      throw failure;
    }
  }
  return { stageViews };
}

/** Modify only the newly seeded fictional sample, including its metadata sidecar. */
async function sampleFixture(page, fixture) {
  await page.evaluate((changes) => new Promise((resolve, reject) => {
    const request = indexedDB.open("cengfan-map-studio");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["projects", "project-metadata"], "readwrite");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      const projects = tx.objectStore("projects");
      const metadataStore = tx.objectStore("project-metadata");
      const all = projects.getAll();
      all.onsuccess = () => {
        const record = all.result[0];
        const project = record.pack.project;
        if (changes.width) project.canvas.width = changes.width;
        if (changes.height) project.canvas.height = changes.height;
        if (changes.dataView) project.dataView = changes.dataView;
        if (changes.warning) { project.students[0].city = "未定位星球"; delete project.students[0].province; }
        projects.put(record, record.id);
        const metadata = metadataStore.get(record.id);
        metadata.onsuccess = () => {
          const facts = metadata.result;
          if (changes.legacyMetadata) delete facts.preview;
          else facts.preview = { canvasWidth: project.canvas.width, canvasHeight: project.canvas.height, dataView: project.dataView };
          metadataStore.put(facts, record.id);
        };
      };
    };
  }), fixture);
  await page.reload();
  await page.locator(".workbench-card-main").first().waitFor();
}

/** Portrait and landscape documents retain their proportions and local zoom. */
export async function checkPreviewModes(page, helpers) {
  const previews = [];
  const viewport = page.viewportSize();
  for (const [orientation, width, height] of [["landscape", 1600, 900], ["portrait", 900, 1600]]) {
    await sampleFixture(page, { width, height });
    await page.locator(".workbench-card-main").first().click();
    await page.locator(".studio-editor-shell").waitFor();
    await selectStage(page, "交付", "export");
    const fit = await inspectPreview(page);
    assert.ok(Math.abs(fit.viewBoxRatio - width / height) < 0.001);
    await page.getByRole("button", { name: "原始尺寸", exact: true }).click();
    const actual = page.getByRole("region", { name: "原始尺寸海报", exact: true });
    assert.equal(await actual.getAttribute("tabindex"), "0");
    const scroll = await actual.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, overflow: getComputedStyle(element).overflowX }));
    assert.ok(scroll.scrollWidth > scroll.width && ["auto", "scroll"].includes(scroll.overflow), "Actual-size preview needs its own scroll area");
    await actual.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector('[data-preview-mode="actual"]').scrollLeft > 0);
    await helpers.noOverflow(page, `${orientation} actual-size preview`);
    await page.getByRole("button", { name: "完整预览", exact: true }).click();
    await inspectPreview(page);
    const screenshot = await helpers.capture(page, `preview-${orientation}-${viewport.width}x${viewport.height}`);
    previews.push({ orientation, width, height, fit, localScroll: true, screenshot });
    await helpers.openTools(page);
    await page.getByRole("button", { name: "返回项目列表", exact: true }).click();
    await page.locator(".workbench-shell").waitFor();
  }
  return { previews };
}

/** Lightweight cards show real facts, old metadata stays honest, warnings locate. */
export async function checkMetadataAndChecks(page, helpers) {
  await page.locator(".workbench-card-main").first().click();
  await selectStage(page, "交付", "export");
  const passed = page.locator('.delivery-workspace__check[data-check-state="passed"]');
  assert.ok(await passed.count() >= 2);
  for (const section of await passed.all()) {
    assert.equal(await section.getByRole("button").count(), 0, "Passed checks must not contain issue actions");
    const compact = await section.evaluate((element) => {
      const style = getComputedStyle(element);
      const extra = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
      return element.getBoundingClientRect().height <= element.querySelector("header").getBoundingClientRect().height + extra + 1;
    });
    assert.equal(compact, true, "Passed checks should use only their header row");
  }
  await helpers.openTools(page);
  await page.getByRole("button", { name: "返回项目列表", exact: true }).click();
  await page.locator(".workbench-shell").waitFor();
  await sampleFixture(page, { width: 1600, height: 900, dataView: "heat", warning: true });
  const card = page.locator(".workbench-card-main").first();
  assert.equal(await card.getByText("1600 × 900 px", { exact: true }).isVisible(), true);
  assert.equal(await card.getByText("热力地图", { exact: true }).isVisible(), true);
  assert.equal(await card.getByText("横向画布", { exact: true }).isVisible(), true);
  const ratio = await card.locator(".project-preview__paper").evaluate((element) => {
    const box = element.getBoundingClientRect(); return box.width / box.height;
  });
  assert.ok(Math.abs(ratio - 1600 / 900) < 0.01);
  assert.equal(await card.locator("canvas, svg.poster").count(), 0, "Overview cards must not render the heavy poster");
  await sampleFixture(page, { legacyMetadata: true });
  await page.locator(".project-preview--unavailable").waitFor();
  assert.equal(await page.getByText("打开查看画布", { exact: true }).isVisible(), true);
  assert.equal(await page.locator(".project-preview__size, .project-preview__paper").count(), 0);
  await page.locator(".workbench-card-main").first().click();
  await selectStage(page, "交付", "export");
  const warning = page.locator('.delivery-workspace__check[aria-label="数据完整性"][data-check-state="warning"]');
  await warning.waitFor();
  assert.equal(await warning.locator("details").getAttribute("open"), "");
  await warning.getByRole("button", { name: /^定位林舟/ }).first().click();
  await page.locator('.studio-editor-shell[data-stage="data"]').waitFor();
  assert.match(await page.locator(".student-table tr.is-selected").innerText(), /林舟/);
  return { compactPassedChecks: true, actualMetadata: true, legacyFallback: true, warningLocated: true };
}

/** The mobile rail delivers a genuine editable package, without a hidden modal. */
export async function checkMobileProjectPackage(page, helpers) {
  await page.locator(".workbench-card-main").first().click();
  await selectStage(page, "交付", "export");
  await page.locator(".studio-editor-shell__rail-toggle").click();
  const rail = page.locator(".studio-editor-shell__drawer-paper");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    rail.getByRole("button", { name: "导出工程包", exact: true }).click(),
  ]);
  assert.equal(await download.failure(), null);
  const filename = "mobile-fictional-project.json";
  await download.saveAs(resolve(helpers.output, filename));
  const pack = JSON.parse(await readFile(resolve(helpers.output, filename), "utf8"));
  assert.equal(pack.kind, "cengfan-project-package");
  assert.equal(pack.project.students.length, 12);
  assert.ok(pack.project.students.some((student) => student.name === "林舟"));
  assert.equal(await page.getByRole("dialog", { name: "确认导出工程", exact: true }).count(), 0);
  await rail.locator(".studio-editor-shell__drawer-close").click();
  const more = await helpers.openTools(page);
  await page.getByLabel("打开项目与协作菜单", { exact: true }).click();
  await page.getByRole("button", { name: "导出工程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认导出工程", exact: true });
  await dialog.waitFor();
  await minimumTarget(dialog.getByRole("button", { name: "关闭导出工程确认", exact: true }), 44, "Mobile package dialog close");
  await minimumTarget(dialog.getByRole("button", { name: "确认导出工程", exact: true }), 44, "Mobile package dialog confirm");
  await dialog.getByRole("button", { name: "关闭导出工程确认", exact: true }).click();
  await helpers.focused(more, "Mobile modal close must restore its visible tools entry");
  return { download: filename, kind: pack.kind, fictionalStudents: 12, directRailDownload: true, mobileModalTargets: true };
}
