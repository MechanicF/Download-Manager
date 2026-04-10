#!/bin/bash

# ================= 颜色与变量定义 =================
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

APP_NAME="DownloadManager"
INSTALL_DIR="/opt/Download-Manager"
REPO_URL="https://github.com/MechanicF/Download-Manager.git"

# ================= 权限检查 =================
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[错误] 请使用 root 用户运行此脚本！(可以使用 sudo -i 切换)${RESET}"
  exit 1
fi

# ================= 1. 环境安装模块 =================
install_env() {
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
}

# ================= 2. 首次安装模块 =================
install_app() {
    clear
    echo -e "${GREEN}==================================================${RESET}"
    echo -e "${GREEN}      🚀 Download Manager Pro 一键部署向导        ${RESET}"
    echo -e "${GREEN}==================================================${RESET}"
    
    read -p "👉 请设置 Web 面板访问端口 [默认: 1111]: " HTTP_PORT
    HTTP_PORT=${HTTP_PORT:-1111}
    
    read -p "👉 请设置 WebSocket 通讯端口 [默认: 28080]: " WS_PORT
    WS_PORT=${WS_PORT:-28080}

    echo -e "\n${YELLOW}▶ 确认配置：面板端口 [${HTTP_PORT}] | WS端口 [${WS_PORT}]${RESET}\n"
    sleep 2

    install_env

    echo -e "\n${YELLOW}>> 开始克隆项目到 ${INSTALL_DIR}...${RESET}"
    rm -rf "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    echo -e "${YELLOW}>> 正在配置自定义端口...${RESET}"
    sed -i "s/const PORT = 1111;/const PORT = ${HTTP_PORT};/g" app.js
    sed -i "s/const WS_PORT = 28080;/const WS_PORT = ${WS_PORT};/g" app.js
    sed -i "s/:28080/:${WS_PORT}/g" app.js

    echo -e "${YELLOW}>> 正在安装 Node.js 核心依赖 (这可能需要几分钟)...${RESET}"
    npm init -y >/dev/null 2>&1
    npm install express cors axios ws better-sqlite3 form-data ssh2

    echo -e "${YELLOW}>> 正在启动服务并配置开机自启...${RESET}"
    chmod +x manager.sh
    pm2 start app.js --name "$APP_NAME"
    pm2 save
    pm2 startup | grep -v "sudo" | bash

    IP=$(curl -s ifconfig.me)
    echo -e "\n${GREEN}==================================================${RESET}"
    echo -e "${GREEN}🎉 安装部署完全成功！${RESET}"
    echo -e "🔗 访问地址: ${YELLOW}http://${IP}:${HTTP_PORT}${RESET}"
    echo -e "👤 默认账号: ${YELLOW}admin${RESET}"
    echo -e "🔑 默认密码: ${YELLOW}password${RESET}"
    echo -e "\n⚙️  管理面板: 以后你可以随时在终端输入 ${CYAN}bash $INSTALL_DIR/manager.sh${RESET} 来呼出此菜单。"
    echo -e "⚠️  为了安全，请务必在登录后前往【全局设置】修改默认密码！"
    echo -e "${GREEN}==================================================${RESET}"
    exit 0
}

# ================= 3. 更新模块 =================
update_app() {
    echo -e "\n${YELLOW}>> 开始从 GitHub 拉取最新版本...${RESET}"
    cd "$INSTALL_DIR"
    
    # 提取当前端口配置，防止被覆盖
    HTTP_PORT=$(grep "const PORT =" app.js | tr -dc '0-9')
    WS_PORT=$(grep "const WS_PORT =" app.js | tr -dc '0-9')
    
    echo -e "当前端口保护: HTTP=${HTTP_PORT}, WS=${WS_PORT}"
    
    # 强制覆盖拉取
    git fetch --all
    git reset --hard origin/main
    git pull
    
    # 恢复端口
    if [ -n "$HTTP_PORT" ] && [ -n "$WS_PORT" ]; then
        sed -i "s/const PORT = 1111;/const PORT = ${HTTP_PORT};/g" app.js
        sed -i "s/const WS_PORT = 28080;/const WS_PORT = ${WS_PORT};/g" app.js
        sed -i "s/:28080/:${WS_PORT}/g" app.js
    fi
    
    chmod +x manager.sh
    echo -e "${YELLOW}>> 安装可能存在的新依赖...${RESET}"
    npm install
    
    pm2 restart "$APP_NAME"
    echo -e "${GREEN}🎉 更新完成，服务已重启！${RESET}"
    read -p "按回车键返回菜单..."
}

