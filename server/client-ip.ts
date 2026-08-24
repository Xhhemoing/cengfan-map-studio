import type http from "node:http";

type HeaderValue = string | string[] | undefined;

function rightmostHop(value: HeaderValue, arrayMode: "join" | "last"): string | undefined {
  const hops = Array.isArray(value)
    ? (arrayMode === "join" ? value.join(",") : value.at(-1))
    : value;
  return hops?.split(",").map((hop) => hop.trim()).filter(Boolean).at(-1);
}

export function clientIp(
  request: Pick<http.IncomingMessage, "headers" | "socket">,
  trustProxy: boolean,
): string {
  const forwardedIp = trustProxy
    ? rightmostHop(request.headers["x-forwarded-for"], "join")
    : undefined;
  const realIp = trustProxy && !forwardedIp
    ? rightmostHop(request.headers["x-real-ip"], "last")
    : undefined;
  return (forwardedIp || realIp || request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}
