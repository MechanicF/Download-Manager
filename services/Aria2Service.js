const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('../utils/logger'); // ⚡ 联动 Winston 黑匣子

class Aria2Service {
    constructor() {
        // 🚀 建立企业级持久化连接池，复用 TCP 握手，极大降低高频心跳延迟
        this.client = axios.create({
            timeout: 5000,
            httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
            httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 })
        });
        this.reqId = 0;
    }

    async call(config, method, params = []) {
        if (!config || !config.url) {
            logger.warn(`[Aria2Service] 拦截到非法调用：节点未配置或不存在`);
            throw new Error('Aria2 节点未配置');
        }

        const payload = {
            jsonrpc: '2.0',
            id: `manager_pro_${this.reqId++}`,
            // 自动补全命名空间前缀
            method: method.includes('.') ? method : `aria2.${method}`,
            params: config.secret ? [`token:${config.secret}`, ...params] : params
        };

        try {
            const res = await this.client.post(config.url, payload);
            if (res.data && res.data.error) {
                logger.warn(`[Aria2Service] RPC 业务级报错 - 方法: ${method}`, { msg: res.data.error.message });
                throw new Error(res.data.error.message);
            }
            return res.data ? res.data.result : null;
        } catch (err) {
            logger.error(`[Aria2Service] 节点通信彻底阻断 - 方法: ${method}`, { url: config.url, err: err.message });
            throw err;
        }
    }
}

// 采用单例模式导出
module.exports = new Aria2Service();
