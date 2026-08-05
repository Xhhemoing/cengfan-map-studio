export type DeliveryIssueLocation =
  | { stage: "map"; selectionKind: "map" | "province"; province?: string }
  | { stage: "content"; selectionKind: "guests" | "cards" | "text" | "asset"; id?: string }
  | { stage: "frame"; selectionKind: "cards" };

export function resolveDeliveryIssueLocation(target: string): DeliveryIssueLocation | undefined {
  if (target === "map" || target === "background" || target === "map-labels") {
    return { stage: "map", selectionKind: "map" };
  }
  if (target.startsWith("province:")) {
    return { stage: "map", selectionKind: "province", province: target.slice("province:".length) };
  }
  if (target.startsWith("map-label:")) {
    return { stage: "map", selectionKind: "province", province: target.slice("map-label:".length) };
  }
  if (target === "guests:title" || target === "guests:people" || target.startsWith("guest:")) {
    return { stage: "content", selectionKind: "guests" };
  }
  if (target.startsWith("display-frame:")) return { stage: "frame", selectionKind: "cards" };
  if (target.startsWith("text:")) return { stage: "content", selectionKind: "text", id: target.slice("text:".length) };
  if (target.startsWith("asset:")) return { stage: "content", selectionKind: "asset", id: target.slice("asset:".length) };
  if (target.startsWith("cards:")) return { stage: "content", selectionKind: "cards" };
  return undefined;
}
