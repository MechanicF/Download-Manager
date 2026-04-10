#!/bin/bash

if ! command -v pm2 &> /dev/null; then
    echo -e "\033[33m[系统提示] 正在为你安装守护进程工具 PM2...\033[0m"
    npm install -g pm2 > /dev/null 2>&1
    echo -e "\033[32m[系统提示] PM2 安装完成！\033[0m"
fi

APP_NAME="DownloadManager"

while true; do
    clear
    echo -e "\033[36m=========================================\033[0m"
    echo -e "       \033[1;37m🚀 Download Manager 控制台\033[0m"
    echo -e "\033[36m=========================================\033[0m"
    
    STATUS=$(pm2 jlist | grep -o "\"name\":\"$APP_NAME\".*\"status\":\"[^\"]*\"" | grep -o "\"status\":\"[^\"]*\"" | cut -d'"' -f4)
    if [ "$STATUS" == "online" ]; then
        echo -e "   当前状态: \033[32m[运行中 🟢]\033[0m"
    else
        echo -e "   当前状态: \033[31m[已停止 🔴]\033[0m"
    fi
    echo -e "\033[36m=========================================\033[0m"
    echo -e "  \033[32m1.\033[0m ▶️  启动面板 (后台运行)"
    echo -e "  \033[31m2.\033[0m ⏹️  停止面板"
    echo -e "  \033[33m3.\033[0m 🔄 重启面板"
    echo -e "  \033[34m4.\033[0m 📝 查看运行日志"
    echo -e "  \033[35m5.\033[0m ⚙️  设置开机自动启动"
    echo -e "  \033[37m0.\033[0m ❌ 退出菜单"
    echo -e "\033[36m=========================================\033[0m"
    
    read -p "请输入序号选择操作 (0-5): " choice

    case $choice in
        1)
            echo -e "\n\033[32m启动中...\033[0m"
            pm2 start app.js --name "$APP_NAME"
            echo -e "\n面板已在后台运行！你可以关闭此 SSH 窗口了。"
            read -p "按回车键返回菜单..."
            ;;
        2)
            echo -e "\n\033[31m停止中...\033[0m"
            pm2 stop "$APP_NAME"
            read -p "按回车键返回菜单..."
            ;;
        3)
            echo -e "\n\033[33m重启中...\033[0m"
            pm2 restart "$APP_NAME"
            read -p "按回车键返回菜单..."
            ;;
        4)
            echo -e "\n\033[34m[日志模式] 按 Ctrl+C 可以退出日志查看\033[0m"
            pm2 logs "$APP_NAME"
            ;;
        5)
            echo -e "\n\033[35m配置开机自启中...\033[0m"
            pm2 startup
            pm2 save
            echo -e "\033[32m设置成功！服务器重启后面板会自动运行。\033[0m"
            read -p "按回车键返回菜单..."
            ;;
        0)
            echo -e "\n已退出控制台。\n"
            exit 0
            ;;
        *)
            echo -e "\n\033[31m无效的输入，请重新选择！\033[0m"
            read -p "按回车键返回菜单..."
            ;;
    esac
done
