import { afterEach, vi } from "vitest";

/**
 * Global net for React roots that outlive the test that mounted them.
 *
 * Two sweeps (R7-7, R8-5, R8-6, R8-3) converted 38 suites from an inline
 * `root.unmount()` at the end of the `it` body to a tracked `afterEach` drain,
 * because an inline unmount is skipped whenever an assertion above it throws:
 * the root stays mounted with its listeners and timers armed and races React's
 * scheduler against jsdom teardown for the rest of the run. Nothing stopped a
 * new file from reintroducing the pattern, so this guard runs for every jsdom
 * test and names the case that left a root behind.
 *
 * `createRoot`/`hydrateRoot` are wrapped to record every container, and React
 * marks a container with a `__reactContainer$<key>` property that it nulls out
 * on unmount, so a container whose key is still non-null at the end of a test
 * is a live root. Registering the check from a setup file is what makes it
 * reliable: setup-file hooks are the outermost ones, so this `afterEach` runs
 * after the test file's own `afterEach` drain has had its chance.
 */

const CONTAINER_KEY_PREFIX = "__reactContainer$";

type ReactRootContainer = Element | DocumentFragment | Document;

type GuardHolder = typeof globalThis & { __leakedRootGuardContainers__?: Set<ReactRootContainer> };

/**
 * The registry lives on `globalThis` rather than in module scope so that the
 * `vi.mock` factory and the hook agree on one set even when a suite calls
 * `vi.resetModules()` and gets a second react-dom instance.
 */
function containerRegistry(): Set<ReactRootContainer> {
  const holder = globalThis as GuardHolder;
  holder.__leakedRootGuardContainers__ ??= new Set<ReactRootContainer>();
  return holder.__leakedRootGuardContainers__;
}

vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  // Server suites declare `@vitest-environment node`; there is no DOM to leak
  // into there, so hand back the untouched module and stay out of the way.
  if (typeof document === "undefined") return actual;
  return {
    ...actual,
    createRoot(container: Element | DocumentFragment, options?: Parameters<typeof actual.createRoot>[1]) {
      containerRegistry().add(container);
      return actual.createRoot(container, options);
    },
    hydrateRoot(
      container: Element | Document,
      initialChildren: Parameters<typeof actual.hydrateRoot>[1],
      options?: Parameters<typeof actual.hydrateRoot>[2],
    ) {
      containerRegistry().add(container);
      return actual.hydrateRoot(container, initialChildren, options);
    },
  };
});

function isStillMounted(container: ReactRootContainer): boolean {
  const record = container as unknown as Record<string, unknown>;
  return Object.keys(record).some((key) => key.startsWith(CONTAINER_KEY_PREFIX) && record[key] != null);
}

function describeContainer(container: ReactRootContainer): string {
  if (!(container instanceof Element)) return `<#${container.nodeName.toLowerCase()}>`;
  const id = container.id ? `#${container.id}` : "";
  const classes = container.classList.length > 0 ? `.${Array.from(container.classList).join(".")}` : "";
  const where = container.isConnected ? "attached to the document" : "detached";
  const child = container.firstElementChild;
  const rendered = child ? `renders <${child.tagName.toLowerCase()}>` : "renders nothing";
  return `<${container.tagName.toLowerCase()}${id}${classes}> (${where}, ${rendered})`;
}

afterEach((context) => {
  if (typeof document === "undefined") return;

  const registry = containerRegistry();
  if (registry.size === 0) return;

  const leaked = Array.from(registry).filter(isStillMounted).map(describeContainer);
  // Drop every container the test mounted, leaked or not, so the next test is
  // only ever blamed for its own roots. The leaked ones are deliberately left
  // mounted instead of being unmounted here: this guard reports the missing
  // net, it does not stand in for one.
  registry.clear();
  if (leaked.length === 0) return;

  // A test that already failed is the exact situation this leak comes from —
  // the assertion threw before the unmount ran — so throwing here would bury
  // the real assertion under a teardown error. Report only when the test
  // itself passed, which is the case that would otherwise go unnoticed.
  if (context.task.result?.state === "fail") return;

  const list = leaked.map((entry, index) => `  ${index + 1}. ${entry}`).join("\n");
  throw new Error(
    `Leaked React root(s) after "${context.task.name}": ${leaked.length} root(s) were still mounted when the test finished.\n` +
      `${list}\n` +
      `Track every root this file creates and unmount them from an afterEach hook, so an assertion that throws mid-test ` +
      `still tears the root down (see src/components/canvas/DecorationLayer.test.tsx).`,
  );
});
