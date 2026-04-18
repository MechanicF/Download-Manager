# 🚀 Download Manager Pro

![Docker Pulls](https://img.shields.io/docker/pulls/mechanicf/download-manager.svg?style=flat-square&color=blue)
![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg?style=flat-square)


基于 Node.js 和 SQLite 构建的本地下载管理面板，支持 Aria2 节点管理及多源检索对接。

## 核心功能

- **多节点管理**：支持接管并管理多个 Aria2 下载节点。
- **聚合检索**：内置 Openlist (盘搜) 与 MoviePilot 接口对接。
- **实时同步**：基于 WebSocket 协议，实时推送下载进度与后端状态。
- **轻量后端**：使用 `better-sqlite3` (WAL 模式) 进行本地数据存储，无外部数据库依赖。
- **容器化**：提供基于 Alpine 构建的官方 Docker 镜像。

## Docker 部署指南

### 1. 准备目录与挂载文件
创建工作目录并初始化空文件，避免 Docker 将其错误挂载为目录：
```bash
mkdir -p /opt/dl-manager && cd /opt/dl-manager
touch config.json downloads.db
2. 配置 docker-compose.yml
在同目录下创建 docker-compose.yml 文件：

YAML
version: '3.8'

services:
  download-manager:
    image: mechanicf/download-manager:latest
    container_name: download-manager
    restart: always
    ports:
      - "1111:1111"    # Web API 端口
      - "28080:28080"  # WebSocket 端口
    volumes:
      - ./config.json:/app/config.json
      - ./downloads.db:/app/downloads.db
      - /root/downloads:/downloads  # 请修改为宿主机真实的下载存储路径
    environment:
      - NODE_ENV=production
      - TZ=Asia/Shanghai
3. 启动服务
Bash
docker compose up -d
启动后，访问 http://服务器IP:1111 即可进入面板。

初始访问凭据：
首次启动时，若检测到 config.json 为空，系统会自动生成默认配置。

账号：admin

密码：password
（请在登录后及时修改 config.json 中的鉴权信息并重启容器）

Nginx 反向代理配置
如需配置域名访问，请确保在反向代理中正确转发 WebSocket 通讯。参考配置如下：

Nginx
# Web API 代理
location / {
    proxy_pass [http://127.0.0.1:1111](http://127.0.0.1:1111);
    proxy_set_header Host $host;
}

# WebSocket 代理 (根据实际前端配置的路径进行映射)
location /ws {
    proxy_pass [http://127.0.0.1:28080](http://127.0.0.1:28080);
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
}
