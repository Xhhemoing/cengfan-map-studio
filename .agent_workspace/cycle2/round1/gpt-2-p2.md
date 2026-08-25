MODEL: gpt-5.6-sol-xhigh-fast

# P2 协作入口可发现

- 将 `ProjectMenu` 顶栏触发器的 `aria-label` 从“打开项目菜单”改为“打开项目与协作菜单”，保留可见文字“项目”和既有协作弹层。
- 增加回归测试，确保触发器的无障碍名称明确包含“协作”。
- 未修改 API、服务端、`App.tsx`、支付或 CSS。

## 验收

`npx vitest run src/components/ProjectMenu.identity.test.tsx`

结果：1 个测试文件通过，9 个测试通过。

浏览器验收：在顶栏通过无障碍名称“打开项目与协作菜单”定位入口，打开后可继续使用原有“在线协作”弹层。

未提交、未推送。
