# 🚀 Download Manager Pro (X Engine)

![Version](https://img.shields.io/badge/version-v2.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D%2014.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

一个专为极客与重度资源玩家打造的**全能下载与云盘管理面板**。采用前后端彻底分离架构，底层由自研的“双向同步引擎 (Bidirectional Sync)”驱动，将离线下载与云盘管理推向极致的稳定与流畅。

---

## ✨ 核心特性 (v2.0.0)

### 🎨 极致的现代化 UI
* **原生虚拟 DOM 差分渲染**：彻底告别列表刷新时的闪烁与跳动，进度条如丝般顺滑。
* **极简双主题**：内置 Light / Dark 模式，支持一键无缝切换，并自动记忆。
* **全平台响应式**：完美适配 PC 宽屏与手机移动端。

### 🛸 强大的物理引擎接管
* **qBittorrent (v2 API)**：严格遵循 v2 鉴权标准，支持高级参数可视化编辑、暂停/唤醒、文件详情直透。
* **Aria2 多节点集群**：支持挂载多个 Aria2 RPC 节点，自动负载均衡，支持节点配置热重载。
* **多功能任务分发**：支持批量 URL 投递、磁力链接解析，以及 **`.torrent` 本地种子文件直接上传**。

### 🔄 智能双向状态同步
* **野生任务捕获**：自动接管 qBit RSS 订阅自动下载的任务，实时同步至前端面板。
* **僵尸记录销毁**：底层物理引擎中被删除的任务，面板数据库会进行精确的物理抹除，拒绝 `removed` 幽灵状态。

### ☁️ 云盘与 OpenList 集成
* **云端直挂**：支持多账号配置，一键将云盘文件发送至本地 Aria2/qBit 下载集群。
* **智能独立排序**：每个文件夹独立记忆专属的排序方式（例如A目录按时间，B目录按大小），持久化缓存。
* **批量重命名引擎**：支持正则表达式替换、递增数字序列生成等高级批量重命名操作。

---

## 🛠️ 项目架构

项目去除了臃肿的框架库依赖，追求极致的轻量与性能：
- **前端**：纯 HTML + CSS + 原生 JS (无构建工具，即开即改)。
- **后端**：Node.js + Express + WebSocket。
- **数据库**：Better-SQLite3 (极致轻量的本地文件数据库)。
- **持久化**：使用 PM2 进行进程守护。

### 📂 核心目录结构
```text
/opt/Download-Manager/
├── app.js               # 🚀 X Engine 后端核心与 WebSocket 服务入口
├── public/              # 🎨 纯净前端静态资源目录
│   └── index.html       # 核心 UI 视图文件 (包含所有交互逻辑)
├── config.json          # 全局引擎与面板配置文件
├── qbit_cookie.txt      # qBittorrent 鉴权缓存
├── downloads.db         # SQLite 任务与状态数据库
└── package.json         # Node 依赖清单
🚀 快速部署与启动
确保你的服务器已安装 Node.js 和 pm2。

1. 安装依赖

Bash
npm install
2. 启动服务

Bash
pm2 start app.js --name DownloadManager
pm2 save
3. 访问面板
打开浏览器访问：http://你的服务器IP:1111

默认账号：admin

默认密码：password
(首次登录后，请立即在面板的【全局设置】中修改密码并保存)

💡 常见问题与排错 (FAQ)
Q: qBittorrent 节点一直显示离线？

请进入原版 qBittorrent 的 WebUI 设置 -> 验证 (Authentication)，取消勾选 启用跨站请求伪造(CSRF)保护。

Q: 如何修改端口？

请编辑 app.js，修改顶部的 PORT (HTTP 端口) 和 WS_PORT (WebSocket 端口) 变量，并重启 PM2 服务。

Built with ❤️ for High-Speed Downloaders.
