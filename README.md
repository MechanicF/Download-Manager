# 🚀 Download Manager Pro MAX

一个现代化、轻量级且功能强大的全能下载中枢。基于 Node.js 构建，完美接管 Aria2 与 qBittorrent 集群，并深度打通 OpenList 云盘生态。

## ✨ 核心特性
- 🖥️ **极简交互**: 致敬 AriaNg 的经典布局，支持多条件筛选、自然排序与实时状态监控。
- 🔗 **节点集群**: 支持同时挂载无数个 Aria2 节点与 qBittorrent 引擎，下载任务自由指派。
- ☁️ **云盘直通**: 深度集成 OpenList (AList)，支持浏览网盘、批量顺序重命名，并一键提取直链推送到本地下载。
- 💻 **Web 终端**: 内置基于 xterm.js 的交互式 SSH 终端，支持历史记录与私钥 (.pem) 登录。
- 🔒 **全站鉴权**: 基于 Base64 Token 的无状态安全拦截，绝不暴露私有接口。

## 🛠️ 快速启动
1. `npm install` 安装基础依赖
2. 运行 `./menu.sh` 唤出交互式后台守护面板 (基于 PM2)
3. 默认登录账号：`admin` / 密码：`password`
