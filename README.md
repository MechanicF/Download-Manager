# 🚀 Download Manager Pro

![Docker Pulls](https://img.shields.io/docker/pulls/mechanicf/download-manager.svg?style=flat-square&color=blue)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg?style=flat-square)

这是一个专为极客、NAS 玩家和自托管爱好者打造的**极轻量级、零臃肿**的现代化全能下载与聚合检索面板。

我们拒绝“企业级”的过度设计（没有沉重的 JWT、没有拖泥带水的 ORM 框架）。整个后端基于原生 Node.js 极简架构，配合 `better-sqlite3` 预编译引擎与纯粹的 WebSocket 通讯，在极低的内存占用下，实现了匹敌大型商业系统的并发吞吐量与实时响应速度。

## ✨ 核心特性

- ⚡️ **极致轻量**：极简代码架构，Alpine 环境打包，专为低配置机器（如树莓派、入门级 NAS）优化。
- 🟢 **毫秒级实时通讯**：底层采用纯粹的 WebSocket 长连接池，无视 HTTP 短轮询的延迟，下载进度、节点状态做到真正的肉眼级实时同步。
- 🔗 **多节点引擎支持**：原生无缝接管 **Aria2** 节点，支持配置多路下载源。
- 🔍 **聚合检索生态**：内置 **盘搜 (Openlist)** 与 **MoviePilot** 接口深度对接，实现“搜、推、下、存”一站式闭环。
- 💾 **极速本地存储**：强制启用 SQLite `WAL` 模式与预编译 SQL (Prepared Statements)，数据读写稳如磐石。

---

## 🐳 Docker 一键极速部署 (推荐)

我们提供了官方的 Docker 镜像，只需几行命令，即可在任何 Linux/NAS 系统上无脑拉起面板。

### 1. 准备环境
在你的服务器上创建一个工作目录，并**提前创建好空文件**（防止 Docker 误将其挂载为目录）：

```bash
mkdir -p /opt/dl-manager && cd /opt/dl-manager
touch config.json downloads.db
2. 创建 docker-compose.yml
在同一目录下创建 docker-compose.yml 文件并填入以下内容：

YAML
version: '3.8'

services:
  download-manager:
    image: mechanicf/download-manager:latest
    container_name: download-manager
    restart: always
    ports:
      - "1111:1111"    # Web 面板端口
      - "28080:28080"  # WebSocket 实时通讯端口
    volumes:
      - ./config.json:/app/config.json
      - ./downloads.db:/app/downloads.db
      - /root/downloads:/downloads  # 请将前面替换为你宿主机的真实下载路径
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
3. 拉起服务
Bash
docker compose up -d
🎉 搞定！ 现在打开浏览器访问 http://你的服务器IP:1111 即可进入面板。

💡 初始账号密码：
首次启动时，系统会自动在你的 config.json 中生成默认凭据。

默认账号：admin

默认密码：password
(登录后请务必在本地修改 config.json 并重启容器以保障安全)

🛠️ 进阶配置与反向代理
如果你希望使用域名访问（配合 Nginx 或 Cloudflare Tunnel），请注意处理好 WebSocket 的转发。

Nginx 代理参考配置：

Nginx
location / {
    proxy_pass [http://127.0.0.1:1111](http://127.0.0.1:1111);
    proxy_set_header Host $host;
}

# 如果你将 WebSocket 与主域名同端口转发，请单独处理 Upgrade 头
location /ws {
    proxy_pass [http://127.0.0.1:28080](http://127.0.0.1:28080);
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
🛡️ 安全与隐私理念
本项目坚持**“自托管、零遥测、全本地”**的理念。
你的所有搜索记录、网盘 Token、下载路径和密码均仅加密存储于你本地挂载的 config.json 与 SQLite 数据库中。面板没有任何外部流量回传，请放心食用。
