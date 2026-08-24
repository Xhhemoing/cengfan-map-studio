import type { MutableRefObject } from "react";
import { COLLABORATION_SEND_DELAY_MS } from "./app-constants";
import {
  CollaborationClientError,
  fetchRoomOperations,
  isCollaborationTransportError,
  isOwnRoomAcknowledgement,
  submitRoomOperations,
  type CollaborationRole,
  type CollaborationRoom,
} from "./collaboration-client";
import {
  applyCollaborationOperations,
  diffCollaborationDocument,
  rebaseRemoteCollaborationOperations,
  type CollaborationOperation,
} from "./collaboration-operations";
import { createId } from "./ids";
import type { ProjectPackage } from "./project-package";
import type { RoomCollaborationStatus, UseCollaborationRoomRefs } from "./useCollaborationRoom";

/**
 * 版本冲突后的重投预算。补齐一次、重投一次就停:再冲突说明房间正在被高频改写,
 * 继续自动重投只会和别人的事务互相顶,把一次冲突放大成一串上传。
 */
export const COLLABORATION_CONFLICT_RETRIES = 1;

export interface CollaborationHealSignal {
  roomId: string | null;
  connectionHealCount: number;
  roomVersion: number;
}

/**
 * 分区愈合信号。送出只在工作区或房间身份变化时重新武装,所以分区期间失败的增量要等
 * 用户下一次编辑才会重投——用户不动就永远不上传。连接从离线恢复,或房间版本前进
 * (流上收到事件本身就证明连接回来了),都算连接已愈合,必须重新武装一次送出。
 *
 * 恢复次数(而不是离线标记本身)才是愈合判据:送出侧自己的传输层失败也会置位离线,
 * 拿标记跳变当信号的话,"进入离线"这一跳同样会重新武装送出,分区期间每失败一次就
 * 再发一笔注定失败的事务。恢复次数只在真正的「离线 → 在线」跳变时前进;房间进终局时
 * 离线位被清掉但计数不动,过期房间因此不会被误判成愈合。
 */
export interface CollaborationHealTracker {
  /** 房间状态每次变化都喂进来;只更新内部标记,不产生任何副作用。 */
  observe(signal: CollaborationHealSignal): void;
  /** 取走并清空愈合标记:重投是一次性补投,不是自带重试的循环。 */
  consume(): boolean;
  /** 抬高版本水位线,把送出侧自己推进的版本排除在愈合判据之外。 */
  noteVersion(version: number): void;
}

export function createCollaborationHealTracker(): CollaborationHealTracker {
  let trackedRoom: string | null = null;
  let healCount = 0;
  let version = 0;
  let pending = false;
  return {
    observe(signal) {
      // 换房间只是重新立水位线:新房间的版本号与上一间毫无关系,不能当成一次愈合。
      if (trackedRoom !== signal.roomId) {
        trackedRoom = signal.roomId;
        healCount = signal.connectionHealCount;
        version = signal.roomVersion;
        pending = false;
        return;
      }
      const healed = signal.connectionHealCount > healCount;
      const advanced = signal.roomVersion > version;
      healCount = signal.connectionHealCount;
      version = Math.max(version, signal.roomVersion);
      if (healed || advanced) pending = true;
    },
    consume() {
      const healResend = pending;
      pending = false;
      return healResend;
    },
    noteVersion(next) {
      version = Math.max(version, next);
    },
  };
}

/** 送出所需的房间身份与终局状态,由协作房间控制器提供。 */
export interface CollaborationSendRoom {
  roomId: string | null;
  roomAccessToken: string | null;
  roomRole: CollaborationRole | null;
  roomReadonly: boolean;
  roomClosed: boolean;
  roomExpired: boolean;
}

