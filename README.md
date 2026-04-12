# Download Manager Pro

一款轻量级、响应式的 Aria2 与云盘协同下载管理面板。

## ✨ 核心功能

- **多节点 Aria2 支持**：允许绑定多个 Aria2 RPC 节点，自动隔离多节点环境下的任务冲突，侧边栏实时汇总全局网速与流量统计。
- **异步任务队列**：在顶部导航栏提供全局的“推送”与“删除”异步进度条。支持多批次任务无缝排队，不阻塞当前页面的其他操作。
- **高级参数配置**：提供可视化的 Aria2 核心参数表单，同时保留底层的 JSON 源码编辑模式，修改后支持服务热重载。
- **移动端深度适配**：无第三方 UI 库依赖，基于原生 CSS 弹性布局，全方位适配移动端屏幕尺寸。
- **OpenList 云盘集成**：支持多账号云盘挂载。可直接在面板内进行文件浏览、批量重命名、彻底删除，以及抓取直链发送至指定的 Aria2 下载节点。
- **CLI 控制台**：自带全局终端管理脚本 (`dm`)，方便进行服务的状态监控、启停、日志排查与版本更新。

---

## 🚀 快速部署 (推荐)

推荐使用一键安装脚本。该脚本会自动检测环境、安装 Node.js、配置 PM2 进程守护以及设置开机自启。

请在具有 `root` 权限的 Linux 终端执行：

```bash
bash <(curl -sL [https://raw.githubusercontent.com/MechanicF/Download-Manager/main/install.sh](https://raw.githubusercontent.com/MechanicF/Download-Manager/main/install.sh))
🛠️ CLI 控制台用法
安装完成后，可在服务器终端任意路径输入以下命令唤出交互式管理菜单：

Bash
dm
控制台包含以下功能：

启动面板服务

停止面板服务

重启面板服务

查看实时运行日志 (报错排查)

设置开机自动启动

一键更新至最新版本 (拉取 Git 最新代码)

彻底卸载本面板

📦 手动安装步骤
如果您希望手动安装，请确保系统已安装 Node.js (v16+) 和 PM2。

Bash
# 1. 克隆代码
cd /opt
git clone [https://github.com/MechanicF/Download-Manager.git](https://github.com/MechanicF/Download-Manager.git)
cd Download-Manager

# 2. 安装依赖
npm install

# 3. 注册全局控制台命令 (可选)
chmod +x manager.sh
ln -sf /opt/Download-Manager/manager.sh /usr/local/bin/dm

# 4. 启动服务并配置守护
pm2 start app.js --name DownloadManager
pm2 save
pm2 startup
🔐 初始访问
默认访问地址：http://服务器IP:28080

默认登录账号：admin

默认登录密码：请在首次登录后于【全局设置】中自行修改，如遗忘请查看后端日志记录。

License: MIT
