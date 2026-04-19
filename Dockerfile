FROM node:20-alpine

# 安装 better-sqlite3 编译所需的底层工具
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# 复制依赖文件并安装 (仅安装运行环境)
COPY package*.json ./
RUN npm install --production

# 复制项目代码
COPY . .

# 暴露后端 API 和 WebSocket 端口
EXPOSE 1111 28080

# 启动命令
CMD ["node", "app.js"]
