// 仅供 collaboration 房间存储测试使用的共享装置：从 collaboration.test.ts 原样搬出的
// 降级播种助手，供 collaboration-degraded-warn.test.ts 等按域拆分后的用例共用。
import { createRoomStore, MAX_PERSISTED_ROOM_BYTES } from "./collaboration";

export const seedTrimmedRoom = (store: ReturnType<typeof createRoomStore>, id: string) => {
  store.create(
    { payload: "t".repeat(MAX_PERSISTED_ROOM_BYTES - 8 * 1024) },
    { clientId: `${id}-owner`, displayName: `${id} Owner` },
  );
  for (let version = 0; version < 64; version += 1) {
    store.apply(id, "owner-access", {
      txId: `${id}-op-${version}`,
      clientId: `${id}-owner`,
      baseVersion: version,
      operations: [{ type: "set", path: ["historyPadding"], value: "h".repeat(256) }],
    });
  }
};

export const seedSkippedRoom = (store: ReturnType<typeof createRoomStore>, id: string) => {
  store.create(
    { payload: "s".repeat(MAX_PERSISTED_ROOM_BYTES) },
    { clientId: `${id}-owner`, displayName: `${id} Owner` },
  );
};
