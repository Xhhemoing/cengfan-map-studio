# 2026-09-27 调研实施：验证与交付记录

关联：[计划](../plans/2026-09-27-review-implementation.md) / [路线图](../ROADMAP.md) / [PR #53](https://github.com/Xhhemoing/cengfan-map-studio/pull/53)。

## 1. 验证对象与环境

代码基线：`0b1d4e3c3c0d7276b7aafce47cb92056c137c178`。实际功能提交：

| 提交 | 内容 |
|---|---|
| `8c4c0bdd2d9d7527cbd0e79cd2e569f0c64075e7` | PNG 输入冻结、等待超时、尺寸预算、源工程分享提示 |
| `30d6c187c686c41c52e17ac1c3b94297d454e737` | 名单比较更新、事务守卫、UI 接线、文件拆分 |
| `f93e4cf10c651f7d8091330039971e0890c9226d` | 状态提示点击遮挡及手机比较/取消按钮可见性修复 |

本地环境：Linux，Node 22.16.0、npm 10.9.2；真实浏览器为 Playwright 1.57.0 驱动的 Chromium 143.0.7499.4，生产构建启动于 `127.0.0.1:8787`。桌面视口 1440×1000、手机视口 390×844；这不是 iOS Safari 测试。

使用独立临时浏览器 context 与合成名单，未读取真实用户浏览器、凭据或班级数据。仓库与依赖通过只读、短期保留的 CI 制品在隔离环境准备；所有临时 bootstrap 工作流已从最终树移除。没有新增部署流程、没有写 main、没有合并 PR。

## 2. 本轮最终本地检查

按仓库重检查闸门串行运行，四个命令整体退出码为 0；以下是本轮实际值，不是报告中的历史 2477/8/2。

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 通过 | 含既有文件规模检查，未抬高限额 |
| `npm run lint` | 通过 | 0 errors，5 个既有 warnings |
| `npm test` | 通过 | 363 测试文件通过、2 文件跳过；2525 项通过、2 项跳过，共 2527 项；236.32 秒 |
| `npm run build` | 通过 | 保留既有 >500 kB 分块警告，没有提高阈值或隐藏警告 |

既有 Lint warnings：`DataImportConsent.tsx` 1 项 Fast Refresh、`ReferenceCardVisual.tsx` 3 项 Fast Refresh、`data-workspace-workbook.ts` 1 项 effect 依赖。本轮未修改这些文件，不声称 warning 清零。

两个既有跳过项位于 `server/collaboration.test.ts` 与 `src/lib/project-store.bench.test.ts`；未新增 skip、未删除原 StatusStrip 断言。测试输出仍有部分既有 React act 提示；通过不表示这些提示已经治理。

主功能版本较早一轮为 2524 通过、2 跳过；增加 StatusStrip 回归后重新执行完整检查，最终数字以上表为准。首次全量执行曾被工具时间上限中止，随后用独立进程完整执行；该中止不是测试用例失败，不以反复重试代替根因处理。

GitHub 证据：计划提交 `6a44cb78a420ede676835b8515e92a5e4e2fec46` 的 [基线 CI](https://github.com/Xhhemoing/cengfan-map-studio/actions/runs/36301532119) 已通过；主功能提交 `30d6c187c686c41c52e17ac1c3b94297d454e737` 的 [CI #267](https://github.com/Xhhemoing/cengfan-map-studio/actions/runs/36303229618) 已通过 Typecheck/Lint/Test/Production build。最后的 UI/文档提交另触发 CI，**必须看 PR 当前 head 的 checks 与最终验收评论，不能拿前一提交绿灯替代**。

## 3. 失败 → 根因 → 修复 → 复核

### PNG 等待期间内容、尺寸和文件名不一致

新增回归在旧实现下失败：开始导出时标记 `before`，字体 promise 等待期间把活动 SVG 改为 `after`、改尺寸/项目名/选项，旧实现序列化了后来的内容。

根因：异步等待结束后再次读取活动 DOM 和项目名，输入不成套。修复：等待前由 `capturePngExport` 固定 SVG 字符串、尺寸、文件名和输出选项，等待中只消费该对象。重试重新采样；保留 PNG 与其他导出独立的产物/状态代次。

复核：快照回归、预算非法值、字体超时/异常及清理、透明克隆不污染原图；既有 generation 矩阵均通过。真实浏览器另验证 PNG/SVG 下载，不把 mock 字体等待说成真实设备字体压力测试。

### 状态提示遮挡导入入口

真实 Chromium 默认点击「展开导入名单」被状态提示 region 拦截。根因：底部固定提示中的文本节点区域捕获 pointer events。修复：两个仅文本公告 region 设置 `pointerEvents: none`，保留常驻 ARIA status/alert。

新增回归在修复前失败，修复后状态条与外壳定向测试共 26 项通过，原有 5 项状态条测试均保留。浏览器用正常 click 重走导入成功，没有使用 force click 绕过遮挡。

### 手机看不到取消/比较

390 px Chromium 中取消比较不可见。根因：既有小屏通用 CSS 隐藏 `.secondary-button`，误伤新名单流程。修复：仅在导入候选和差异预览内恢复 secondary action 显示，不修改顶栏设计。

复核：真实手机视口点击取消、确认预览消失、重新进入比较、重新匹配均成功；预览 clientWidth/scrollWidth 都为 368 px，无该区域水平溢出。

## 4. 真实浏览器验收

机器可读结果：[2026-09-27-review-browser-result.json](2026-09-27-review-browser-result.json)。复跑脚本：[review-browser-check.py](review-browser-check.py)。9 项均通过，`page_errors` 为空。

| 检查 | 实际断言 |
|---|---|
| 新名单 | 通过差异预览添加 3 个合成学生 |
| 重复导入 | 相同名单无重复，ID 与隐藏状态不变 |
| 手机交互 | 390 px 取消、退出预览、再次比较可点击 |
| 差量更新 | 显式匹配只改 1 人，未出现的 2 人保留，ID 不变 |
| 历史 | 一次撤销还原旧城市，一次重做恢复新城市 |
| 实际下载 | SVG/PNG 下载无失败；SVG 不含被隐藏的合成姓名；PNG 签名与 1500×1000 尺寸正确 |
| 源工程 | 不包含资源仍保留全部 3 人、原 ID 和隐藏事实 |
| 保存恢复 | 返回列表后重新打开并刷新，名单修改仍在；这是既有保存行为验收 |
| 工程往返 | 重新导入 .cengfan 并打开，3 人、ID、隐藏状态和修改后的城市保持 |

SVG 的上述合成样例检查不等于已实现公开投影，也不保证任意自由文本或素材已经去除个人信息。

## 5. 复跑方法

先在隔离开发机或临时环境准备项目依赖，按顺序执行：

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
HOST=127.0.0.1 PORT=8787 npm run start
```

另一个终端使用临时 Python 环境；浏览器脚本不作为 Node 生产依赖：

```sh
python -m venv /tmp/cengfan-review-venv
/tmp/cengfan-review-venv/bin/pip install playwright==1.57.0
/tmp/cengfan-review-venv/bin/python -m playwright install chromium
/tmp/cengfan-review-venv/bin/python docs/qa/review-browser-check.py \
  --url http://127.0.0.1:8787 --output /tmp/cengfan-review-results
```

Linux 缺系统库时按 Playwright 的安装提示补齐。脚本拒绝非 localhost 测试地址；只在测试 context 内创建合成项目。默认结果目录会有截图、JSON 和下载样本，不提交这些产物或浏览器/字体/依赖归档。需要真实桌面目视检查时，可使用相同流程手动操作；本次浏览器由自动化驱动。

## 6. 边界、合并与回滚

本轮未完成：独立 RenderPlan/同版本字体布局资源屏障、稳定源 ID 修订表、自动保存改造、白名单公开投影、确认中心、局部 solver、任务化 AI、在线本人确认、多规格成套交付。

未执行：Safari、Firefox、真实 iOS/Android、低内存大图压力、生产部署权限/反代/房间恢复、至少 5 名真实制作者验证。不得将本次结果推广为所有设备已通过。

合并前：维护者审查匹配规则与完整名单分享提示；PR 最新 head 的现有 CI 全通过；与并行顶栏 PR 的合并顺序确认；发布仍按 tag，不自动上线。PR 保留 Draft 等待维护者评审。

回滚：三个功能提交均无格式/数据库迁移，可按导入、导出、UI 切片 revert。文件规模阈值回滚须跟对应文件一起回滚；不删除学生、不改写主干历史。后续涉及持久确认凭据的迁移需单独回滚设计。
