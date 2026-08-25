import { describe, expect, it, vi } from "vitest";
import {
  createRoom,
  fetchRoom,
  joinRoom,
  submitRoomOperations,
  submitRoomSnapshot,
} from "./collaboration-client";
import { ok } from "./collaboration-client-test-fixtures";

describe("collaboration client", () => {
  it("carries the additive persistence flag out of create, join and snapshot responses", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: false }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: false }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 }, persistedAtLastFlush: false }));

    const created = await createRoom({ clientId: "c1", displayName: "创建者", request });
    const joined = await joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request });
    const room = await fetchRoom("abc123", "member-token", request);

    // 兄弟字段(不在 room 里面)与快照上的房间字段是两处不同的位置,两处都要落到调用方手上。
    expect(created.persistedAtLastFlush).toBe(false);
    expect(joined.persistedAtLastFlush).toBe(false);
    expect(room.persistedAtLastFlush).toBe(false);
  });

  it("reports a healthy room as persisted and stays silent when the server says nothing", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: true }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: true }))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" } }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0 }));

    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.toMatchObject({ persistedAtLastFlush: true });
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.toMatchObject({ persistedAtLastFlush: true });
    // 旧服务端不带这个字段:必须是"没有说法",而不是任何一种说法。
    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
  });

  it("only trusts a JSON boolean for the persistence flag", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: "false" }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: null }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: "true" }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: 0 }));

    // 字符串 "false" 是真值,数字 0 是假值:任何一种漏过去,面板都会凭形状变化而不是服务端的判断说话。
    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
  });

  it("carries the additive persistence outcome out of create, join and snapshot responses", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: 1_764_000_000_000 } }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: false, persistence: { outcome: "skipped", at: null } }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_001 } }));

    const created = await createRoom({ clientId: "c1", displayName: "创建者", request });
    const joined = await joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request });
    const room = await fetchRoom("abc123", "member-token", request);

    // 布尔位对裁剪和跳过一视同仁,两者后果不同(裁剪的房间重启后还在,只是历史没了),
    // 区别只能从同级的 outcome 上读出来。
    expect(created.persistence).toEqual({ outcome: "trimmed", at: 1_764_000_000_000 });
    expect(created.persistedAtLastFlush).toBe(false);
    expect(joined.persistence).toEqual({ outcome: "skipped", at: null });
    expect(joined.persistedAtLastFlush).toBe(false);
    expect(room.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_001 });
  });

  it("only trusts the three known outcomes for the persistence object", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistence: { outcome: "TRIMMED", at: 1 } }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistence: { outcome: "purged", at: 1 } }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: "trimmed" }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { at: 1 } }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: null }));

    // 布尔位那把尺子同样量这里:只有三个已知字面量算数。网关塞进来的大小写变体、服务端将来
    // 新增的第四种处置、被压成字符串的对象,一旦被当成"有说法",面板就会凭响应形状挑文案。
    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.not.toHaveProperty("persistence");
    await expect(joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request })).resolves.not.toHaveProperty("persistence");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistence");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistence");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistence");
  });

  it("keeps a known outcome when the flush timestamp is unusable", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "trimmed", at: "1764000000000" } }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "trimmed" } }));

    // `at` 只是提示落盘时刻的装饰位,读不出数字就当"不知道";结论本身不该跟着一起丢。
    await expect(fetchRoom("abc123", "member-token", request)).resolves.toMatchObject({ persistence: { outcome: "trimmed", at: null } });
    await expect(fetchRoom("abc123", "member-token", request)).resolves.toMatchObject({ persistence: { outcome: "trimmed", at: null } });
  });

  /**
   * 落盘连续失败的那一段时间里,三态与 `at` 说的都还是上一次**成功**落盘的处置——响应长得
   * 和一切正常一模一样。失败连击只能从 R8-2 的 `lastFailureAt` 上读出来,读不到它,房里的人
   * 就没有任何渠道知道此刻的改动可能撑不过一次服务端重启。
   */
  it("carries the persist-failure streak out of create, join and snapshot responses", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 } }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: null, lastFailureAt: 1_764_000_000_901 } }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_902 } }));

    const created = await createRoom({ clientId: "c1", displayName: "创建者", request });
    const joined = await joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request });
    const room = await fetchRoom("abc123", "member-token", request);

    expect(created.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 });
    // 连击不改三态,也不改布尔兼容位:上一次成功落盘确实完整写下了这间房。
    expect(created.persistedAtLastFlush).toBe(true);
    expect(joined.persistence).toEqual({ outcome: "trimmed", at: null, lastFailureAt: 1_764_000_000_901 });
    expect(room.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_902 });
  });

  it("only trusts a finite number for the failure timestamp and leaves the key out without a streak", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: "1764000000900" } }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: null } }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: true } }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistence: { outcome: "persisted", at: 1_764_000_000_000 } }));

    // 没有连击时服务端整个键都不出现,所以"读不出有限数字"与"键缺席"必须是同一件事:解析出来
    // 的形状要和只有 outcome/at 时一字不差,否则一个多出来的 null 就会让既有的精确等值判定变色。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const room = await fetchRoom("abc123", "member-token", request);
      expect(room.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_000 });
      expect(room.persistence).not.toHaveProperty("lastFailureAt");
    }
  });

  /**
   * 稳态下正在编辑的成员只会反复收到事务回执:创建/加入/快照那三个报落盘的响应他一次也不会
   * 再取,SSE 对落盘一言不发。回执上的落盘字段如果不过同一把尺子,要么整个丢掉(面板永远追不上
   * 中途开始的失败连击),要么直通(响应形状一变面板就跟着改口)。
   */
  it("normalizes the persistence verdict carried on a transaction acknowledgement", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({
        id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-1",
        persistedAtLastFlush: true, persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 },
      }))
      .mockImplementationOnce(() => ok({
        id: "ABC123", version: 3, ready: true, updatedBy: "c1", lastTxId: "tx-2",
        persistedAtLastFlush: false, persistence: { outcome: "trimmed", at: null },
      }));

    const uploaded = await submitRoomSnapshot("ABC123", "owner-token", { txId: "tx-1", clientId: "c1", baseVersion: 1, snapshot: {} }, request);
    const applied = await submitRoomOperations("ABC123", "owner-token", { txId: "tx-2", clientId: "c1", baseVersion: 2, operations: [] }, request);

    expect(uploaded.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: 1_764_000_000_900 });
    expect(uploaded.persistedAtLastFlush).toBe(true);
    // 连击结束的那一笔回执:带了处置却没带失败时刻,键整个不出现,和快照路径一字不差。
    expect(applied.persistence).toEqual({ outcome: "trimmed", at: null });
    expect(applied.persistence).not.toHaveProperty("lastFailureAt");
    expect(applied.persistedAtLastFlush).toBe(false);
  });

  it("applies the same persistence discipline to acknowledgements from an old or garbled server", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-1" }))
      .mockImplementationOnce(() => ok({
        id: "ABC123", version: 3, ready: true, updatedBy: "c1", lastTxId: "tx-2",
        persistedAtLastFlush: "false", persistence: { outcome: "purged", at: 1 },
      }))
      .mockImplementationOnce(() => ok({
        id: "ABC123", version: 4, ready: true, updatedBy: "c1", lastTxId: "tx-3",
        persistence: { outcome: "persisted", at: 1_764_000_000_000, lastFailureAt: null, note: "read-only fs" },
      }));

    // 旧服务端的回执不带这两个字段:必须是"没有说法",而不是任何一种说法。
    const legacy = await submitRoomOperations("ABC123", "owner-token", { txId: "tx-1", clientId: "c1", baseVersion: 1, operations: [] }, request);
    expect(legacy).not.toHaveProperty("persistedAtLastFlush");
    expect(legacy).not.toHaveProperty("persistence");

    // 字符串布尔与第四种处置都不算数,和 create/join/快照三条路径同一把尺子。
    const garbled = await submitRoomOperations("ABC123", "owner-token", { txId: "tx-2", clientId: "c1", baseVersion: 2, operations: [] }, request);
    expect(garbled).not.toHaveProperty("persistedAtLastFlush");
    expect(garbled).not.toHaveProperty("persistence");

    // 未知的额外键一律丢掉,`lastFailureAt: null` 与键缺席是同一件事。
    const extras = await submitRoomOperations("ABC123", "owner-token", { txId: "tx-3", clientId: "c1", baseVersion: 3, operations: [] }, request);
    expect(extras.persistence).toEqual({ outcome: "persisted", at: 1_764_000_000_000 });
  });
});
