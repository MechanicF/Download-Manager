# Download Manager Pro

一个轻量、高性能的下载管理面板，支持多节点 Aria2 集群管理与云盘（OpenList）集成。本项目采用 Node.js 作为后端服务，前端基于原生原生技术栈（HTML/CSS/JS）构建，具有极低的资源占用和极佳的响应速度。

## ✨ 核心特性

- **多节点 Aria2 集群管理**
  - 支持绑定并管理多个独立的 Aria2 RPC 节点。
  - 提供可视化与 JSON 源码双模式的引擎参数调优界面。
- **云盘深度集成 (OpenList)**
  - 支持绑定云盘 API，直接在面板内浏览云端目录。
  - 支持将云端文件批量推送至指定的 Aria2 节点进行下载，内置推入/删除队列状态机。
- **高级文件操作**
  - 列表默认采用自然数字排序算法（如 `1, 2, 10` 而非 `1, 10, 2`）。
  - 支持批量重命名，提供“查找替换”与“序列化”模式，并附带实时变更预览窗口。
- **高性能与高可靠性**
  - **无感刷新**：前端采用定制的 DOM Diff 局部热更新算法，结合 WebSocket 实时通信，页面状态每秒刷新亦无任何闪烁。
  - **数据一致性**：底层优化了与 Aria2 的同步时序，采用独立组合键（UID）防止多节点 GID 冲突，彻底解决任务删除不彻底（诈尸）的隐患。
  - **大文件支持**：优化后端负载上限，支持超大 BT 种子（Torrent）文件解析与上传。
- **现代化 UI 与体验**
  - 响应式布局，完美兼容桌面端与移动端。
  - 原生支持深色/浅色（Dark/Light）主题切换。
  - 内置极客开发者工具（Debug Panel），实时监控 API 瀑布流与通信状态。

## 🛠️ 技术栈

- **前端**: HTML5 / CSS3 / Vanilla JavaScript (无外部重型框架依赖)
- **后端**: Node.js / Express (API路由) / ws (WebSocket) / axios / better-sqlite3 (持久化存储)

## 📦 安装与部署

**环境要求**: Node.js (v16 或以上版本)

1. **克隆项目到本地**
   ```bash
   git clone [https://github.com/你的用户名/你的仓库名.git](https://github.com/你的用户名/你的仓库名.git)
   cd 你的仓库名
安装依赖

Bash
npm install express cors axios ws better-sqlite3
启动服务

Bash
node app.js
服务默认运行在 http://服务器IP:1111，WebSocket 端口为 28080。建议使用 pm2 等进程守护工具进行生产环境部署。

⚙️ 初始配置
首次访问面板，默认账号密码为：

账号: admin

密码: password

登录后，请立即前往侧边栏的 “全局设置” 中修改登录密码，并配置你的 Aria2 RPC 节点和云盘信息。

📝 目录结构简述
Plaintext
.
├── app.js               # Node.js 后端主程序 (API, 数据库, 同步逻辑)
├── public/
│   └── index.html       # 前端 UI 与核心业务逻辑
├── config.json          # 系统配置文件 (账号、节点、云盘信息)
└── downloads.db         # SQLite 数据库文件 (运行时自动生成)
📄 开源协议
本项目采用 MIT License 开源协议。