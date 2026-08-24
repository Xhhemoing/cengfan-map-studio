import type { ProjectStoreHealth } from "./project-store";

/** `get()` 没能交出工程的两种成因:库里查不到这一行,或者这次读取本身失败了。 */
export type MissingProjectReason = "not-found" | "read-failed";

export interface MissingProjectObservation {
  reason: MissingProjectReason;
  /** 发起读取那一刻的存储健康度。 */
  healthAtRequest: ProjectStoreHealth;
  /** 读取返回那一刻的存储健康度:降级可能正好发生在读取途中。 */
  health: ProjectStoreHealth;
}

/**
 * `"deleted"` 断言磁盘上确实没有这一行,只有在整个读取过程都跑在持久库上时才能这么说;
 * 其余情形一律是 `"unconfirmed"`——读不到不等于被删掉了。
 */
export type MissingProjectNoticeKind = "deleted" | "unconfirmed";

export interface MissingProjectNotice {
  kind: MissingProjectNoticeKind;
  title: string;
  detail: string;
}

const DELETED_DETAIL = "这个链接指向的项目已经不在本机项目列表中了。可以回到项目列表继续编辑其他项目。";
const READ_FAILED_DETAIL = "读取本机项目数据库失败，现在无法确认这个工程是否还在磁盘上；这不等于它已经被删除。可以稍后重新打开链接，或先回到项目列表。";
const DEGRADED_DURING_READ_DETAIL = "读取途中本机项目数据库掉线并降级为内存模式，现在读不到这个工程；这不等于它被删除了，请不要清理浏览器数据。";
const DEGRADED_DETAIL = "本机数据库已降级为内存模式，无法确认这个工程是否还在磁盘上：它不在本次会话的内存副本里，但这不等于它已经被删除。请不要清理浏览器数据，恢复持久化后再打开一次链接。";

/**
 * 编辑器打不开工程时该说什么。
 * 降级期间 `get()` 读的是空的内存副本,拿它当"已删除"的证据,等于替一个打不开的数据库
 * 宣布用户的工程没了——与崩溃边界里同一类判断保持同一套判据。
 */
export function resolveMissingProjectNotice(observation: MissingProjectObservation): MissingProjectNotice {
  if (observation.reason === "read-failed") {
    return { kind: "unconfirmed", title: "无法读取这个项目", detail: READ_FAILED_DETAIL };
  }
  if (observation.healthAtRequest === "persistent" && observation.health === "persistent") {
    return { kind: "deleted", title: "项目不存在或已删除", detail: DELETED_DETAIL };
  }
  if (observation.healthAtRequest === "persistent") {
    return { kind: "unconfirmed", title: "无法确认这个项目是否还在", detail: DEGRADED_DURING_READ_DETAIL };
  }
  return { kind: "unconfirmed", title: "无法确认这个项目是否还在", detail: DEGRADED_DETAIL };
}
