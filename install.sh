#!/bin/bash

# 颜色定义
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${GREEN}==================================================${RESET}"
echo -e "${GREEN}      🚀 Download Manager 一键安装部署脚本        ${RESET}"
echo -e "${GREEN}==================================================${RESET}"

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[错误] 请使用 root 用户运行此脚本！(可以使用 sudo -i 切换)${RESET}"
  exit 1
fi

# 1. 端口自定义
read -p "👉 请设置 Web 面板访问端口 [默认: 1111]: " HTTP_PORT
HTTP_PORT=${HTTP_PORT:-1111}

read -p "👉 请设置 WebSocket 通讯端口 [默认: 28080]: " WS_PORT
WS_PORT=${WS_PORT:-28080}

echo -e "\n${YELLOW}▶ 确认配置：面板端口 [${HTTP_PORT}] | WS端口 [${WS_PORT}]${RESET}\n"
sleep 2

# 2. 安装基础环境
echo -e "${YELLOW}>> 正在检查并安装基础组件 (Node.js / Git / PM2)...${RESET}"
if ! command -v git &> /dev/null; then
    apt-get update && apt-get install -y git || yum install -y git
fi

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs || yum install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# 3. 部署项目
INSTALL_DIR="/opt/Download-Manager"
echo -e "\n${YELLOW}>> 开始克隆项目到 ${INSTALL_DIR}...${RESET}"

# 如果目录已存在则清理旧进程
if [ -d "$INSTALL_DIR" ]; then
    pm2 delete DownloadManager &>/dev/null
    rm -rf "$INSTALL_DIR"
fi

git clone https://github.com/MechanicF/Download-Manager.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# 4. 替换自定义端口
echo -e "${YELLOW}>> 正在配置自定义端口...${RESET}"
sed -i "s/const PORT = 1111;/const PORT = ${HTTP_PORT};/g" app.js
sed -i "s/const WS_PORT = 28080;/const WS_PORT = ${WS_PORT};/g" app.js
sed -i "s/:28080/:${WS_PORT}/g" app.js

# 5. 安装依赖
echo -e "${YELLOW}>> 正在安装 Node.js 核心依赖...${RESET}"
npm init -y >/dev/null 2>&1
npm install express cors axios ws better-sqlite3 form-data ssh2

# 6. 启动服务并设置自启
echo -e "${YELLOW}>> 正在启动服务...${RESET}"
chmod +x menu.sh
pm2 start app.js --name "DownloadManager"
pm2 save
pm2 startup | grep -v "sudo" | bash

# 7. 获取本机IP
IP=$(curl -s ifconfig.me)

echo -e "\n${GREEN}==================================================${RESET}"
echo -e "${GREEN}🎉 安装部署完成！${RESET}"
echo -e "${GREEN}==================================================${RESET}"
echo -e "🔗 访问地址: ${YELLOW}http://${IP}:${HTTP_PORT}${RESET}"
echo -e "👤 默认账号: ${YELLOW}admin${RESET}"
echo -e "🔑 默认密码: ${YELLOW}password${RESET}"
echo -e "\n⚙️  管理面板: 以后你可以随时在终端输入 ${YELLOW}cd $INSTALL_DIR && ./menu.sh${RESET} 来管理服务。"
echo -e "⚠️  请务必在登录后前往【全局设置】修改默认密码！"
echo -e "${GREEN}==================================================${RESET}"
