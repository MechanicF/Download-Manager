Download Manager Pro
一个轻量、高效的自托管下载管理面板。
基于 Node.js、SQLite 和原生 JavaScript 构建，无复杂前端框架依赖。系统原生整合了 Aria2 集群管理、OpenList 云盘文件挂载、聚合盘搜以及基于 MoviePilot 的智能重命名功能。

✨ 核心功能
1. Aria2 集群与任务管理
多节点支持：可同时绑定和管理多个 Aria2 RPC 节点。

双模配置：提供可视化表单与 JSON 源码两种配置模式，支持 Aria2 底层参数（并发数、分片大小等）热重载。

深度清理：支持强制结束下载任务，并同步清理底层残留文件。

2. 聚合搜索与云端文件管理
OpenList 集成：支持直接在面板内浏览、管理云端网盘文件。

全网盘搜：内置聚合搜索接口，支持按网盘类型（如 115、夸克、阿里云盘等）进行一键过滤和筛选。

异步推送：支持将云端文件批量推送至本地 Aria2 下载，配备悬浮进度条，操作全程不阻塞界面。

3. 文件重命名体系
AI 智能识别：接入 MoviePilot API，可将杂乱的采集源文件名一键规范化为标准剧集格式。

批量操作：支持正则替换、递增序列化等多种批量重命名规则。

4. 统计与界面体验
持久化数据统计：采用 SQLite 记录全局历史流量（global_stats）。任务即使从 Aria2 中删除，总下载量/上传量依然会永久保留。

响应式 UI：纯原生 CSS 开发，适配 PC 与移动端。

动态配置面板：全局设置支持“内置服务”与“自定义私有节点”的无缝切换，界面整洁直观。

🛠️ 技术栈
前端: HTML5, CSS3, Vanilla JavaScript, WebSocket

后端: Node.js, Express, Axios

数据库: SQLite (基于 better-sqlite3开启 WAL 模式)

📦 部署指南
1. 环境依赖
请确保服务器已安装 Node.js (建议 v18 及以上版本) 与 PM2。

2. 安装步骤
Bash
# 获取源码
git clone https://github.com/YourName/Download-Manager.git
cd Download-Manager

# 安装依赖
npm install express cors axios ws better-sqlite3
3. 启动服务
使用 PM2 守护进程并在后台运行服务：

Bash
pm2 start app.js --name DownloadManager
注：Web 面板默认运行在 1111 端口，WebSocket 通讯运行在 28080 端口。

⚙️ 初始设置
访问面板：在浏览器中访问 http://<服务器IP>:1111。

默认登录凭证：

账号：admin

密码：password

安全建议：首次登录后，请前往**【全局设置】**修改默认登录密码。

服务配置：在设置页面绑定你的 Aria2 RPC 地址（需包含完整 URL 与端口）。MoviePilot 与盘搜功能已配置默认内置接口，如需使用私有服务，可在设置中切换并填写对应 API。
