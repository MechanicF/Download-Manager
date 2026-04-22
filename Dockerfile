FROM node:20-alpine

LABEL maintainer="MechanicF"
LABEL description="Download Manager Pro V3.0.0 - 企业级微服务版"

WORKDIR /opt/Download-Manager

# 安装编译依赖、时区及 Curl(用于健康检查)
RUN apk add --no-cache python3 make g++ tzdata curl && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

COPY package*.json ./
RUN npm install --production && npm cache clean --force

COPY . .

# 微服务心跳探针
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:1111/health || exit 1

EXPOSE 1111
EXPOSE 28080

CMD ["node", "app.js"]
