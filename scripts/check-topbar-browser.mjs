import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = "artifacts/topbar";
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 4173, strictPort: true } });
await server.listen();
const browser = await chromium.launch();
const measurements = [];
const stages = ["data", "map", "frame", "content", "export"];
let activePage;

try {
  for (const skin of ["atelier", "classic"]) {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 390, 768, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 }, hasTouch: width <= 760,
          reducedMotion: "reduce", colorScheme: theme,
        });
        const page = await context.newPage();
        activePage = page;
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        // Tests use the repository's bundled sample only, never user data.
        await page.addInitScript(({ skin, theme }) => {
          if (localStorage.getItem("topbar-check-initialized")) return;
          localStorage.setItem("cengfan-map-studio:ui-skin", skin);
          localStorage.setItem("cengfan-map-studio:theme-mode", theme);
          localStorage.removeItem("cengfan-legacy-editor");
          localStorage.setItem("topbar-check-initialized", "1");
        }, { skin, theme });
        await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
        await page.goto("http://127.0.0.1:4173");
        await page.locator(".workbench-card-main").first().click();
        let baseline;

        async function inspect(view) {
          await page.locator(".studio-topbar").waitFor();
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const values = await page.evaluate(() => {
            const header = document.querySelector(".studio-topbar");
            const rectangle = (selector) => {
              const rect = header.querySelector(selector).getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            };
            const style = getComputedStyle(header);
            const body = document.querySelector(".studio-editor-shell, .workspace, .global-settings-screen");
            return {
              moreVisible: getComputedStyle(header.querySelector(".studio-topbar__more")).display !== "none",
              headerCount: document.querySelectorAll(".app-shell > header").length,
              height: header.getBoundingClientRect().height,
              color: style.color, background: style.backgroundColor,
              border: style.borderBottomColor, font: style.fontFamily,
              brand: rectangle(".brand"),
              workflow: rectangle(".topbar-workflow"),
              leading: rectangle(".studio-topbar__leading"),
              viewportWidth: innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              bodyTop: body.getBoundingClientRect().top,
              bodyBottom: body.getBoundingClientRect().bottom,
              redundantSettingsHeaders: document.querySelectorAll(".global-settings-screen > .global-settings-header").length,
            };
          });
          const { documentWidth, viewportWidth, bodyTop, bodyBottom, redundantSettingsHeaders, ...chrome } = values;
          measurements.push({ skin, theme, width, view, ...values });
          assert.equal(values.moreVisible, width <= 1120, `${view}: wrong tools breakpoint`);
          assert.equal(values.headerCount, 1, `${view}: duplicate topbars`);
          assert.equal(values.height, 104, `${view}: wrong header height`);
          assert.ok(documentWidth <= viewportWidth + 1, `${view}: document overflows horizontally`);
          assert.equal(bodyTop, 104, `${view}: workspace does not meet the header`);
          assert.ok(bodyBottom <= 901, `${view}: workspace extends beyond the viewport`);
          assert.equal(redundantSettingsHeaders, 0, `${view}: stacked settings toolbar`);
          if (baseline) assert.deepEqual(chrome, baseline, `${skin}/${theme}/${width}/${view}: header moved or changed style`);
          else baseline = chrome;
          assert.deepEqual(errors, [], `${view}: browser runtime errors`);
          const name = `${skin}-${theme}-${width}-${view}`;
          await page.locator(".studio-topbar").screenshot({ path: `${output}/${name}-header.png` });
          if (skin === "atelier" && [390, 1440].includes(width)) {
            await page.screenshot({ path: `${output}/${name}.png` });
          }
        }

        for (const [index, stage] of stages.entries()) {
          await page.locator(".workflow-stage-stepper button").nth(index).click();
          await page.locator(`.studio-editor-shell[data-stage="${stage}"]`).waitFor();
          await inspect(stage);
        }
        if (width <= 1120) {
          const more = page.getByRole("button", { name: "更多操作", exact: true });
          await more.click();
          assert.equal(await more.getAttribute("aria-expanded"), "true");
          await page.locator(".studio-topbar .project-menu > summary").click();
          const menu = await page.locator(".studio-topbar__tools").boundingBox();
          assert.ok(menu.x >= 0 && menu.x + menu.width <= width, "mobile tools overflow");
          await page.keyboard.press("Escape");
          assert.equal(await more.getAttribute("aria-expanded"), "false");
          assert.equal(await more.evaluate((element) => element === document.activeElement), true);
        }

        await page.evaluate(() => localStorage.setItem("cengfan-legacy-editor", "1"));
        await page.reload();
        await page.locator(".workspace").waitFor();
        await inspect("legacy");
        // Open the actual advanced-settings entry, then inspect the same route
        // at each target size (the legacy rail itself is desktop-only).
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('[role="tab"][aria-controls="studio-advanced-panel"]').click();
        await page.getByRole("button", { name: "打开全局设置", exact: true }).click();
        await page.locator(".global-settings-screen").waitFor();
        await page.setViewportSize({ width, height: 900 });
        for (const section of ["canvas", "map", "cards", "guests", "typography", "advanced"]) {
          await page.locator(`#global-settings-tab-${section}`).click();
          await inspect(`settings-${section}`);
        }
        if (width <= 1120) await page.getByRole("button", { name: "更多操作", exact: true }).click();
        await page.locator(".studio-topbar .global-settings-done").click();
        await page.locator(".workspace").waitFor();
        await inspect("legacy-return");
        await context.close();
        activePage = undefined;
      }
    }
  }
  console.log(`PASS: ${measurements.length} real application header snapshots`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failure.png`, fullPage: true });
  }
  throw error;
} finally {
  await writeFile(`${output}/measurements.json`, JSON.stringify(measurements, null, 2));
  await browser.close();
  await server.close();
}
