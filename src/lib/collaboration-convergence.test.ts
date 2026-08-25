// @vitest-environment node

import { describe, expect, it } from "vitest";
import { CollaborationError, createRoomStore } from "../../server/collaboration";
import {
  diffCollaborationDocument,
  rebaseRemoteCollaborationOperations,
} from "./collaboration-operations";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";

const roomId = "ACKLOST1";
const clientId = "owner";
const accessToken = "owner-access";

function createAckLostDocuments() {
  const baseline = createProjectPackage({
    project: createProjectDocument({
      students: [{
        id: "student-1",
        name: "甲",
        university: "北京大学",
        city: "北京市",
        visibility: true,
      }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [],
    fonts: [],
    now: new Date("2026-08-24T00:00:00.000Z"),
  });
  const current = structuredClone(baseline);
  current.project.students.push({
    id: "student-2",
    name: "乙",
    university: "浙江大学",
    city: "杭州市",
    visibility: true,
  });
  return { baseline, current };
}

function createStore() {
  return createRoomStore({
    generateId: () => roomId,
    generateSecret: () => accessToken,
  });
}

describe("ack-lost collaboration convergence", () => {
  it("backfills the landed operations and re-diffs to empty after a new txId conflicts at the stale base", () => {
    const { baseline, current } = createAckLostDocuments();
    const operations = diffCollaborationDocument(baseline, current);
    const store = createStore();
    const created = store.create(baseline, { clientId, displayName: "创建者" });

    expect(operations).toEqual([{
      type: "array-upsert",
      path: ["project", "students"],
      item: current.project.students[1],
    }]);

    // The first POST landed, but the client never received this acknowledgement.
    const landed = store.apply(roomId, created.access.accessToken, {
      txId: "tx-with-lost-ack",
      clientId,
      baseVersion: created.room.version,
      operations,
    });
    expect(landed).toMatchObject({ version: 1, snapshot: current });

    // Healing re-diffs the unchanged client baseline/current pair and uses a new txId.
    const retriedOperations = diffCollaborationDocument(baseline, current);
    let conflict: unknown;
    try {
      store.apply(roomId, created.access.accessToken, {
        txId: "tx-after-heal",
        clientId,
        baseVersion: created.room.version,
        operations: retriedOperations,
      });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(CollaborationError);
    expect(conflict).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 });

    const backfill = store.getOperations(roomId, created.access.accessToken, created.room.version);
    expect(backfill).toEqual({ version: 1, operations });

    const rebased = rebaseRemoteCollaborationOperations(baseline, current, backfill.operations);
    expect(diffCollaborationDocument(rebased.baseline, rebased.current)).toEqual([]);

    const finalRoom = store.get(roomId);
    const finalSnapshot = finalRoom?.snapshot as typeof current | undefined;
    expect(finalSnapshot).toEqual(rebased.baseline);
    expect(finalSnapshot).toEqual(current);
    expect(finalSnapshot?.project.students.filter(
      (student) => student.id === "student-2",
    )).toHaveLength(1);

    const observedVersions = [
      created.room.version,
      landed.version,
      backfill.version,
      finalRoom!.version,
    ];
    expect(observedVersions).toEqual([0, 1, 1, 1]);
    expect(observedVersions.every(
      (version, index) => index === 0 || version >= observedVersions[index - 1]!,
    )).toBe(true);
  });

  it("treats an exact same-txId re-POST as a no-op", () => {
    const { baseline, current } = createAckLostDocuments();
    const operations = diffCollaborationDocument(baseline, current);
    const store = createStore();
    const created = store.create(baseline, { clientId, displayName: "创建者" });
    const transaction = {
      txId: "stable-tx-id",
      clientId,
      baseVersion: created.room.version,
      operations,
    };

    const first = store.apply(roomId, created.access.accessToken, transaction);
    const replay = store.apply(roomId, created.access.accessToken, transaction);

    expect(first.version).toBe(1);
    expect(replay).toMatchObject({
      version: 1,
      lastTxId: transaction.txId,
      snapshot: current,
    });
    expect(store.getOperations(roomId, created.access.accessToken, 0)).toEqual({
      version: 1,
      operations,
    });
  });
});
