# 项目工作台设计(2026-08-07)

## 背景与目标

当前产品打开网站即进入单项目编辑器,项目只存在一个固定槽位(IndexedDB 键 `"current"` + 服务器 `workspace.json` 单文件),没有多项目、没有项目入口、没有展示分流;`/admin` 访问统计面板对真实用户无价值。

目标:改造为"项目管理工作台"产品形态——打开网站先看到项目列表,多项目各自独立存储,支持新建/复制/重命名/删除/导出/导入,删除 admin 面板。

## 已确认决策

| 项 | 决定 |
|---|---|
| 首页形态 | 项目列表(卡片工作台) |
| 存储方案 | 方案 2:纯浏览器 IndexedDB 多项目 |
| 项目操作 | B:新建、打开、重命名、删除、复制、导出/导入工程包 |
| 保存方式 | 自动保存 + 左上角"返回列表"按钮 |
| 路由 | hash:`#/` 列表、`#/project/<id>` 编辑页 |
| 默认样例 | 用现有 `sampleStudents`(12 名虚构学生)建一个"示例：2026届毕业去向"项目 |
| Admin | 删除(`Admin.tsx`、`/admin`、`/api/admin/visits`、visits 写入、ADMIN_* 配置) |

## 架构

```
打开网站 → #/ 项目列表页
             ├─ 点击卡片 → #/project/<id> 编辑页
             ├─ [+ 新建项目] → 创建空白 → 编辑页
             └─ 导入工程包 → 创建项目 → 编辑页(或回列表)
```

三种视图由同一 App 内路由状态分发(`hashchange` 驱动)。

## 数据模型

IndexedDB `cengfan-map-studio` / `workspace` 库,键由固定 `"current"` 变为项目 ID:

```
{ id: "proj-xxx", name: "高三3班", createdAt, updatedAt, projectPackage: ProjectPackage }
```

- 列表页:遍历全部记录 → 卡片
- 编辑页:按 id 读写单条
- 新建:插入空项目;复制:深拷贝新 ID;重命名/删除:直改/直删
- 服务器 `workspace.json` 与 `/api/workspace` 保留不删(额外备份通道),不再作为唯一数据源

## 工作台 UI

- 头部:品牌名 + "新建项目"
- 卡片:项目名、学生数、更新时间、地图缩略预览
- 卡片"⋯"菜单:重命名、复制、导出工程包、删除(带确认)
- 默认首个项目:"示例：2026届毕业去向"(sampleStudents 12 人)

## 编辑页改动

- 左上角"← 返回列表":自动保存后回 `#/`
- 自动保存目标改为地址栏项目 ID(防抖节奏、草稿镜像复用现状)
- 按 ID 加载:存在→渲染;不存在→"项目不存在"+ 返回按钮
- 编辑器内部功能(数据导入、AI、协作、导出)不动

## 删除 Admin

- 前端:`src/Admin.tsx`、`src/admin.css`、`main.tsx` 中 `/admin` 分支
- 服务端:`/api/admin/visits`、visits.json 写入、`hasAdminAccess`、`ADMIN_USERNAME/PASSWORD` 配置
- `.env.example`、部署文档同步;探针 `/api/live|ready|health` 保留

## 测试与验收

- 新增:`project-store` 增删改查/复制/样例、工作台组件、hash 路由、失效 ID
- 修改:`App.test.tsx` 等"默认打开编辑器"→"默认打开列表"
- 手动:`npm run dev` 走通 新建→编辑→返回→重命名→复制→导出→导入→删除
- 全量 `npm test` + `npm run build` 通过后部署
