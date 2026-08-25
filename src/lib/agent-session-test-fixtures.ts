import type { vi } from "vitest";
import { applyTransaction, type ProjectDocument, type ProjectHistory } from "./project-document";

export function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

export function userContents(fetchMock: ReturnType<typeof vi.fn>, index: number): string[] {
  const init = (fetchMock.mock.calls[index] as unknown[] | undefined)?.[1] as RequestInit | undefined;
  const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content?: string }> };
  return body.messages.filter((message) => message.role === "user").map((message) => String(message.content));
}

/** Mirrors the readonly history proxy `applyTransaction` hands to `transaction.apply`. */
export function readonlyHistoryView(history: ProjectHistory): ProjectHistory {
  const wrap = <V>(candidate: V): V => {
    if (!candidate || typeof candidate !== "object") return candidate;
    return new Proxy(candidate, {
      get: (target, property, receiver) => wrap(Reflect.get(target, property, receiver)),
      set: () => true,
      deleteProperty: () => true,
    }) as V;
  };
  return wrap(history);
}

export function documentWithHistory(project: ProjectDocument): ProjectDocument {
  return applyTransaction(project, {
    id: "tx-manual-seed",
    label: "手动调整",
    source: "manual",
    apply: (doc) => ({ ...doc, cards: { ...doc.cards, fontSize: doc.cards.fontSize + 2 } }),
  });
}
