import type http from "node:http";

function isLoopbackIpv4Address(address: string): boolean {
  const octets = address.split(".");
  return octets.length === 4
    && octets[0] === "127"
    && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function isLoopbackAddress(address: string): boolean {
  const mappedPrefix = /^::ffff:/i;
  const isMapped = mappedPrefix.test(address);
  const normalized = address.replace(mappedPrefix, "").toLowerCase();
  if (!isMapped && normalized === "::1") return true;
  if (isLoopbackIpv4Address(normalized)) return true;
  if (!isMapped) return false;

  // WHATWG URL parsing serializes mapped dotted IPv4 as two hexadecimal groups.
  const mappedHex = normalized.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  return Boolean(mappedHex && (Number.parseInt(mappedHex[1], 16) >> 8) === 127);
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
