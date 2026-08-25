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

  it("strips a mixed-case IPv4-mapped prefix from the untrusted proxy socket", () => {
    expect(clientIp(requestWith({}, "::FFFF:127.0.0.1"), false)).toBe("127.0.0.1");
  });

  it("ignores a quoted X-Forwarded-For hop when the proxy is not trusted", () => {
    const request = requestWith(
      { "x-forwarded-for": '"203.0.113.9"' },
      "::ffff:192.0.2.10",
    );

    expect(clientIp(request, false)).toBe("192.0.2.10");
  });

  it("uses the rightmost non-empty X-Forwarded-For hop before X-Real-IP", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, , 203.0.113.2, ",
      "x-real-ip": "192.0.2.3",
    });

    expect(clientIp(request, true)).toBe("203.0.113.2");
  });

  it("strips a mixed-case IPv4-mapped prefix from X-Forwarded-For", () => {
    const request = requestWith({ "x-forwarded-for": "::FFFF:203.0.113.9" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("continues to strip a lowercase IPv4-mapped prefix", () => {
    const request = requestWith({ "x-forwarded-for": "::ffff:203.0.113.9" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("leaves a real IPv6 address unchanged", () => {
    const request = requestWith({ "x-forwarded-for": "2001:db8::1" });

    expect(clientIp(request, true)).toBe("2001:db8::1");
  });

  it("unwraps a quoted IPv4 X-Forwarded-For hop", () => {
    const request = requestWith({ "x-forwarded-for": '"203.0.113.9"' });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("unwraps a quoted bracketed IPv6 X-Forwarded-For hop", () => {
    const request = requestWith({ "x-forwarded-for": '"[2001:db8::1]"' });

    expect(clientIp(request, true)).toBe("2001:db8::1");
  });

  it("leaves an unquoted IPv4 X-Forwarded-For hop unchanged", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.9" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("skips a malformed quoted X-Forwarded-For hop and falls through", () => {
    const request = requestWith({
      "x-forwarded-for": '"203.0.113.9',
      "x-real-ip": "192.0.2.10",
    });

    expect(clientIp(request, true)).toBe("192.0.2.10");
  });

  it("skips a trailing unknown X-Forwarded-For hop", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, unknown",
    });

    expect(clientIp(request, true)).toBe("198.51.100.1");
  });

  it("skips an obfuscated X-Forwarded-For suffix", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1, _hidden",
    });

    expect(clientIp(request, true)).toBe("198.51.100.1");
  });

  it("strips an IPv4 source port from X-Forwarded-For", () => {
    const request = requestWith({ "x-forwarded-for": "203.0.113.9:54321" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it.each([
    "[2001:db8::1]",
    "[2001:db8::1]:4711",
  ])("unwraps a bracketed IPv6 X-Forwarded-For hop from %s", (forwardedFor) => {
    const request = requestWith({ "x-forwarded-for": forwardedFor });

    expect(clientIp(request, true)).toBe("2001:db8::1");
  });

  it("strips the port from the rightmost X-Forwarded-For hop", () => {
    const request = requestWith({
      "x-forwarded-for": "198.51.100.1:1, 203.0.113.9:2",
    });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("does not treat an IPv6 X-Forwarded-For suffix as a port", () => {
    const request = requestWith({ "x-forwarded-for": "2001:db8::1" });

    expect(clientIp(request, true)).toBe("2001:db8::1");
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

  it("unwraps a quoted IPv4 X-Real-IP hop", () => {
    const request = requestWith({ "x-real-ip": '"203.0.113.9"' });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("skips a trailing unknown X-Real-IP hop", () => {
    const request = requestWith({
      "x-real-ip": "198.51.100.1, unknown",
    });

    expect(clientIp(request, true)).toBe("198.51.100.1");
  });

  it("strips an IPv4 source port from X-Real-IP", () => {
    const request = requestWith({ "x-real-ip": "203.0.113.9:54321" });

    expect(clientIp(request, true)).toBe("203.0.113.9");
  });

  it("unwraps a bracketed IPv6 X-Real-IP hop", () => {
    const request = requestWith({ "x-real-ip": "[2001:db8::1]" });

    expect(clientIp(request, true)).toBe("2001:db8::1");
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
