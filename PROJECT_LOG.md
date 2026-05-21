# This is Grade 项目日志

日期：2026-05-21

## 项目目标

最初需求是做一个 WebTESS 成绩 dashboard：

- 登录 https://harts.systems/webtess/parent.jsp 抓取各科成绩。
- 可视化显示各科成绩。
- 可以选择四科计算四科均分。
- 均分规则：每科先四舍五入到十分位，再对四科求平均，最后平均值四舍五入。

后续需求逐步扩展为：

- 展开每门课的小成绩明细。
- 根据小成绩的得分百分比、权重和栏目推算成绩结构。
- 做成绩预测：输入某个栏目未来成绩，查看该科和四科均分变化。
- 打包为 Windows 可执行版本。
- 部署成跨设备网站，让 iPad、Mac、Windows 都能使用。
- 迁移到 Cloudflare Pages + Pages Functions。
- 改善浏览器账号密码自动填充与 Enter 提交体验。

## 主要实现过程

### 1. 本地 Dashboard

先从空项目开始搭建本地版：

- 创建 `server.mjs` 作为本地 HTTP 服务。
- 创建 `public/index.html`、`public/app.js`、`public/styles.css` 作为 dashboard 前端。
- 创建 `scripts/scrape-grades.mjs` 作为抓取器。
- 初始支持示例成绩、柱状图、四科选择和均分计算。

本地运行时发现系统没有 npm，也没有全局 Node，于是加入了使用 Codex 自带 Node 的启动脚本，并补了 `.bat` 启动器，绕过 PowerShell 脚本执行策略。

### 2. WebTESS 抓取逻辑修正

一开始尝试用浏览器自动登录，但遇到：

- Playwright Chromium 缺失。
- `locator.fill` 超时。
- 登录框定位不稳定。

后来根据用户提供的旧版 Python monitor 脚本，确认 WebTESS 可以通过接口方式抓取：

1. POST `/webtess/login` 登录。
2. GET `/webtess/parent.jsp` 获取课程按钮。
3. 从 `getGradebookByStudent(...)` 中提取课程参数。
4. POST `/webtess/gradebook` 获取每门课成绩。

这样去掉了对浏览器自动填表的依赖，抓取稳定性明显提高。

### 3. 解析真实成绩结构

调试过程中发现 gradebook 返回不是简单 XML，而是类似：

`课程代码 课程名 某个ID Main spreadsheet 总分 ... 小成绩数据 ...`

于是解析器改成：

- 从 `Main spreadsheet` 后读取科目总分。
- 支持超过 100 的成绩，例如 100.40。
- 用 gradebook 返回的真实课程名覆盖 parent.jsp 中可能错位的 subject。
- 解析小成绩项：项目标题、得分、可能满分、得分百分比、项目权重、栏目 ID。

效果：dashboard 能显示每门课总分，也能展开小成绩明细。

### 4. 成绩预测功能

新增预测面板：

- 选择科目。
- 选择栏目。
- 输入一个假设的新成绩百分比。
- 计算该科预测新分数。
- 如果该科在已选四科中，同时计算四科均分变化。

当前预测模型：

- 使用 WebTESS 返回的小成绩项权重估算栏目权重。
- 假设新增成绩会加入同一栏目，并与该栏目已有项目共同平均分配栏目影响。
- 这是基于已有返回数据的近似模型，不保证完全等同学校后台真实算法，但能给出有参考价值的趋势预测。

### 5. Windows 分发包

为了让别人不用安装 Node，也能运行本地版，做了 Windows 分发包：

- 清理个人信息、真实成绩、debug 文件、本机路径。
- 打包 Node 运行时。
- 生成 `WebTESS-Dashboard.exe` 启动器。
- 生成 zip 和自解压 exe。

扫描确认没有包含：账号、密码、真实成绩、姓名、学号、生日、本机路径。

### 6. Cloudflare 部署版

为了支持 iPad、Mac、Windows，项目改为网站版：

- 前端部署到 Cloudflare Pages。
- 后端改成 Pages Functions。
- `/api/scrape` 在 Cloudflare Function 中临时登录 WebTESS 并返回成绩。
- 不保存 WebTESS 密码。
- 不接 Supabase，第一版不保存历史记录。

创建了 `cloudflare-pages` 部署目录，包含：

- `public/` 前端文件。
- `functions/api/scrape.js` 抓取 API。
- `functions/api/grades.js` 示例成绩 API。
- `functions/_lib/webtess.js` WebTESS 抓取与解析逻辑。
- `wrangler.toml` 和 `package.json`。

用户将代码上传 GitHub 后，通过 Cloudflare Pages 部署成功，网站正式上线。

### 7. 稳定性与体验改进

上线后发现两个问题：

1. 偶尔显示 `Logged in, but no gradebook courses were found`。
2. 浏览器不自动填充 WebTESS 邮箱密码。

解决措施：

- 后端加入最多 3 次登录/抓取重试。
- 请求加上更完整的浏览器请求头、Referer、Origin、Cache-Control 和 cache-bust 参数。
- 表单补充 `name`、`autocomplete`、`action` 等属性。
- 密码框按 Enter 会直接触发抓取。
- 抓取成功后不立即清空密码框，让浏览器有机会保存密码。
- 尝试加入 Credential Management API，请求浏览器为当前 `pages.dev` 域名保存凭据。

需要说明：浏览器不会把 `harts.systems` 保存的密码自动填到 `pages.dev`，这是域名隔离的安全机制。因此自动填充只能尽量优化，不能保证 Edge/Safari 都完全自动。

## 当前效果

目前已经实现：

- 网站可在线访问。
- 支持 iPad、Mac、Windows 浏览器。
- 可以实时抓取 WebTESS 成绩。
- 可以展示各科成绩图表。
- 可以选择四科并计算均分。
- 可以展开每科小成绩。
- 可以做未来成绩预测。
- 可以通过 Enter 快速提交抓取。
- Cloudflare 部署成功。

## 后续可升级方向

- 接入 Supabase 保存成绩历史。
- 自动检测新成绩并通知。
- 做用户登录系统。
- 添加成绩变化趋势图。
- 添加自定义域名。
- 用 Figma 重新设计 UI。
- 添加邮件、Discord、Telegram、Bark、Webhook 等通知渠道。

## 隐私与安全原则

- 不在代码中写入 WebTESS 账号密码。
- 不把真实成绩或 debug 原始页面上传到 GitHub。
- Cloudflare Function 只在请求期间临时使用密码。
- 第一版不保存历史成绩，降低隐私风险。
- 如果未来做自动通知，需要重新设计凭据保存和加密方案。