/** 送出侧回写协作面板的出口。 */
export interface CollaborationSendController {
  setRoomVersion(version: number): void;
  setCollaborationStatus(status: RoomCollaborationStatus): void;
  setCollaborationMessage(message: string): void;
  setCollaborationOffline(offline: boolean): void;
  reportTerminalRejection(code: string): boolean;
}

export interface CollaborationSendTransport {
  fetchOperations: typeof fetchRoomOperations;
  submitOperations: typeof submitRoomOperations;
}

export interface CollaborationSendRefs extends UseCollaborationRoomRefs {
  /**
   * 卸载之后 ref 还活着,但组件已经不在树上:在途上传的回执既不能改基线,也不能再
   * 对着卸载的树 setState。
   */
  mountedRef: MutableRefObject<boolean>;
}

export interface CollaborationSendOptions {
  clientId: string;
  room: CollaborationSendRoom;
  refs: CollaborationSendRefs;
  heal: CollaborationHealTracker;
  controller: CollaborationSendController;
  /** 当前工作区快照。 */
  currentPackage: (exportedAt?: string) => ProjectPackage;
  /** 把补齐后的远端包应用回工作区。 */
  applyPackage: (pack: ProjectPackage, version: number) => void;
  /** 注入点,只用于测试。 */
  transport?: CollaborationSendTransport;
  delayMs?: number;
}

const defaultTransport: CollaborationSendTransport = {
  fetchOperations: fetchRoomOperations,
  submitOperations: submitRoomOperations,
};

/** 上传成功后面板该说的那句话。 */
export function acknowledgementMessage(attempt: number, rebasedFromVersion: number | undefined): string {
  if (attempt > 0) return "已在最新版本上重试并完成增量同步";
  return rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改";
}

/** 冲突用尽预算后的说法:补齐成功与否决定用户下一步该期待什么。 */
export function conflictMessage(attempt: number): string {
  return attempt > 0
    ? "同一内容被其他成员修改；已同步到最新版本，下一次修改会重新上传"
    : "同一内容被其他成员修改；补齐最新版本失败，下一次修改会重新上传";
}

/**
 * 传输层失败和服务端拒绝是两回事:本地修改仍然有效,连接一回来这批增量就会被愈合信号
 * 重新投出去,面板要照实说,别让用户以为改动已经丢了。
 */
export function submitFailureMessage(error: unknown, partitioned: boolean): string {
  if (partitioned) return "网络异常，本地修改已保留，恢复后会自动续传";
  return error instanceof Error ? error.message : "增量同步失败";
}

/** 送出前的资格判断:终局房间与只读身份都不该再攒出一笔注定失败的事务。 */
export function canSendToRoom(room: CollaborationSendRoom): boolean {
  return Boolean(room.roomId)
    && Boolean(room.roomAccessToken)
    && room.roomRole !== "viewer"
    && !room.roomReadonly
    && !room.roomClosed
    && !room.roomExpired;
}

/**
 * 武装一次增量送出,返回清理函数(未武装时返回 undefined)。
 * 调用方每次工作区或房间身份变化时重新调用一次,与 React effect 的生命周期一一对应。
 */
