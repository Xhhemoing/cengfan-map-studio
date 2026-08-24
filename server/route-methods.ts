import type http from "node:http";

const GET = ["GET"] as const;
const POST = ["POST"] as const;
const GET_PUT = ["GET", "PUT"] as const;

const exactApiRoutes = new Map<string, readonly string[]>([
  ["/api/live", GET],
  ["/api/ready", GET],
  ["/api/health", GET],
  ["/api/workspace", GET_PUT],
  ["/api/ai/agent", POST],
  ["/api/ai/parse-data", POST],
  ["/api/ai/propose-edits", POST],
  ["/api/ai/explain", POST],
  ["/api/rooms", POST],
]);

const roomApiRoutes: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/^\/api\/rooms\/[A-Za-z0-9]+$/, GET],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/invitations$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/join$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/transactions$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/members$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/leave$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/access$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/operations$/, GET],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/events-ticket$/, POST],
  [/^\/api\/rooms\/[A-Za-z0-9]+\/events$/, GET],
];

export function allowedMethodsForPath(
  pathname: string,
  servesStaticFiles: boolean,
): readonly string[] | undefined {
  const exact = exactApiRoutes.get(pathname);
  if (exact) return exact;
  for (const [pattern, methods] of roomApiRoutes) {
    if (pattern.test(pathname)) return methods;
  }
  return servesStaticFiles && !pathname.startsWith("/api/") ? GET : undefined;
}

export function handleRequestMethod(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  pathname: string,
  servesStaticFiles: boolean,
  send: (status: number, body: unknown) => void,
): boolean {
  if (request.method === "OPTIONS") {
    send(204, {});
    return true;
  }
  const allowedMethods = allowedMethodsForPath(pathname, servesStaticFiles);
  if (!allowedMethods || allowedMethods.includes(request.method ?? "")) return false;
  response.setHeader("Allow", `${allowedMethods.join(", ")}, OPTIONS`);
  send(405, { error: { code: "METHOD_NOT_ALLOWED", message: "请求方法不受支持" } });
  return true;
}
