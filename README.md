# 🚀 Download Manager Pro

![Version](https://img.shields.io/badge/version-2.0.0--Final-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D%2020.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

**Download Manager Pro** 是一款专为高并发、全自动化影视流水线打造的**重型媒体集群中枢**。它集成了多节点 Aria2 下载管理、云盘/盘搜直连、跨服务器集群进程监控，并搭载了行业领先的 **“正则 + MP官方 + LLM大模型” 三级智能重命名引擎**。

无论你是 PT 玩家、EMOS 节点管理员，还是 NAS 自动化爱好者，它都能为你提供极致稳定、丝般顺滑的管理体验。

---

## ✨ 核心特性 (Features)

### 📥 1. 强悍的 Aria2 集群控制
* **多节点统管**：支持同时绑定和控制多个异地 Aria2 节点。
* **完美状态同步**：突破 Aria2 默认 1000 条历史记录的“视界盲区”，本地 SQLite 提供绝对的历史数据护盾，任务永不丢失。
* **高并发防雪崩**：底层采用 HTTP & WebSocket 单端口同源复用架构，内置 `isSyncing` 并发单例锁与 `MaxListeners` 封印解除，哪怕同时塞入上万任务也稳如磐石。
* **便捷投递**：支持 URL、磁力链接批量添加，支持直接拖拽 `.torrent` 本地种子文件进行极速上传。

### 🧠 2. 独创“三位一体”智能解析引擎
专为解决各种奇葩命名、乱码种子打造的三级降级防御体系：
1. ⚡ **本地极速提取 (Tier 1)**：内置 `parse-torrent-title`，0 延迟、0 消耗，瞬间正则切分标准命名。
2. 🎬 **MoviePilot 官方解析 (Tier 2)**：直连 MP 核心 API，精准匹配 TMDB 资料库。
3. 🤖 **LLM 大模型推理 (Tier 3)**：当常规解析失效时，自动唤起大模型（OpenAI/DeepSeek/Kimi）进行深度语义提取。**支持 SSE 流式传输，像 ChatGPT 一样实时打印“打字机”思考过程**。
* **批量序列化**：支持单文件替换，或使用 `{n}` 和 `{ext}` 变量进行全自动批量剧集重命名。

### ☁️ 3. 云盘管理与全网盘搜
* **OpenList 无缝对接**：直接在面板中浏览 Alist 等云端文件，支持一键推送到指定的 Aria2 下载节点。
* **全局聚合搜索**：内置全网盘搜引擎接口，支持按网盘类型（阿里、夸克等）一键过滤和复制。

### 🖥️ 4. 跨服务器监控 (VideoOrganizer Cluster)
* **远程进程控制**：实时监控异地服务器的 Python 整理脚本状态（PID、内存、运行时间）。
* **实时终端日志**：在网页端直接查看节点打印的彩色高亮日志，支持启动、停止、清理。
* **指定目录执行**：支持向下游节点下发带有 JSON Payload 的启动指令，精准处理特定目录。

### 🎨 5. 极客级现代 UI
* **苹果级视觉质感**：全站采用 Modern Card Form 风格，拥有平滑的 iOS 风格开关和极简悬浮边框输入组。
* **丝滑硬件加速**：CSS 动画与滚动重构，彻底解决长列表重绘卡顿问题，支持 Dark/Light 昼夜模式无缝切换。
* **完美移动端适配**：针对手机全面重写 Flex 布局，告别底部遮挡与横向溢出。

---

## 🛠️ 一键部署 (Installation)

本项目提供了极致简单的一键部署脚本，自动完成 Node.js 环境配置、依赖安装及 PM2 守护进程挂载。

### 方式一：Shell 极速安装 (推荐)
只需在终端执行以下命令（需 root 权限）：
```bash
bash <(curl -sL [https://raw.githubusercontent.com/MechanicF/Download-Manager/main/manager.sh](https://raw.githubusercontent.com/MechanicF/Download-Manager/main/manager.sh))
```
> 安装成功后，随时在终端输入 `dm` 即可呼出炫酷的控制台菜单，进行重启、查看日志或一键更新。

### 方式二：Docker 容器化部署
拉取镜像并直接启动（请确保存储映射正确）：
```bash
docker run -d \
  --name download-manager-pro \
  -p 1111:1111 \
  -v /你的路径/config.json:/opt/Download-Manager/config.json \
  -v /你的路径/downloads.db:/opt/Download-Manager/downloads.db \
  --restart unless-stopped \
  mechanicf/download-manager:latest
```

---

## ⚙️ 初始配置与使用 (Configuration)

1. 部署完成后，在浏览器访问 `http://你的IP:1111`。
2. 初始默认账号：`admin`，默认密码：`password`。
3. 登录后，请立即前往 **【⚙️ 全局设置】->【🔒 面板安全】** 修改默认密码。
4. 在设置页中依次添加你的 Aria2 节点 URL 和 RPC 密钥、云盘 API 等信息。配置实时生效！

---

## 🛡️ 安全与防护
* **防爆破机制**：内置 IP 封禁策略，连续 5 次密码错误将自动锁定 IP 15 分钟。
* **指令防篡改**：前端到后端的 WebSocket 传输采用 HMAC-SHA256 动态 Token 验签，确保通信绝对安全。
* **高可用防崩**：底层捕获了一切未处理的 Promise 拒绝与网络断流，无论外部 API 如何抽风，主面板永不宕机。

---

## 📜 许可证 (License)

本项目基于 [MIT License](LICENSE) 开源。允许任何个人或企业免费使用、修改和分发，但请保留原作者版权声明。