# ================= 4. 卸载模块 =================
uninstall_app() {
    echo -e "\n${RED}⚠️ 警告：这将彻底删除面板的所有数据、配置和运行环境！${RESET}"
    read -p "确定要继续卸载吗？[y/N]: " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}>> 正在停止并删除后台守护进程...${RESET}"
        pm2 delete "$APP_NAME" &>/dev/null
        pm2 save --force
        
        echo -e "${YELLOW}>> 正在删除项目文件夹...${RESET}"
        rm -rf "$INSTALL_DIR"
        
        echo -e "${GREEN}✅ 卸载完成！江湖再见！${RESET}"
        exit 0
    else
        echo -e "已取消卸载操作。"
        read -p "按回车键返回菜单..."
    fi
}

# ================= 入口逻辑判定 =================
# 如果安装目录不存在，或者安装目录里没有 app.js，说明未安装
if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/app.js" ]; then
    install_app
fi

# ================= 5. 管理菜单主循环 =================
while true; do
    clear
    echo -e "${CYAN}=========================================${RESET}"
    echo -e "       \033[1;37m🚀 Download Manager 控制台\033[0m"
    echo -e "${CYAN}=========================================${RESET}"
    
    if command -v pm2 &> /dev/null; then
        STATUS=$(pm2 jlist | grep -o "\"name\":\"$APP_NAME\".*\"status\":\"[^\"]*\"" | grep -o "\"status\":\"[^\"]*\"" | cut -d'"' -f4)
    else
        STATUS=""
    fi
    
    if [ "$STATUS" == "online" ]; then
        echo -e "   当前后台状态: ${GREEN}[运行中 🟢]${RESET}"
    else
        echo -e "   当前后台状态: ${RED}[已停止 🔴]${RESET}"
    fi
    echo -e "${CYAN}=========================================${RESET}"
    echo -e "  ${GREEN}1.${RESET} ▶️  启动面板服务"
    echo -e "  ${RED}2.${RESET} ⏹️  停止面板服务"
    echo -e "  ${YELLOW}3.${RESET} 🔄 重启面板服务"
    echo -e "  ${CYAN}4.${RESET} 📝 查看实时运行日志"
    echo -e "  ${CYAN}5.${RESET} ⚙️  设置开机自动启动"
    echo -e "  ${YELLOW}6.${RESET} ⬇️  一键更新至最新版本"
    echo -e "  ${RED}7.${RESET} 🗑️  彻底卸载本面板"
    echo -e "  \033[37m0.\033[0m ❌ 退出菜单"
    echo -e "${CYAN}=========================================${RESET}"
    
    read -p "请输入序号选择操作 (0-7): " choice

    case $choice in
        1)
            echo -e "\n${GREEN}启动中...${RESET}"
            cd "$INSTALL_DIR"
            pm2 start app.js --name "$APP_NAME"
            read -p "按回车键返回菜单..."
            ;;
        2)
            echo -e "\n${RED}停止中...${RESET}"
            pm2 stop "$APP_NAME"
            read -p "按回车键返回菜单..."
            ;;
        3)
            echo -e "\n${YELLOW}重启中...${RESET}"
            pm2 restart "$APP_NAME"
            read -p "按回车键返回菜单..."
            ;;
        4)
            echo -e "\n${CYAN}[日志模式] 按 Ctrl+C 可以退出日志查看${RESET}"
            pm2 logs "$APP_NAME"
            ;;
        5)
            echo -e "\n${CYAN}配置开机自启中...${RESET}"
            pm2 startup | grep -v "sudo" | bash
            pm2 save
            echo -e "${GREEN}设置成功！服务器重启后面板会自动运行。${RESET}"
            read -p "按回车键返回菜单..."
            ;;
        6)
            update_app
            ;;
        7)
            uninstall_app
            ;;
        0)
            echo -e "\n已退出控制台。\n"
            exit 0
            ;;
        *)
            echo -e "\n${RED}无效的输入，请重新选择！${RESET}"
            read -p "按回车键返回菜单..."
            ;;
    esac
done
