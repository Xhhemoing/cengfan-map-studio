import type http from "node:http";

type HeaderValue = string | string[] | undefined;

const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
const bracketedAddress = /^\[([^\]]+)\](?::\d+)?$/;

function unwrapBracketedAddress(value: string): string {
  return value.match(bracketedAddress)?.[1] ?? value;
}

function normalizeIpv4MappedAddress(value: string): string {
  const mappedMatch = unwrapBracketedAddress(value).match(/^::ffff:(.*)$/i);
  if (!mappedMatch) return value;

  const mappedAddress = mappedMatch[1];
  const hexGroups = mappedAddress.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexGroups) return mappedAddress;

  const high = Number.parseInt(hexGroups[1], 16);
  const low = Number.parseInt(hexGroups[2], 16);
  return [
    (high >> 8) & 255,
    high & 255,
    (low >> 8) & 255,
    low & 255,
  ].join(".");
}

function rightmostHop(value: HeaderValue, arrayMode: "join" | "last"): string | undefined {
  const hops = Array.isArray(value)
    ? (arrayMode === "join" ? value.join(",") : value.at(-1))
    : value;
  if (!hops) return undefined;

  const candidates = hops.split(",");
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const hop = normalizeForwardedAddress(candidates[index]);
    if (!hop) continue;
    return hop;
  }
  return undefined;
}

function forwardedParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
    } else if (quoted && character === "\\") {
      escaped = true;
    } else if (character === "\"") {
      quoted = !quoted;
    } else if (!quoted && (character === "," || character === ";")) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function normalizeForwardedAddress(value: string): string | undefined {
  let address = value.trim();
  if (address.startsWith("\"")) {
    if (address.length < 2 || !address.endsWith("\"")) return undefined;
    address = address.slice(1, -1).replace(/\\(.)/g, "$1").trim();
  } else if (address.includes("\"")) {
    return undefined;
  }

  if (!address || address.toLowerCase() === "unknown" || address.startsWith("_")) {
    return undefined;
  }

  const ipv4WithPortMatch = address.match(ipv4WithPort);
  return unwrapBracketedAddress(ipv4WithPortMatch?.[1] ?? address);
}

function forwardedFor(value: HeaderValue): string | undefined {
  const header = Array.isArray(value) ? value.join(",") : value;
  if (!header) return undefined;

  let lastUsable: string | undefined;
  for (const part of forwardedParts(header)) {
    const match = part.trim().match(/^for\s*=\s*(.*)$/i);
    if (!match) continue;
    const address = normalizeForwardedAddress(match[1]);
    // Ignore unusable hops while retaining the last usable proxy-added value.
    if (address) lastUsable = address;
  }
  return lastUsable;
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
  const standardForwardedIp = trustProxy && !forwardedIp && !realIp
    ? forwardedFor(request.headers.forwarded)
    : undefined;
  const address = forwardedIp || realIp || standardForwardedIp || request.socket.remoteAddress || "unknown";
  return normalizeIpv4MappedAddress(address);
}
