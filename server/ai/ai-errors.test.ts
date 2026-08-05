// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AiCallError,
  classifyUpstreamFailure,
  isRetryableAiError,
  sanitizeAiDetail,
} from "./ai-errors";

describe("AI error classification", () => {
  it("classifies aborts as non-retryable cancellation", () => {
    const error = classifyUpstreamFailure({ cause: new DOMException("aborted", "AbortError") });
    expect(error).toMatchObject({ code: "AI_ABORTED" });
    expect(isRetryableAiError(error)).toBe(false);
  });

  it("classifies timeout, throttling, transient upstream and client errors", () => {
    expect(classifyUpstreamFailure({ cause: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }).code).toBe("AI_TIMEOUT");
    expect(classifyUpstreamFailure({ status: 429 }).code).toBe("AI_RATE_LIMITED");
    expect(classifyUpstreamFailure({ status: 503 }).code).toBe("AI_UPSTREAM_UNAVAILABLE");
    expect(classifyUpstreamFailure({ cause: new Error("fetch failed") }).code).toBe("AI_UPSTREAM_UNAVAILABLE");
    expect(classifyUpstreamFailure({ status: 400 }).code).toBe("AI_UPSTREAM_REJECTED");
    expect(classifyUpstreamFailure({ status: 401 }).code).toBe("AI_UPSTREAM_REJECTED");
    expect(classifyUpstreamFailure({ status: 404 }).code).toBe("AI_UPSTREAM_REJECTED");
    expect(isRetryableAiError(classifyUpstreamFailure({ status: 503 }))).toBe(true);
    expect(isRetryableAiError(classifyUpstreamFailure({ status: 400 }))).toBe(false);
  });

  it("sanitizes credentials and caps diagnostic details", () => {
    const detail = sanitizeAiDetail(`Bearer sk-secret student prompt ${"x".repeat(300)}`);
    expect(detail).not.toContain("sk-secret");
    expect(detail).not.toContain("Bearer");
    expect(detail.length).toBeLessThanOrEqual(200);
  });

  it("recognizes invalid response errors as non-retryable", () => {
    const error = new AiCallError("AI_INVALID_RESPONSE", "invalid");
    expect(isRetryableAiError(error)).toBe(false);
  });
});
