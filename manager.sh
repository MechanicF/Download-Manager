#!/bin/bash

# ================= 颜色与变量 =================
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

APP_NAME="DownloadManager"
INSTALL_DIR="/opt/Download-Manager"
REPO_URL="https://github.com/MechanicF/Download-Manager.git"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[错误] 请使用 root 用户运行此脚本！${RESET}"
  exit 1
fi

install_env() {
    clear
    echo -e "${GREEN}>> 正在检查并安装基础依赖环境...${RESET}"
    if ! command -v curl &> /dev/null || ! command -v git &> /dev/null; then
        if command -v apt-get &> /dev/null; then apt-get update && apt-get install -y curl git; 
        elif command -v yum &> /dev/null; then yum install -y curl git; fi
    fi
    if ! command -v node &> /dev/null; then
        if command -v apt-get &> /dev/null; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs;
        elif command -v yum &> /dev/null; then curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && yum install -y nodejs; fi
    fi
    if ! command -v pm2 &> /dev/null; then npm install -g pm2; fi
}

install_app() {
    install_env
    echo -e "\n${GREEN}==================================================${RESET}"
    echo -e "${GREEN}      🚀 Download Manager 初始安装配置            ${RESET}"
    echo -e "${GREEN}==================================================${RESET}"
    read -p "👉 请设置 Web 面板访问端口 [默认: 1111]: " HTTP_PORT
    HTTP_PORT=${HTTP_PORT:-1111}

    echo -e "\n${YELLOW}>> 开始克隆项目到 ${INSTALL_DIR}...${RESET}"
    rm -rf "$INSTALL_DIR" && git clone "$REPO_URL" "$INSTALL_DIR" && cd "$INSTALL_DIR" || exit

    echo -e "${YELLOW}>> 正在生成默认环境配置 (.env)...${RESET}"
    RANDOM_SALT=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    cat << ENV_EOF > .env
PORT=${HTTP_PORT}
AUTH_USER=admin
AUTH_PASS=password
JWT_SECRET=ManagerPro_${RANDOM_SALT}
SEC_TOKEN_SALT=${RANDOM_SALT}
AES_KEY=8ab732c8b82937d92847a983b928374928374a928374b928374c928374d92837
AES_IV=e27b928374a928374b928374c928374d
LOG_LEVEL=info
ENV_EOF

    echo -e "${YELLOW}>> 正在安装 Node.js 依赖...${RESET}"
    npm install --production

    echo -e "${YELLOW}>> 正在启动服务并设置开机自启...${RESET}"
    chmod +x manager.sh 2>/dev/null || true
    ln -sf "$INSTALL_DIR/manager.sh" /usr/local/bin/dm
    chmod +x /usr/local/bin/dm

    pm2 start app.js --name "$APP_NAME" && pm2 save
    env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root >/dev/null 2>&1

    IP=$(curl -s ifconfig.me)
    echo -e "\n${GREEN}🎉 安装部署成功！访问地址: http://${IP}:${HTTP_PORT}${RESET}"
    echo -e "⚙️  以后随时在终端输入 ${CYAN}dm${RESET} 即可呼出管理菜单！\n"
    read -p "按回车键进入管理菜单..."
}

update_app() {
    echo -e "\n${YELLOW}>> 开始从 GitHub 拉取最新版本...${RESET}"
    cd "$INSTALL_DIR" || exit
    pm2 stop "$APP_NAME" >/dev/null 2>&1
    
    mkdir -p /tmp/dm_db_backup
    cp -f downloads.db* .env /tmp/dm_db_backup/ 2>/dev/null || true
    
    git fetch --all && git reset --hard origin/main && git pull
    
    cp -f /tmp/dm_db_backup/downloads.db* /tmp/dm_db_backup/.env ./ 2>/dev/null || true
    
    chmod +x manager.sh 2>/dev/null || true
    ln -sf "$INSTALL_DIR/manager.sh" /usr/local/bin/dm
    
    npm install --production
    pm2 restart "$APP_NAME" --update-env
    echo -e "${GREEN}🎉 更新完成，服务已重启！${RESET}"
    read -p "按回车键返回菜单..."
}

uninstall_app() {
    echo -e "\n${RED}⚠️ 警告：这将彻底删除面板的所有数据、配置和环境！${RESET}"
    read -p "确定要继续卸载吗？[y/N]: " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        pm2 delete "$APP_NAME" &>/dev/null && pm2 save --force
        rm -f /usr/local/bin/dm && rm -rf "$INSTALL_DIR"
        echo -e "${GREEN}✅ 卸载完成！${RESET}"
        exit 0
    fi
}

if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/app.js" ]; then install_app; fi

while true; do
    clear
    APP_VERSION=$(grep -m1 '"version":' "$INSTALL_DIR/package.json" 2>/dev/null | cut -d'"' -f4 || echo "未知")
    STATUS=$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"$APP_NAME\".*\"status\":\"[^\"]*\"" | grep -o "\"status\":\"[^\"]*\"" | cut -d'"' -f4)
    
    echo -e "${CYAN}=========================================${RESET}"
    echo -e "       \033[1;37m🚀 Download Manager 控制台\033[0m"
    echo -e "${CYAN}=========================================${RESET}"
    echo -e "   当前程序版本: ${YELLOW}v${APP_VERSION}${RESET}"
    if [ "$STATUS" == "online" ]; then echo -e "   当前运行状态: ${GREEN}[运行中 🟢]${RESET}"; else echo -e "   当前运行状态: ${RED}[已停止 🔴]${RESET}"; fi
    echo -e "${CYAN}=========================================${RESET}"
    echo -e "  ${GREEN}1.${RESET} ▶️  启动面板服务"
    echo -e "  ${RED}2.${RESET} ⏹️  停止面板服务"
    echo -e "  ${YELLOW}3.${RESET} 🔄 重启面板服务"
    echo -e "  ${CYAN}4.${RESET} 📝 查看实时运行日志"
    echo -e "  ${CYAN}5.${RESET} ⚙️  设置开机自动启动"
    echo -e "  ${YELLOW}6.${RESET} ⬇️  一键更新至最新版本"
    echo -e "  ${RED}7.${RESET} 🗑️  彻底卸载本面板"
    echo -e "  \033[37m0.\033[0m ❌ 退出控制台"
    echo -e "${CYAN}=========================================${RESET}"
    read -p "请输入序号选择操作 (0-7): " choice

    case $choice in
        1) pm2 start app.js --name "$APP_NAME"; read -p "按回车键返回菜单..." ;;
        2) pm2 stop "$APP_NAME"; read -p "按回车键返回菜单..." ;;
        3) pm2 restart "$APP_NAME" --update-env; read -p "按回车键返回菜单..." ;;
        4) echo -e "${CYAN}[日志模式] 按 Ctrl+C 退出${RESET}"; pm2 logs "$APP_NAME" ;;
        5) env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root >/dev/null 2>&1 && pm2 save; echo -e "${GREEN}设置成功！${RESET}"; read -p "按回车键返回菜单..." ;;
        6) update_app ;;
        7) uninstall_app ;;
        0) echo -e "\n已退出控制台。\n"; exit 0 ;;
        *) echo -e "\n${RED}无效的输入，请重新选择！${RESET}"; read -p "按回车键返回菜单..." ;;
    esac
done
