// @vitest-environment node
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

function requestWith(
  headers: IncomingHttpHeaders = {},
  remoteAddress = "::ffff:127.0.0.1",
): Pick<IncomingMessage, "headers" | "socket"> {
  return {
    headers,
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
});
