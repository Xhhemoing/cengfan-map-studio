// @vitest-environment node
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

function requestWith(
  headers: Record<string, string | string[] | undefined> = {},
  remoteAddress = "::ffff:127.0.0.1",
): Pick<IncomingMessage, "headers" | "socket"> {
  return {
    headers: headers as IncomingHttpHeaders,
    socket: { remoteAddress } as IncomingMessage["socket"],
  };
}

describe("clientIp", () => {
  it("ignores proxy headers when the proxy is not trusted and normalizes the socket address", () => {
    const request = requestWith({
      "x-forwarded-for": ["198.51.100.1", "203.0.113.2"],
      "x-real-ip": ["198.51.100.3", "203.0.113.4"],
    });

    expect(clientIp(request, false)).toBe("127.0.0.1");
  });

  it("uses the rightmost non-empty X-Forwarded-For hop before X-Real-IP", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, , 203.0.113.2, ",
      "x-real-ip": "192.0.2.3",
    });

    expect(clientIp(request, true)).toBe("203.0.113.2");
  });

  it("joins X-Forwarded-For arrays before selecting the rightmost non-empty hop", () => {
    const request = requestWith({
      "x-forwarded-for": ["198.51.100.1, ", " , 203.0.113.2, "],
      "x-real-ip": "192.0.2.3",
    });

    expect(clientIp(request, true)).toBe("203.0.113.2");
  });

  it("uses the rightmost non-empty comma-separated X-Real-IP hop", () => {
    const request = requestWith({
      "x-forwarded-for": " , ",
      "x-real-ip": "198.51.100.1, , 203.0.113.2, ",
    });

    expect(clientIp(request, true)).toBe("203.0.113.2");
  });

  it("splits only the last X-Real-IP array element into hops", () => {
    const request = requestWith({
      "x-real-ip": ["198.51.100.1", " , 203.0.113.2, "],
    });

    expect(clientIp(request, true)).toBe("203.0.113.2");
  });

  it("does not use earlier X-Real-IP array elements when the last one has no hop", () => {
    const request = requestWith(
      { "x-real-ip": ["198.51.100.1", " , "] },
      "::ffff:192.0.2.10",
    );

    expect(clientIp(request, true)).toBe("192.0.2.10");
  });

  it("uses Forwarded when trusted proxy headers do not provide an address", () => {
    const request = requestWith({ forwarded: "for=203.0.113.9" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("uses the last usable for= value in one Forwarded header", () => {
    const request = requestWith({
      forwarded: "for=198.51.100.1;proto=https, for=203.0.113.9",
    });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("normalizes a quoted bracketed IPv6 Forwarded address", () => {
    const request = requestWith({ forwarded: 'for="[2001:db8::1]"' });

    expect(clientIp(request, true)).toBe("2001:db8::1");
  });

  it("ignores Forwarded when the proxy is not trusted", () => {
    const request = requestWith(
      { forwarded: "for=203.0.113.9" },
      "::ffff:192.0.2.10",
    );

    expect(clientIp(request, false)).toBe("192.0.2.10");
  });

  it("prefers X-Forwarded-For over Forwarded", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.7",
      forwarded: "for=203.0.113.9",
    });

    expect(clientIp(request, true)).toBe("198.51.100.7");
  });

  it("joins Forwarded arrays and skips unusable for= values", () => {
    const request = requestWith({
      forwarded: ["for=198.51.100.7", "for=unknown, FOR=\"_hidden\""],
    });

    expect(clientIp(request, true)).toBe("198.51.100.7");
  });

  it.each([
    ['for="[2001:db8::1]:4711"', "2001:db8::1"],
    ["for=192.0.2.60:8080", "192.0.2.60"],
    ["for=2001:db8::2", "2001:db8::2"],
  ])("strips only clear Forwarded ports from %s", (forwarded, expected) => {
    expect(clientIp(requestWith({ forwarded }), true)).toBe(expected);
  });
});