export function armCollaborationSend(options: CollaborationSendOptions): (() => void) | undefined {
  const { clientId, room, refs, heal, controller, currentPackage, applyPackage } = options;
  const { fetchOperations, submitOperations } = options.transport ?? defaultTransport;
  const delayMs = options.delayMs ?? COLLABORATION_SEND_DELAY_MS;
  const { baselineRef, versionRef, roomRef, accessTokenRef, suppressSendRef, backfillInFlightRef, mountedRef } = refs;

  // 每次送出都消费掉愈合标记:重投是一次性的补投,不是自带重试的循环。
  const healResend = heal.consume();
  // 过期房间与关闭房间一样是终局:这一笔事务不可能落地,失败回执还会把终局提示盖成
  // "网络异常",让用户以为等网络回来就能续上。愈合标记在上面已经消费掉,不会攒到下一次。
  if (!canSendToRoom(room) || !baselineRef.current) return undefined;
  const roomId = room.roomId as string;
  const roomAccessToken = room.roomAccessToken as string;
  if (suppressSendRef.current) {
    suppressSendRef.current = false;
    // 愈合往往正是被远端事件带回来的,而远端事件会置位抑制标记。照常吞掉这一次,
    // 分区期间攒下的增量就又要等用户下一次编辑;基线此刻已经把远端修改并进去了,
    // 重新 diff 出来的只会是本地那部分。
    if (!healResend) return undefined;
  }

  /**
   * 上传在途期间可以切房、退房或卸载。回执回来时房间已经不是发起时那间,写基线会污染
   * 新房间的状态,写协作状态会把面板改回「已连接」。注意这里刻意不按调用实例取消:
   * 工作区状态一变就会重新武装,那不该让已经发出去的事务失去收尾。
   */
  const outdated = (): boolean => !mountedRef.current || roomRef.current !== roomId;
  const pendingOperations = (baseline: ProjectPackage): CollaborationOperation[] => (
    diffCollaborationDocument(baseline, currentPackage(baseline.exportedAt))
  );

  /**
   * 送出侧自己推进的版本(回执、冲突补齐)不是愈合信号:连接本来就是通的。先把水位线
   * 抬上去,愈合探测才不会把它当成一次新的愈合——否则一次冲突补齐会额外拉起一轮重投,
   * 把冲突预算叠成一串上传。
   */
  const advanceRoomVersion = (version: number) => {
    heal.noteVersion(version);
    controller.setRoomVersion(version);
  };

  const commitAcknowledgement = (txId: string, operations: CollaborationOperation[], acknowledged: CollaborationRoom<ProjectPackage>) => {
    const activeBaseline = baselineRef.current;
    if (!activeBaseline || outdated()) return;
    // 自回声抑制:版本已经走到回执版本之后,说明本次事务的 ops 事件已经从流上回放过
    // (lastTxId 用来确认那正是本次事务),基线里已经有这批 ops。再叠一次会把回声之后
    // 落地的远端修改按旧值盖回去,下一次 diff 就会把远端的修改当成本地改动重新上传。
    const echoAlreadyApplied = versionRef.current >= acknowledged.version
      && (acknowledged.lastTxId === undefined || isOwnRoomAcknowledgement(acknowledged, clientId, txId));
    if (echoAlreadyApplied) return;
    // 回声还没到:远端事件可能已经把基线推进过,所以要叠在「当前」基线上,而不是
    // await 之前那一份,否则远端修改会从基线里被抹掉。
    baselineRef.current = applyCollaborationOperations(activeBaseline, operations);
    // 版本只能单调前进:回退会让后续事件看起来像版本跳变,触发一次多余的区间补齐
    // 并重复应用已经落地的修改。
    if (acknowledged.version > versionRef.current) {
      versionRef.current = acknowledged.version;
      advanceRoomVersion(acknowledged.version);
    }
  };

  /**
   * 冲突自愈:把缺失的区间补齐到基线与工作区,再基于新基线重新 diff。返回 null 表示
   * 补齐没成功(或已有补齐在跑),调用方不再重投。
   */
  const rebaseOnLatestVersion = async (): Promise<CollaborationOperation[] | null> => {
    if (backfillInFlightRef.current || outdated()) return null;
    backfillInFlightRef.current = true;
    const afterVersion = versionRef.current;
    try {
      controller.setCollaborationMessage("同一版本上有并发修改，正在补齐后重试");
      const interval = await fetchOperations(roomId, accessTokenRef.current ?? roomAccessToken, afterVersion);
      const activeBaseline = baselineRef.current;
      if (!activeBaseline || outdated()) return null;
      // 补齐期间流上可能已经自己把版本推过这段区间:那份区间是相对 afterVersion 的,
      // 再套一次会重复应用,直接按当前基线重新 diff 即可。
      if (versionRef.current !== afterVersion) return pendingOperations(activeBaseline);
      if (interval.version <= afterVersion) return null;
      const rebased = rebaseRemoteCollaborationOperations(
        activeBaseline,
        currentPackage(activeBaseline.exportedAt),
        interval.operations,
      );
      baselineRef.current = rebased.baseline;
      suppressSendRef.current = true;
      applyPackage(rebased.current, interval.version);
      baselineRef.current = rebased.baseline;
      versionRef.current = interval.version;
      advanceRoomVersion(interval.version);
      // 工作区状态是异步落地的,重新 diff 只能用 rebase 的结果,不能读最新工作区快照。
      return diffCollaborationDocument(rebased.baseline, rebased.current);
    } catch {
      return null;
    } finally {
      backfillInFlightRef.current = false;
    }
  };

  const submit = async (operations: CollaborationOperation[], attempt: number): Promise<void> => {
    const txId = createId("collab-op");
    try {
      const acknowledged = await submitOperations<ProjectPackage>(roomId, roomAccessToken, {
        txId,
        clientId,
        baseVersion: versionRef.current,
        operations,
      });
      if (outdated()) return;
      commitAcknowledgement(txId, operations, acknowledged);
      if (outdated()) return;
      controller.setCollaborationStatus("connected");
      controller.setCollaborationMessage(acknowledgementMessage(attempt, acknowledged.rebasedFromVersion));
    } catch (error) {
      if (outdated()) return;
      if (!(error instanceof CollaborationClientError) || error.code !== "VERSION_CONFLICT") {
        // 回执是本端最早能拿到的终局证据:房间没了/凭证失效/房间已关闭,后面每一笔事务都
        // 注定失败。只画一句 error.message 的话,面板还是"已连接"的样子,送出下一次编辑
        // 照旧武装,用户会一直往一间死房里编辑,直到流自己发现过期。先落终局再说话。
        if (error instanceof CollaborationClientError && controller.reportTerminalRejection(error.code)) return;
        // 上传方向单独断掉(流还活着)时也必须置位离线态,否则这种半边分区既没有离线提示,
        // 恢复时也探测不到愈合——恢复计数只会在离线过之后才前进。服务端拒绝(冲突、无权限)
        // 不属于离线:那种处境里网络好得很,重试也不会变好。
        const partitioned = isCollaborationTransportError(error);
        if (partitioned) controller.setCollaborationOffline(true);
        controller.setCollaborationStatus("error");
        // 离线态自带一句通用文案,这里覆盖成送出侧的说法:失败的是上传,不是整条连接。
        controller.setCollaborationMessage(submitFailureMessage(error, partitioned));
        return;
      }
      // 重试预算固定为一次,且只在这里消耗:客户端自己的请求级重试(超时/网络)不叠加
      // 在这一层,两者相乘会把一次冲突放大成一串重投。
      const rebasedOperations = attempt < COLLABORATION_CONFLICT_RETRIES ? await rebaseOnLatestVersion() : null;
      if (outdated()) return;
      if (rebasedOperations === null) {
        controller.setCollaborationStatus("conflict");
        controller.setCollaborationMessage(conflictMessage(attempt));
        return;
      }
      if (rebasedOperations.length === 0) {
        controller.setCollaborationStatus("connected");
        controller.setCollaborationMessage("远端修改已合并，本地没有需要上传的增量");
        return;
      }
      await submit(rebasedOperations, attempt + 1);
    }
  };

  const timer = window.setTimeout(() => {
    const baseline = baselineRef.current;
    if (!baseline || outdated()) return;
    const operations = pendingOperations(baseline);
    if (operations.length === 0) return;
    controller.setCollaborationStatus("syncing");
    controller.setCollaborationMessage(`正在同步 ${operations.length} 项增量修改`);
    void submit(operations, 0);
  }, delayMs);
  return () => window.clearTimeout(timer);
}
