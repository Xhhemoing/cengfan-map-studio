/**
 * Run against an existing development server using fresh browser contexts and
 * the bundled fictional sample only. Playwright is supplied by the caller:
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium
 * node scripts/check-uiux-browser.mjs
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkProjectSessions, checkSavedExport, checkSaveFailureRecovery } from "./uiux-browser/round-two.mjs";
import { checkResponsiveStages, checkPreviewModes, checkMetadataAndChecks, checkMobileProjectPackage } from "./uiux-browser/round-three.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const output = resolve(".agent_workspace/uiux");
const results = [];
let stopRequested = false;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox"],
});

async function focused(locator, message = "Expected control to retain focus") {
  assert.equal(await locator.evaluate((element) => element === document.activeElement), true, message);
}

async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.ok(size.document <= size.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(size)}`);
  return size;
}

async function chooseOnce(page, activate) {
  let events = 0;
  const count = () => { events += 1; };
  page.on("filechooser", count);
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }),
      activate(),
    ]);
    await chooser.setFiles([]);
    assert.equal(events, 1, "One activation must open exactly one file chooser");
  } finally {
    page.off("filechooser", count);
  }
}

async function openTools(page) {
  const more = page.getByRole("button", { name: "更多操作", exact: true });
  if (await more.getAttribute("aria-expanded") !== "true") await more.click();
  await page.getByRole("group", { name: "页面与项目操作", exact: true }).waitFor();
  return more;
}

async function runCase(id, options, check) {
  if (stopRequested) return;
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: options.height ?? 1000 },
    hasTouch: (options.width ?? 1440) < 760,
    colorScheme: options.theme ?? "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ skin, theme }) => {
    if (!localStorage.getItem("uiux-check-initialized")) {
      localStorage.setItem("cengfan-map-studio:ui-skin", skin);
      localStorage.setItem("cengfan-map-studio:theme-mode", theme);
      localStorage.setItem("uiux-check-initialized", "1");
    }
    // Exercise actual feedback UI with deterministic clipboard outcomes,
    // without writing to the host clipboard or collecting any real roster.
    window.__uiuxClipboardMode = "success";
    window.__uiuxClipboardWrites = 0;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {
        window.__uiuxClipboardWrites += 1;
        if (window.__uiuxClipboardMode === "reject") throw new DOMException("Denied", "NotAllowedError");
      } },
    });
  }, { skin: options.skin ?? "atelier", theme: options.theme ?? "light" });
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  const result = { id, ...options, passed: false };
  try {
    await page.goto(baseUrl);
    await page.locator(".workbench-card-main").first().waitFor();
    const measurements = await check(page);
    assert.deepEqual(errors, [], `${id}: browser runtime errors`);
    Object.assign(result, { passed: true, measurements });
    const screenshot = `${id}.png`;
    await page.screenshot({ path: resolve(output, screenshot), fullPage: true });
    result.screenshot = screenshot;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    if (error.stage) result.failureStage = error.stage;
    if (error.stageViews) result.measurements = { stageViews: error.stageViews };
    result.runtimeErrors = errors;
    const screenshot = `${id}-failed.png`;
    await page.screenshot({ path: resolve(output, screenshot), fullPage: true }).catch(() => undefined);
    result.screenshot = screenshot;
  } finally {
    results.push(result);
    await context.close();
    if (!result.passed && process.env.UIUX_FAIL_FAST === "1") stopRequested = true;
  }
}

async function checkWorkbench(page, { skin, theme, width }) {
  const shell = page.locator(".workbench-shell");
  assert.equal(await shell.getAttribute("data-editor-skin"), skin);
  assert.equal(await shell.getAttribute("data-editor-theme"), theme);
  const help = page.getByLabel("帮助与反馈", { exact: true });
  const importButton = page.getByRole("button", { name: "导入工程包", exact: true });
  assert.equal(await importButton.isVisible(), true);
  await chooseOnce(page, () => importButton.click());
  await focused(importButton);
  await help.click();
  await page.getByRole("link", { name: /^用户指南/ }).waitFor();
  await noOverflow(page, "Open help");
  await help.press("Escape");
  assert.equal(await page.locator(".help-menu").getAttribute("open"), null);
  await focused(help);
  await page.locator(".workbench-guide > summary").click();
  await page.locator(".workbench-guide ol").waitFor();
  const search = page.getByRole("searchbox", { name: "搜索项目", exact: true });
  await search.fill("2026届");
  assert.equal(await page.locator(".workbench-card-main").count(), 1);
  await search.fill("uiux-no-match");
  await page.getByText("没有匹配的项目", { exact: true }).waitFor();
  assert.equal(await page.locator(".workbench-card-main").count(), 0);
  await page.getByRole("button", { name: "查看全部项目", exact: true }).click();
  assert.equal(await search.inputValue(), "");
  await focused(search);
  const menu = page.getByRole("button", { name: "项目菜单", exact: true }).first();
  await menu.press("ArrowDown");
  await focused(page.getByRole("menuitem", { name: "重命名", exact: true }));
  await page.keyboard.press("ArrowUp");
  await focused(page.getByRole("menuitem", { name: "删除", exact: true }));
  await page.keyboard.press("Home");
  await focused(page.getByRole("menuitem", { name: "重命名", exact: true }));
  await noOverflow(page, "Open project menu");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("menu").count(), 0);
  await focused(menu);
  if (width < 760) {
    const bounds = await menu.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, "Mobile project menu needs a 44 px target");
  }
  return noOverflow(page, "Workbench");
}

async function checkRoundOne(page) {
  await page.locator(".workbench-card-main").first().click();
  await page.locator('.studio-editor-shell[data-stage="data"]').waitFor();
  await page.getByRole("button", { name: "展开导入名单", exact: true }).click();
  await page.getByRole("textbox", { name: "导入文本", exact: true }).waitFor();
  const upload = page.locator('[data-file-dropzone]:has(#data-excel-upload)');
  assert.equal(await upload.getAttribute("role"), "button");
  assert.ok(await upload.getAttribute("aria-label"), "Keyboard upload needs an accessible name");
  for (const key of ["Enter", "Space"]) {
    await chooseOnce(page, () => upload.press(key));
    await focused(upload, `${key}: upload focus lost after cancelling chooser`);
  }
  const edit = page.getByRole("button", { name: "编辑 林舟", exact: true });
  await edit.click();
  await focused(page.getByRole("textbox", { name: "编辑学生名称", exact: true }));
  const city = page.getByRole("combobox", { name: "编辑城市", exact: true });
  await city.fill("杭州");
  await city.press("ArrowDown");
  await city.press("ArrowDown");
  await city.press("Enter");
  assert.equal(await city.getAttribute("aria-expanded"), "false");
  await focused(city);
  await city.press("Tab");
  await focused(page.getByRole("combobox", { name: "编辑学生去向类型", exact: true }));
  await page.keyboard.press("Tab");
  await focused(page.getByRole("combobox", { name: "编辑省份", exact: true }));
  await city.fill("月球基地");
  assert.equal(await city.getAttribute("aria-expanded"), "true");
  await city.press("ArrowDown");
  assert.ok(await city.getAttribute("aria-activedescendant"));
  await city.press("Escape");
  assert.equal(await city.getAttribute("aria-expanded"), "false");
  assert.equal(await city.getAttribute("aria-activedescendant"), null);
  assert.equal(await page.getByRole("textbox", { name: "编辑学生名称", exact: true }).isVisible(), true);
  await city.press("Escape");
  await focused(edit);

  const more = await openTools(page);
  const theme = page.getByRole("button", { name: "切换到暗色模式", exact: true });
  await theme.click();
  assert.equal(await page.locator(".app-shell").getAttribute("data-editor-theme"), "dark");
  await page.getByRole("button", { name: "切换到亮色模式", exact: true }).click();
  await page.getByRole("button", { name: "切换到经典界面", exact: true }).click();
  assert.equal(await page.locator(".app-shell").getAttribute("data-editor-skin"), "classic");
  await page.getByRole("button", { name: "切换到 Atelier 界面", exact: true }).click();
  const projectMenu = page.getByLabel("打开项目与协作菜单", { exact: true });
  await projectMenu.click();
  await page.getByRole("button", { name: "导出工程", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "确认导出工程", exact: true });
  await dialog.waitFor();
  await focused(dialog.getByRole("heading", { name: "确认导出工程", exact: true }));
  await page.keyboard.press("Shift+Tab");
  await focused(dialog.getByRole("button", { name: "确认导出工程", exact: true }));
  await page.keyboard.press("Tab");
  await focused(dialog.getByRole("button", { name: "关闭导出工程确认", exact: true }));
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  await focused(more, "Modal close must restore a visible tools entry");
  assert.equal(await more.isVisible(), true);
  return { ...(await noOverflow(page, "Round one editor")), keyboardChoosers: 2, modalTabCycle: true };
}

async function checkClipboard(page) {
  await page.getByLabel("帮助与反馈", { exact: true }).click();
  const help = page.locator(".help-menu");
  const copy = help.getByRole("button", { name: "复制环境信息", exact: true });
  await copy.click();
  await help.getByRole("status").filter({ hasText: "已复制环境信息" }).waitFor();
  assert.equal(await page.evaluate(() => window.__uiuxClipboardWrites), 1);
  await page.evaluate(() => { window.__uiuxClipboardMode = "reject"; });
  await copy.click();
  await help.getByRole("alert").filter({ hasText: "无法复制" }).waitFor();
  assert.equal(await help.getByRole("status").count(), 0, "Failed copying must not retain a success receipt");
  assert.equal(await page.evaluate(() => window.__uiuxClipboardWrites), 2);
  return { successFeedback: true, refusalFeedback: true, clipboard: "browser stub" };
}

try {
  for (const skin of ["atelier", "classic"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 390, 768, 1440]) {
        const options = { skin, theme, width, kind: "screenshot-matrix" };
        await runCase(`workbench-${skin}-${theme}-${width}`, options, (page) => checkWorkbench(page, options));
      }
    }
  }
  await runCase("round-one-desktop", { width: 1440, kind: "behavior" }, checkRoundOne);
  await runCase("clipboard-feedback", { width: 1440, kind: "behavior" }, checkClipboard);
  const roundTwoHelpers = {
    focused, noOverflow, openTools, output,
    capture: async (page, name) => {
      const filename = `${name}.png`;
      await page.screenshot({ path: resolve(output, filename), fullPage: true });
      return filename;
    },
  };
  await runCase("round-two-project-sessions", { width: 1440, kind: "behavior" }, (page) => checkProjectSessions(page, roundTwoHelpers));
  await runCase("round-two-saved-export", { width: 1440, kind: "behavior" }, (page) => checkSavedExport(page, roundTwoHelpers));
  await runCase("round-two-save-recovery", { width: 1440, kind: "behavior" }, (page) => checkSaveFailureRecovery(page, roundTwoHelpers));
  for (const skin of ["atelier", "classic"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [390, 768, 900, 1120, 1121, 1440]) {
        const options = { skin, theme, width, kind: "stage-matrix" };
        await runCase(`stages-${skin}-${theme}-${width}`, options, (page) => checkResponsiveStages(page, roundTwoHelpers, options));
      }
    }
  }
  await runCase("round-three-preview-modes", { width: 390, kind: "behavior" }, (page) => checkPreviewModes(page, roundTwoHelpers));
  await runCase("round-three-preview-landscape-viewport", { width: 844, height: 390, kind: "behavior" }, (page) => checkPreviewModes(page, roundTwoHelpers));
  await runCase("round-three-metadata-checks", { width: 1440, kind: "behavior" }, (page) => checkMetadataAndChecks(page, roundTwoHelpers));
  await runCase("round-three-mobile-package", { width: 390, height: 844, kind: "behavior" }, (page) => checkMobileProjectPackage(page, roundTwoHelpers));
} finally {
  await browser.close();
  const summary = {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    total: results.length,
    contexts: results.length,
    stoppedEarly: stopRequested,
    stageViews: results.reduce((sum, result) => sum + (result.measurements?.stageViews?.length ?? 0), 0),
    groups: Object.fromEntries(["screenshot-matrix", "stage-matrix", "behavior"].map((kind) => {
      const group = results.filter((result) => result.kind === kind);
      return [kind, { passed: group.filter((result) => result.passed).length, total: group.length }];
    })),
    artifacts: output,
  };
  await writeFile(resolve(output, "report.json"), `${JSON.stringify({ summary, results }, null, 2)}\n`);
  console.log(JSON.stringify(summary));
  for (const failure of results.filter((result) => !result.passed)) {
    console.error(`${failure.id}: ${failure.error}`);
  }
  if (summary.failed) process.exitCode = 1;
}
