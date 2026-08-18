# Gitee 镜像清单

国内开发者与部分班主任打不开 GitHub。镜像不是可选项。

---

## 1. 建仓（一次性）

1. 打开 https://gitee.com/projects/new
2. 选择「导入仓库」→ GitHub URL：`https://github.com/Xhhemoing/cengfan-map-studio.git`
3. 可见性：公开
4. 勾选「GitHub 仓库更新时自动同步」（若账号已绑 GitHub）
5. 仓库介绍：`毕业班去向地图编辑器：导入 Excel 出图。AGPL-3.0 开源。`

没有自动同步时，本机增加远端：

```bash
git remote add gitee git@gitee.com:<用户名>/cengfan-map-studio.git
git push gitee main
```

每周五 Changelog 之后执行一次 `git push gitee main --tags`。

---

## 2. README 徽章（有 Gitee 地址后贴到 README 顶部）

```markdown
[![GitHub](https://img.shields.io/github/stars/Xhhemoing/cengfan-map-studio?style=social)](https://github.com/Xhhemoing/cengfan-map-studio)
[![Gitee](https://gitee.com/<用户名>/cengfan-map-studio/badge/star.svg)](https://gitee.com/<用户名>/cengfan-map-studio)
```

克隆说明写成：

```bash
# 国内推荐
git clone https://gitee.com/<用户名>/cengfan-map-studio.git
# 备选
git clone https://github.com/Xhhemoing/cengfan-map-studio.git
```

---

## 3. 开源中国

1. https://www.oschina.net/project/create
2. 名称：蹭饭图
3. 开发语言：JavaScript / TypeScript
4. 授权：AGPL-3.0
5. 源码：Gitee 优先，GitHub 备选
6. 登记后在「资讯」发一条进度，不要天天发

---

## 4. 不要做

- 不要把 Gitee 当唯一真相源；代码审查与 Issue 仍以 GitHub 为准（模板在 `.github/`）。
- 若 Gitee Issue 有人提问：复制到 GitHub 并回复「已转到 #N」，避免两处各说各话。
