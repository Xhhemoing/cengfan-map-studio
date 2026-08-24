// @vitest-environment node
import { expect, it } from "vitest";
import { createRoomStore } from "./collaboration";

// 房间存储的功能用例按域拆到 collaboration-*.test.ts；这里只保留受 COLLAB_AUTH_BENCH
// 门控的 authorize 压测，默认仍然 skip，不随拆分消失。
const authorizeBench = process.env.COLLAB_AUTH_BENCH === "1" ? it : it.skip;

authorizeBench("benchmarks authorize with 50 participants", () => {
  let nextSecret = 0;
  const store = createRoomStore({
    generateId: () => "BENCH1",
    generateSecret: () => `bench-secret-${nextSecret++}`,
  });
  const owner = store.create({}, { clientId: "owner", displayName: "Owner" });
  let targetToken = owner.access.accessToken;
  for (let index = 1; index < 50; index += 1) {
    const invitation = store.createInvitation("BENCH1", owner.access.accessToken, "viewer");
    targetToken = store.join("BENCH1", {
      inviteToken: invitation.token,
      clientId: `viewer-${index}`,
      displayName: `Viewer ${index}`,
    }).access.accessToken;
  }

  for (let index = 0; index < 250; index += 1) {
    store.authorize("BENCH1", targetToken, "read");
  }

  let operations = 0;
  const startedAt = process.hrtime.bigint();
  let elapsedNs: bigint;
  do {
    for (let index = 0; index < 100; index += 1) {
      store.authorize("BENCH1", targetToken, "read");
    }
    operations += 100;
    elapsedNs = process.hrtime.bigint() - startedAt;
  } while (elapsedNs < 1_000_000_000n);

  const operationsPerSecond = operations / (Number(elapsedNs) / 1_000_000_000);
  console.log(`authorize-50 ops/sec: ${operationsPerSecond.toFixed(0)}`);
  expect(operationsPerSecond).toBeGreaterThan(0);
});
