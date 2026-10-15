import { useLayoutEffect, type RefObject } from "react";

const openDialogs: HTMLElement[] = [];
const focusableSelector = "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable='true']";

function isAvailableForFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.matches(":disabled, input[type='hidden']")) return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.matches("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      const summary = ancestor.querySelector(":scope > summary");
      if (!summary?.contains(element)) return false;
    }
  }
  return true;
}

function resolveReturnTarget(opener: HTMLElement): HTMLElement | null {
  // Opening a modal can dismiss its parent menu and the surrounding tool disclosure.
  const closedMenu = opener.closest("details:not([open])");
  const target = closedMenu?.querySelector<HTMLElement>(":scope > summary") ?? opener;
  if (isAvailableForFocus(target)) return target;

  for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      const summary = ancestor.querySelector<HTMLElement>(":scope > summary");
      if (summary && isAvailableForFocus(summary)) return summary;
    }
    if (!ancestor.id) continue;
    const controlledId = ancestor.id;
    // Resolve the local disclosure through aria-controls, without a global selector or skin class.
    const controls = ancestor.parentElement?.querySelectorAll<HTMLElement>("[aria-controls]") ?? [];
    const controller = Array.from(controls).find((control) => (
      control.getAttribute("aria-controls")?.split(/\s+/).includes(controlledId)
      && isAvailableForFocus(control)
    ));
    if (controller) return controller;
  }
  return null;
}

function getTabStops(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.tabIndex >= 0 && isAvailableForFocus(element));
}

/** Keep keyboard focus in an open custom dialog and return it to its opener. */
export function useModalFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const doc = dialog.ownerDocument;
    const opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    let lastFocused: HTMLElement = initialFocusRef?.current ?? dialog;
    const isTopDialog = () => openDialogs.at(-1) === dialog;
    const focusInside = () => {
      const target = dialog.contains(lastFocused) && !lastFocused.matches(":disabled")
        ? lastFocused
        : getTabStops(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
    };

    openDialogs.push(dialog);
    focusInside();

    const handleFocus = (event: FocusEvent) => {
      if (!isTopDialog()) return;
      const target = event.target;
      if (target instanceof HTMLElement && dialog.contains(target)) {
        lastFocused = target;
      } else {
        focusInside();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog() || event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const tabStops = getTabStops(dialog);
      const first = tabStops[0] ?? dialog;
      const last = tabStops.at(-1) ?? dialog;
      const active = doc.activeElement;
      if (!tabStops.length || !tabStops.some((element) => element === active)
        || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    };

    doc.addEventListener("focusin", handleFocus);
    doc.addEventListener("keydown", handleKeyDown, true);
    return () => {
      const wasTopDialog = isTopDialog();
      doc.removeEventListener("focusin", handleFocus);
      doc.removeEventListener("keydown", handleKeyDown, true);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      if (wasTopDialog && opener?.isConnected) {
        resolveReturnTarget(opener)?.focus({ preventScroll: true });
      }
    };
  }, [open, dialogRef, onClose, initialFocusRef]);
}
