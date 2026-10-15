import { useEffect, useRef } from "react";

/** Native details retains its semantics; only dismissal and return focus are shared. */
export function useDisclosureDismissal() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const outside = (event: PointerEvent) => {
      if (node.open && event.target instanceof Node && !node.contains(event.target)) node.open = false;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !node.open || !(event.target instanceof Node) || !node.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      node.open = false;
      node.querySelector("summary")?.focus();
    };
    const blur = (event: FocusEvent) => {
      if (node.open && event.relatedTarget instanceof Node && !node.contains(event.relatedTarget)) node.open = false;
    };
    document.addEventListener("pointerdown", outside);
    node.addEventListener("keydown", key);
    node.addEventListener("focusout", blur);
    return () => {
      document.removeEventListener("pointerdown", outside);
      node.removeEventListener("keydown", key);
      node.removeEventListener("focusout", blur);
    };
  }, []);
  return ref;
}
