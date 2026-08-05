// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createBudgetReceiptLedger, createBudgetReceiptSigner } from "./budget-receipt";

describe("budget receipts", () => {
  it("includes issuedAt and sequence and consumes a receipt only once", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer, { now: () => 1000 });
    const receipt = signer.issue({ taskId: "task-ledger", usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: 1000 });
    const payload = signer.verify(receipt, "task-ledger");
    expect(payload).toMatchObject({ sequence: 1, issuedAt: 1000 });
    ledger.recordIssued(receipt, payload!);
    expect(ledger.verifyAndConsume(receipt, "task-ledger")).toMatchObject({ sequence: 1 });
    expect(ledger.verifyAndConsume(receipt, "task-ledger")).toBeNull();
  });

  it("allows only one concurrent synchronous consumption", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const receipt = signer.issue({ taskId: "task-concurrent", usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: Date.now() });
    const payload = signer.verify(receipt, "task-concurrent")!;
    ledger.recordIssued(receipt, payload);
    const results = [ledger.verifyAndConsume(receipt, "task-concurrent"), ledger.verifyAndConsume(receipt, "task-concurrent")];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("releases a failed receipt claim so the same receipt can be retried", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const receipt = signer.issue({ taskId: "task-retry", usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: Date.now() });
    ledger.recordIssued(receipt, signer.verify(receipt, "task-retry")!);

    const failedClaim = ledger.beginConsume(receipt, "task-retry");
    expect(failedClaim?.payload.sequence).toBe(1);
    ledger.rollback(failedClaim!);

    expect(ledger.beginConsume(receipt, "task-retry")?.payload.sequence).toBe(1);
  });

  it("commits a new receipt atomically and prevents replay of the old receipt", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const oldReceipt = signer.issue({ taskId: "task-commit", usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: Date.now() });
    ledger.recordIssued(oldReceipt, signer.verify(oldReceipt, "task-commit")!);
    const claim = ledger.beginConsume(oldReceipt, "task-commit");
    const newReceipt = signer.issue({ taskId: "task-commit", usedTokens: 2, rounds: 2, maxTokens: 60000, maxRounds: 20, sequence: 2, issuedAt: Date.now() });

    ledger.commit(claim!, newReceipt, signer.verify(newReceipt, "task-commit")!);

    expect(ledger.beginConsume(oldReceipt, "task-commit")).toBeNull();
    expect(ledger.beginConsume(newReceipt, "task-commit")?.payload.sequence).toBe(2);
  });

  it("releases an initial reservation so the same task id can be retried", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer);
    const firstClaim = ledger.reserveInitial("task-initial-retry");
    expect(firstClaim).not.toBeNull();
    ledger.rollback(firstClaim!);

    expect(ledger.reserveInitial("task-initial-retry")).not.toBeNull();
  });

  it("reclaims a suspended claim after its TTL", () => {
    let now = 0;
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer, { ttlMs: 10, now: () => now });
    const receipt = signer.issue({ taskId: "task-ttl", usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: now });
    ledger.recordIssued(receipt, signer.verify(receipt, "task-ttl")!);
    expect(ledger.beginConsume(receipt, "task-ttl")).not.toBeNull();
    now = 11;

    expect(ledger.beginConsume(receipt, "task-ttl")).not.toBeNull();
  });

  it("cleans expired and over-capacity entries without storing prompt data", () => {
    let now = 0;
    const signer = createBudgetReceiptSigner("test-secret");
    const ledger = createBudgetReceiptLedger(signer, { maxEntries: 1, ttlMs: 10, now: () => now });
    const issue = (taskId: string) => {
      const receipt = signer.issue({ taskId, usedTokens: 1, rounds: 1, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: now });
      ledger.recordIssued(receipt, signer.verify(receipt, taskId)!);
      return receipt;
    };
    issue("task-old");
    now = 1;
    issue("task-new");
    expect(ledger.size).toBe(1);
    now = 20;
    ledger.cleanup();
    expect(ledger.size).toBe(0);
    expect(JSON.stringify(ledger)).not.toContain("prompt");
  });

  it("signs and verifies the task-bound budget payload", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const receipt = signer.issue({ taskId: "task-1", usedTokens: 123, rounds: 2, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: Date.now() });
    expect(receipt.length).toBeLessThanOrEqual(2048);
    expect(signer.verify(receipt, "task-1")).toEqual({
      version: 1,
      taskId: "task-1",
      sequence: 1,
      issuedAt: expect.any(Number),
      usedTokens: 123,
      rounds: 2,
      maxTokens: 60000,
      maxRounds: 20,
    });
  });

  it("rejects tampered, cross-task, malformed, and oversized receipts", () => {
    const signer = createBudgetReceiptSigner("test-secret");
    const receipt = signer.issue({ taskId: "task-1", usedTokens: 123, rounds: 2, maxTokens: 60000, maxRounds: 20, sequence: 1, issuedAt: Date.now() });
    const [version, payload, signature] = receipt.split(".");
    const tampered = `${version}.${payload!.replace(/.$/, payload!.endsWith("A") ? "B" : "A")}.${signature}`;
    expect(signer.verify(tampered, "task-1")).toBeNull();
    expect(signer.verify(receipt, "task-2")).toBeNull();
    expect(signer.verify("v1.bad.receipt", "task-1")).toBeNull();
    expect(signer.verify(`${receipt}${"x".repeat(2048)}`, "task-1")).toBeNull();
  });
});
