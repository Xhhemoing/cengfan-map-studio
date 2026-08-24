import type http from "node:http";

function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1") return true;
  const octets = normalized.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function requestHostname(host: string | undefined): string | undefined {
  if (!host) return undefined;
  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

/**
 * A loopback listener is a privileged local endpoint: only names guaranteed to
 * resolve to loopback may address it. Public listeners retain normal virtual
 * host behavior for reverse proxies and custom deployment domains.
 */
export function isHostAllowed(request: http.IncomingMessage, server: http.Server): boolean {
  const listener = server.address();
  if (!listener || typeof listener === "string" || !isLoopbackAddress(listener.address)) return true;
  const hostname = requestHostname(request.headers.host);
  return Boolean(
    hostname
    && (hostname === "localhost" || hostname.endsWith(".localhost") || isLoopbackAddress(hostname)),
  );
}
