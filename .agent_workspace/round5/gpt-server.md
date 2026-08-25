# R5-gpt-server

## 结果

- `COLLAB_STORE_DIR` 非空时，每个协作房间以原子替换的 JSON 快照保存到指定目录；新建 store / server 进程会恢复房间、成员权限、邀请、事务去重和增量历史。
- 未设置 `COLLAB_STORE_DIR` 时不创建目录或文件，继续使用原有纯内存行为。
- 落盘的访问凭证和邀请凭证仅保存 SHA-256 哈希。修正了 `publicParticipant` 对富对象做展开而把 owner 原始 access token 留在内存记录中的问题。
- 房间 TTL 清理会同时删除对应快照；`.gitignore` 已包含 `.data/`。
- 未增加账号、数据库或支付逻辑；`server/index.ts` 仍为 400 行。

## failure → cause → fix → recheck

1. 首次定向测试 32/32 failed，`tsc` 报 8 个 `persistRoom` 未定义：持久化调用点先于共享工作树中的 helper/import 落地。
2. 补齐快照 store 初始化、恢复与 `persistRoom` helper 后复查，31/32 passed；唯一失败显示快照中仍有明文 `owner-access`。
3. 根因是 `publicParticipant(access)` 的对象展开在运行时保留了类型之外的 `accessToken`；改成只投影 `id/displayName/role`，并在快照写入和读取校验两侧拒绝/剥离 access token。
4. 定向复查：`server/collaboration.test.ts` 32/32 passed，Node `tsc` 通过。
5. 最终复查：
   - `npx vitest run server`：19 files、220 tests 全部通过。
   - `npx tsc --noEmit -p tsconfig.node.json`：通过。
   - owned-path `git diff --check`：通过。

## 验收

设置 `COLLAB_STORE_DIR=.data/rooms` 后创建并更新房间，重启进程后可用原 access token 获取房间、用重启前签发的邀请加入；不设置该变量时无房间文件。按要求未创建 commit。

## 剩余风险

- 文件快照仅面向单进程本地/开发耐久性，没有跨进程锁、CAS 或共享一致性，因此仍不支持多实例安全并发写入。
