const { version } = require('./package.json');
// 🌟 [OOBE 引导引擎] 必须在系统加载任何模块前运行，确保新设备开箱即用
const _fs = require('fs');
const _path = require('path');

// 1. 修复 Winston 日志目录缺失导致崩溃
if (!_fs.existsSync(_path.join(__dirname, 'logs'))) {
    _fs.mkdirSync(_path.join(__dirname, 'logs'));
    console.log('🌱 [系统引导] 已自动创建 logs 目录');
}

// 2. 补齐新环境缺失的 .env
const _envPath = _path.join(__dirname, '.env');
let _envContent = _fs.existsSync(_envPath) ? _fs.readFileSync(_envPath, 'utf8') : '';
if (!_envContent.includes('JWT_SECRET=')) {
    _fs.appendFileSync(_envPath, "\n" +  "JWT_SECRET=ManagerPro_Super_Secret_Change_Me\nAES_KEY=8ab732c8b82937d92847a983b928374928374a928374b928374c928374d92837\nAES_IV=e27b928374a928374b928374c928374d\nLOG_LEVEL=info\n");
    console.log('🌱 [系统引导] 已自动生成默认 .env 安全配置');
}

// 3. 防御 Docker 错把 config.json 挂载为目录的史诗级大坑
const _cfgPath = _path.join(__dirname, 'config.json');
if (_fs.existsSync(_cfgPath) && _fs.statSync(_cfgPath).isDirectory()) {
    console.error('\n❌ [Docker 挂载严重错误] config.json 被 Docker 错误地创建成了文件夹！');
    console.error('👉 请在宿主机执行 \'rm -rf config.json\' 和 \'touch config.json\' 后再重启容器！\n');
    process.exit(1);
} else if (!_fs.existsSync(_cfgPath)) {
    _fs.writeFileSync(_cfgPath, JSON.stringify({ auth: { username: 'admin', password: 'password' }, aria2: [], openlist: [], video_organizer_url: "", vo_nodes: [] }, null, 2));
    console.log('🌱 [系统引导] 已自动生成默认 config.json');
}

// 4. 防御 downloads.db 被挂载为目录
const _dbPath = _path.join(__dirname, 'downloads.db');
if (_fs.existsSync(_dbPath) && _fs.statSync(_dbPath).isDirectory()) {
    console.error('\n❌ [Docker 挂载严重错误] downloads.db 被 Docker 错误地创建成了文件夹！');
    console.error('👉 请在宿主机执行 \'rm -rf downloads.db\' 和 \'touch downloads.db\' 后再重启容器！\n');
    process.exit(1);
}
// =========================================================================

/* OOBE 引导结束 */
require('dotenv').config({ path: __dirname + '/.env' }); // 🌍 强制绑定当前代码目录的 .env

// 🛡️ 生产级防御：启动时严格校验核心环境变量
const requiredEnvVars = ['JWT_SECRET', 'AES_KEY', 'AES_IV'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error('\n❌ 致命错误: 缺少系统级环境变量 [' + envVar + ']');
    console.error('请检查 .env 文件是否配置正确，系统已强制停止启动以保证安全。\n');
    process.exit(1);
  }
});

const express = require('express');
const logger = require('./utils/logger');
const promClient = require('prom-client');
promClient.collectDefaultMetrics(); // 开启底层物理指标收集

const Joi = require('joi');

// 🛡️ API 请求体校验工厂 (防御非法注入)
const validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        logger.warn('⚠️ 拦截到非法请求:', error.message);
        return res.status(400).json({ success: false, error: '请求格式不合法', details: error.message });
    }
    next();
};

const jwt = require('jsonwebtoken');
require('events').EventEmitter.defaultMaxListeners = 100; // 🚀 解除高并发 KeepAlive 下的 Socket 监听器数量限制

const axios = require('axios');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// 🌟 建立持久化连接池，避免每 1.5 秒疯狂进行 TCP 三次握手
const rpcClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 })
});

function getSecureToken() {
  return jwt.sign({ username: config.auth.username }, process.env.JWT_SECRET || 'ManagerPro_JWT_Secret_2026', { expiresIn: '7d' });
}

const app = express();
app.set('trust proxy', true); // 信任反代，获取真实 IP
const PORT = 1111;
const WS_PORT = 28080;

app.use((req, res, next) => { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'config.json');
function loadConfig() { 
  let cfg = { auth: { username: 'admin', password: 'password' }, aria2: [], openlist: [], video_organizer_url: "", vo_nodes: [] };
  try { 
      if (fs.existsSync(CONFIG_FILE)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; 
  } catch (e) { logger.error('配置加载异常:', e.message); } 
  return cfg;
}
const saveConfig = (c) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));

const _aesK = Buffer.from(process.env.AES_KEY || '8ab732d0ef2afc4bdcd9ddebe87b264cef1f1dd4e3f7d4227379d80b84290bdc', 'hex');
const _aesI = Buffer.from(process.env.AES_IV || 'e27aa5b2a97546aa693e17a7df4993a8', 'hex');
function _decAES(hex) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', _aesK, _aesI);
    let dec = decipher.update(hex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
}

let config = loadConfig();

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth) return false;
  try { jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'ManagerPro_JWT_Secret_2026'); return true; } 
  catch(e) { return false; }
}

const failedAttempts = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of failedAttempts.entries()) {
    if (now > data.lockUntil) failedAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

app.post('/api/login', validate(Joi.object({ username: Joi.string().required(), password: Joi.string().required() }).unknown(true)), (req, res) => {
  const ip = req.ip;
  if (failedAttempts.size > 2000) failedAttempts.clear(); // 🛡️ 防内存雪崩：达到阀值直接清空丢弃
  const attempts = failedAttempts.get(ip) || { count: 0, lockUntil: 0 };
  if (Date.now() < attempts.lockUntil) return res.status(429).json({ success: false, error: '错误次数过多，IP已被封禁 15 分钟' });
  if (req.body.username === config.auth.username && req.body.password === config.auth.password) {
    failedAttempts.delete(ip);
    res.json({ success: true, token: getSecureToken() });
  } else {
    attempts.count++;
    if (attempts.count >= 5) attempts.lockUntil = Date.now() + 15 * 60 * 1000;
    failedAttempts.set(ip, attempts);
    res.status(401).json({ success: false, error: '账号或密码错误' });
  }
});


// 🏥 微服务健康探针端点
app.get('/health', (req, res) => {
  const healthCheck = { uptime: process.uptime(), timestamp: Date.now(), checks: { database: 'OK', system: 'OK' } };
  try {
    db.prepare('SELECT 1').get();
  } catch (e) {
    healthCheck.checks.database = 'ERROR';
    return res.status(503).json(healthCheck);
  }
  res.status(200).json(healthCheck);
});


// 📊 Prometheus 性能监控指标端点
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.use('/api', (req, res, next) => { if(checkAuth(req)) next(); else res.status(401).send(); });

const db = new Database('downloads.db');



db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456');
setInterval(() => { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e){} }, 12 * 3600 * 1000); // 🧹 每12小时自动清理 WAL 磁盘膨胀

db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, gid TEXT, url TEXT, filename TEXT, total_size INTEGER, downloaded_size INTEGER, speed INTEGER, progress REAL, status TEXT, engine TEXT, hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
try { db.exec('ALTER TABLE tasks ADD COLUMN url TEXT'); } catch(e){}
try {
  // ⚡ 性能优化：创建任务状态与时间的复合索引，应对万级历史记录查询
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status_engine ON tasks(status, engine);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
  `);
  logger.info('✅ SQLite 性能索引挂载完成');
} catch(e) { logger.error('索引创建失败', e); }

db.exec(`CREATE TABLE IF NOT EXISTS global_stats (engine TEXT PRIMARY KEY, historical_dl INTEGER DEFAULT 0, historical_up INTEGER DEFAULT 0)`);
try { db.exec('ALTER TABLE tasks ADD COLUMN uploaded_size INTEGER DEFAULT 0'); } catch(e){}

function safeDeleteTask(field, value) {
  const allowedFields = ['id', 'gid'];
  if (!allowedFields.includes(field)) return;
  const safeField = allowedFields.find(f => f === field); // 白名单映射，彻底阻断注入
  try {
    const t = db.prepare(`SELECT * FROM tasks WHERE ${safeField}=?`).get(value);
    if(t) {
        const dl = t.downloaded_size || 0; const up = t.uploaded_size || 0;
        db.prepare(`INSERT INTO global_stats (engine, historical_dl, historical_up) VALUES (?, ?, ?) ON CONFLICT(engine) DO UPDATE SET historical_dl=historical_dl+?, historical_up=historical_up+?`).run(t.engine, dl, up, dl, up);
        db.prepare(`DELETE FROM tasks WHERE ${safeField}=?`).run(value);
    }
  } catch(e) { logger.error('安全删除任务失败:', e.message); }
}

const aria2 = {
  async call(idx, method, params = []) {
    const srv = config.aria2[idx];
    if(!srv) throw new Error('Aria2节点未配置');
    const r = await rpcClient.post(srv.url, { jsonrpc:'2.0', id:Date.now(), method:`aria2.${method}`, params:[`token:${srv.secret}`, ...params] }, {timeout:2000});
    if (r.data.error) throw new Error(r.data.error.message);
    return r.data.result;
  }
};

app.get('/api/config', (req, res) => res.json({ ...config, version }));
app.post('/api/config', (req, res) => { config = req.body; saveConfig(config); res.json({success:true, newToken: getSecureToken()}); });
app.get('/api/engine/aria2/:id/config', async (req, res) => { 
  try { res.json({ success: true, data: await aria2.call(parseInt(req.params.id), 'getGlobalOption') }); } catch(e) { res.json({success:false, error:e.message}); } 
});
app.post('/api/engine/aria2/:id/config', async (req, res) => { 
  try { await aria2.call(parseInt(req.params.id), 'changeGlobalOption', [req.body]); res.json({success:true}); } catch(e) { res.json({success:false, error:e.message}); } 
});

function getOlConf(idx) { return config.openlist[idx || 0]; }
app.post('/api/openlist/list', async (req, res) => { const c = getOlConf(req.body.olIdx); if(!c) return res.status(400).json({error:'未配置云盘'}); try { res.json((await axios.post(`${c.url}/api/fs/list`, { path: req.body.path||"/", password: "", page: 1, per_page: 0, refresh: true }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/get', async (req, res) => { const c = getOlConf(req.body.olIdx); try { res.json((await axios.post(`${c.url}/api/fs/get`, { path: req.body.path, password: "" }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/rename', async (req, res) => { const c=getOlConf(req.body.olIdx); try{res.json((await axios.post(`${c.url}/api/fs/rename`,{name:req.body.name,path:req.body.path},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/openlist/remove', async (req, res) => { const c=getOlConf(req.body.olIdx); try{res.json((await axios.post(`${c.url}/api/fs/remove`,{dir:req.body.dir,names:req.body.names},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });

app.post('/api/pansou/search', async (req, res) => {
    const { keyword } = req.body;
    const pUrl = config.pansou_url || _decAES('ca53a0178343bb444e9092c44723c06a19ecf8c499c9dbdce977926a486a150a398318dea1d032804f8ebdc64ce3803a');
    try { const targetUrl = pUrl.replace('{k}', encodeURIComponent(keyword)); const r = await axios.get(targetUrl, { timeout: 15000 }); res.json({ success: true, data: r.data }); } catch (e) { res.json({ success: false, error: e.message }); }
});


app.post('/api/llm/recognize', async (req, res) => {
    const { filename } = req.body;
    const l = config.llm;
    if (!l || !l.enabled || !l.key) return res.json({ success: false, error: 'LLM 插件未启用或配置不全' });

    try {
        const abortCtrl = new AbortController();
        req.on('close', () => abortCtrl.abort()); // 🛑 前端断开立刻掐断 LLM，防止 Token 资金泄漏
        const response = await axios.post(l.url.replace(/\/$/, '') + '/chat/completions', {
            model: l.model,
            messages: [
                { 
                    role: "system", 
                    content: "你是一个极其严格的无感情影视命名引擎。你的唯一任务是从凌乱的文件名中提取'剧名/电影名'、'年份'、'季数(Sxx)'、'集数(Exx)'，并严格按固定格式输出。\n\n【严格规则】\n1. 格式必须为 '名称.年份' 或 '名称.年份.SxxExx'。\n2. 绝对禁止输出任何问候语、解释说明、前缀后缀或 markdown 符号(如 ``` )。\n3. 自动过滤掉分辨率(4k/1080p)、压制组、编码(H265)、音频等无用信息。\n4. 优先提取中文译名，如果原文件缺失年份，允许利用你的知识库补全。\n\n【示例学习】\n输入：[幻樱字幕组] 葬送的芙莉莲 Sousou no Frieren - 12 [1080p][HEVC][GB_MP4]\n输出：葬送的芙莉莲.2023.S01.E12\n\n输入：Inception.2010.BluRay.1080p.DTS-HD.MA.5.1.x265.10bit-ALT\n输出：Inception.2010" 
                },
                { role: "user", content: filename }
            ],
            temperature: 0.1, // 📉 极低温度，剥夺聊天欲望，强制精准输出
            stream: true // 🚀 开启底层流式传输
        }, {
            headers: { 'Authorization': `Bearer ${l.key}`, 'Content-Type': 'application/json' },
            responseType: 'stream', // axios 接收流
            timeout: 60000,
            signal: abortCtrl.signal
        });

        // 打通管道，将上游的打字机流原封不动地发给前端
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        response.data.pipe(res);
    } catch (e) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.write(`data: {"error": "LLM API 连接异常: ${e.response ? e.response.status : e.message}"}\n\n`);
        res.end();
    }
});


app.post('/api/local/recognize', (req, res) => {
    try {
        const ptt = require('parse-torrent-title');
        const parsed = ptt.parse(req.body.filename);
        if (!parsed.title) return res.json({success: false, error: '未能匹配到标题'});
        
        let name = parsed.title.replace(/\s+/g, '.').replace(/[\(\)]/g, '');
        if (parsed.year) name += '.' + parsed.year;
        if (parsed.season !== undefined) name += '.S' + String(parsed.season).padStart(2, '0');
        if (parsed.episode !== undefined) name += '.E' + String(parsed.episode).padStart(2, '0');
        
        res.json({ success: true, cleanName: name });
    } catch (e) {
        res.json({ success: false, error: '后端库未安装或异常: ' + e.message });
    }
});

app.post('/api/moviepilot/recognize', async (req, res) => {
            const { filename } = req.body;
            const tid = req.body.tmdbid || req.body.tmdbId;
            const mpUrl = config.moviepilot_url || _decAES('ca53a0178343bb444e9092c44723c06a0f88c238e150834834b6504e5cf9584b');
            const mpToken = config.moviepilot_token || _decAES('6371af74c2571e734821681e59f7010f058882afde99b457cff17ef2dfac6278');
            const baseMp = mpUrl.replace(/\/$/, '');
            const hdrs = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
            
            try {
                // 战术核心：如果输入了 TMDB ID，直接走 MP 的底层查询接口！
                if (tid) {
                    try {
                        // 注意：接口必须是单数的 movie 和 tv！
                        let infoRes = await axios.get(baseMp + '/api/v1/tmdb/movie/' + tid, { params: { token: mpToken }, headers: hdrs }).catch(()=>null);
                        if (!infoRes || !infoRes.data || !infoRes.data.title) { 
                            infoRes = await axios.get(baseMp + '/api/v1/tmdb/tv/' + tid, { params: { token: mpToken }, headers: hdrs }).catch(()=>null); 
                        }
                        
                        if (infoRes && infoRes.data && (infoRes.data.title || infoRes.data.name)) {
                            let name = infoRes.data.title || infoRes.data.name;
                            let year = infoRes.data.year || (infoRes.data.release_date ? infoRes.data.release_date.substring(0, 4) : '') || (infoRes.data.first_air_date ? infoRes.data.first_air_date.substring(0, 4) : '');
                            
                            if (name) name = name.replace(/\s+/g, '.').replace(/[\(\)]/g, '');
                            let finalName = name;
                            if (year) finalName += '.' + year;
                            
                            // 智能补充：如果是剧集（有 name 字段），强行从原文件抢救 SxxExx
                            if (infoRes.data.name) {
                                let s = '01'; let e = null;
                                let cleanFn = filename.replace(/(19|20)\d{2}/g, '').replace(/1080p|720p|2160p|4k/gi, '');
                                let sMatch = cleanFn.match(/[Ss](\d+)/); if(sMatch) s = sMatch[1];
                                let eMatch = cleanFn.match(/[Ee](\d+)/) || cleanFn.match(/第\s*(\d{1,4})\s*[集话]/) || cleanFn.match(/[\[【]\s*(\d{1,3})\s*[\]】]/) || cleanFn.match(/\s-\s*(\d{1,3})\b/);
                                if(eMatch) e = eMatch[1];
                                else { let fb = cleanFn.match(/\b(\d{2,3})\b/); if(fb) e = fb[1]; }
                                
                                if(e) finalName += '.S' + String(s).padStart(2, '0') + '.E' + String(e).padStart(2, '0');
                            }
                            return res.json({ success: true, cleanName: finalName });
                        }
                    } catch(e) {}
                }
                
                // 战术降级：没有 ID 的时候，或者 API 抽风，走常规搜索
                // 这里加了个小魔法：把 [tmdbid=xxx] 强行塞进文件名里，尝试触发 MP 的内置正则
                let queryTitle = tid ? filename + " [tmdbid=" + tid + "]" : filename;
                let rx = await axios.get(baseMp + '/api/v1/media/recognize2', { params: { title: queryTitle, token: mpToken }, headers: hdrs }).catch(()=>null);
                let d = rx ? rx.data : null;
                
                if (d && d.media_info) {
                    let name = d.media_info.title || d.meta_info?.title || '';
                    if (name) name = name.replace(/\s+/g, '.').replace(/[\(\)]/g, '');
                    if (d.media_info.year) name += '.' + d.media_info.year;
                    if (d.meta_info && d.meta_info.begin_season != null) name += '.S' + String(d.meta_info.begin_season).padStart(2,'0');
                    if (d.meta_info && d.meta_info.begin_episode != null) name += '.E' + String(d.meta_info.begin_episode).padStart(2,'0');
                    return res.json({ success: true, cleanName: name });
                }
                res.json({ success: false, error: '未能识别出媒体信息' });
            } catch (e) {
                res.json({ success: false, error: e.response && e.response.status ? 'MP报错(' + e.response.status + ')' : '请求失败' });
            }
        });

app.get('/api/tasks/:id/details', async (req, res) => {
  try {
    const id = req.params.id;
    const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    if (!t) return res.json({ success: false, error: '任务不存在或已被彻底清除' });
    
    const idx = parseInt(t.engine.split('_')[1]); 
    const status = await aria2.call(idx, 'tellStatus', [t.gid]);
    
    let peers = [];
    if (status.bittorrent) {
        try { peers = await aria2.call(idx, 'getPeers', [t.gid]); } catch(e) {}
    }
    
    const files = (status.files || []).map(f => {
        let name = f.path ? f.path.split(/[\\/]/).pop() : '未知文件';
        if (!f.path && f.uris && f.uris.length > 0) name = decodeURIComponent(f.uris[0].uri.split('/').pop().split('?')[0]);
        return { name: name, size: parseInt(f.length) || 0, completed: parseInt(f.completedLength) || 0 };
    });
    
    res.json({ 
        success: true, 
        engine: config.aria2[idx] ? config.aria2[idx].name : t.engine, 
        data: { 
            dir: status.dir || '未知', 
            connections: status.connections || 0, 
            numPieces: parseInt(status.numPieces) || 0, 
            pieceLength: parseInt(status.pieceLength) || 0,
            bitfield: status.bitfield || '', 
            infoHash: status.infoHash || '' 
        }, 
        files: files,
        peers: peers
    });
  } catch (e) { 
    res.json({ success: false, error: '查询失败: ' + e.message }); 
  }
});

app.post('/api/tasks/:id/:act', async (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id); if(!t) return res.json({success:false});
  try {
    const idx = parseInt(t.engine.split('_')[1]);
    if(req.params.act==='pause') { await aria2.call(idx, 'pause', [t.gid]); db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(t.id); }
    else if(req.params.act==='resume') { await aria2.call(idx, 'unpause', [t.gid]); db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(t.id); }
    else if(req.params.act==='delete') {
      try { await aria2.call(idx, 'remove', [t.gid]); } catch(e) { try { await aria2.call(idx, 'removeDownloadResult', [t.gid]); } catch(e2){} }
      safeDeleteTask('id', t.id);
    }
  } catch(e){} 
  res.json({success:true});
});

app.post('/api/tasks/batch', async (req, res) => {
  const { ids, action } = req.body;
  await Promise.allSettled(ids.map(async (id) => {
    const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if(!t) return;
    try {
      const idx = parseInt(t.engine.split('_')[1]);
      if(action==='pause') { await aria2.call(idx, 'pause', [t.gid]); db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(id); }
      else if(action==='resume') { await aria2.call(idx, 'unpause', [t.gid]); db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(id); }
      else if(action==='delete') { 
          try { await aria2.call(idx, 'remove', [t.gid]); } catch(e) { try { await aria2.call(idx, 'removeDownloadResult', [t.gid]); } catch(e2){} }
          safeDeleteTask('id', id);
      }
    } catch(e){}
  }));
  res.json({success:true});
});

async function getTrackers() {
  try { const res = await axios.get('https://cf.trackerslist.com/best.txt', {timeout: 3000}); return res.data.trim().replace(/\n/g, ','); } catch(e) { return ""; }
}

app.post('/api/download', async (req, res) => {
  const { url, engine, headers } = req.body; const urls = url.split(/[\n,]/).map(u=>u.trim()).filter(u=>u);
  if(urls.length===0) return res.json({success:false, error:'地址为空'});
  if(!config.aria2 || config.aria2.length===0) return res.json({success:false, error:'请先配置节点'});
  let sc = 0; let lastErr = '';
  for (const dlUrl of urls) {
    let target = engine;
    try {
      const idx = parseInt(target.split('_')[1]); let opts = {};
      if (headers) { let arr = []; for(const [k,v] of Object.entries(headers)) arr.push(`${k}: ${v}`); if(arr.length>0) opts.header = arr; }
      if (dlUrl.toLowerCase().startsWith('magnet:') || dlUrl.toLowerCase().includes('.torrent')) { const tk = await getTrackers(); if(tk) opts['bt-tracker'] = tk; }
      const gid = await aria2.call(idx, 'addUri', [[dlUrl], opts]);
      db.prepare("INSERT OR REPLACE INTO tasks (id, url, engine, status) VALUES (?, ?, ?, 'waiting')").run(gid, dlUrl, target);
      sc++;
    } catch (e) { lastErr = e.message; }
  }
  if(sc>0) res.json({success:true, message:`成功投递 ${sc} 个任务`}); else res.json({success:false, error: lastErr||'投递失败'});
});

app.post('/api/upload', async (req, res) => {
  const { engine, fileBase64, filename } = req.body;
  if (!config.aria2 || config.aria2.length === 0) return res.json({ success: false, error: '请配置 Aria2 节点' });
  let target = engine;
  try {
    const idx = parseInt(target.split('_')[1]);
    const gid = await aria2.call(idx, 'addTorrent', [fileBase64]);
    const cleanFilename = xss(filename || '本地种子.torrent');
    db.prepare("INSERT OR REPLACE INTO tasks (id, filename, engine, status) VALUES (?, ?, ?, 'waiting')").run(gid, cleanFilename, target);
    res.json({ success: true, message:'种子已上传' });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// 🌟 预编译 SQL 语句，避免每次循环重复解析 AST 语法树，数据库写入性能暴增
const insertTaskStmt = db.prepare('INSERT INTO tasks (id, gid, filename, total_size, downloaded_size, uploaded_size, speed, progress, status, engine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, total_size=excluded.total_size, downloaded_size=excluded.downloaded_size, uploaded_size=excluded.uploaded_size, speed=excluded.speed, progress=excluded.progress, status=excluded.status');

const getHistoricalStatStmt = db.prepare('SELECT historical_dl, historical_up FROM global_stats WHERE engine=?');

let _syncPromise = null;
const _nodeTaskCache = {}; // 🛡️ UI 防闪烁：节点任务状态缓存
async function syncDatabase() {
  if(_syncPromise) return await _syncPromise;
  _syncPromise = (async () => {
    let aNodesInfo = []; let globalDlSpeed = 0; let globalUpSpeed = 0;
    let liveTasks = []; // 🟢 热数据：Aria2 内存直出
    
    if (config.aria2) {
      const nodePromises = config.aria2.map(async (srv, i) => {
        try {
          const [a, w, s, stat] = await Promise.all([
            aria2.call(i,'tellActive'), aria2.call(i,'tellWaiting',[0,1000]), aria2.call(i,'tellStopped',[0,1000]), aria2.call(i,'getGlobalStat')
          ]);
          const allTasks = [...a, ...w, ...s];
          let totalDl = 0, totalUp = 0;
          allTasks.forEach(t => { totalDl += parseInt(t.completedLength)||0; totalUp += parseInt(t.uploadLength)||0; });
          const dlSpeed = parseInt(stat.downloadSpeed)||0, upSpeed = parseInt(stat.uploadSpeed)||0;
          const h = getHistoricalStatStmt.get(`aria2_${i}`);
          _nodeTaskCache[i] = allTasks;
          return { idx: i, online: true, name: srv.name, dlSpeed, upSpeed, totalDl: totalDl + (h?h.historical_dl:0), totalUp: totalUp + (h?h.historical_up:0), tasks: allTasks };
        } catch(e) {
          return { idx: i, online: false, name: srv.name, dlSpeed: 0, upSpeed: 0, totalDl: 0, totalUp: 0, tasks: (_nodeTaskCache[i] || []) };
        }
      });
      const results = await Promise.all(nodePromises);
      
      results.sort((x, y) => x.idx - y.idx).forEach(r => {
          aNodesInfo.push({ online: r.online, name: r.name, dlSpeed: r.dlSpeed, upSpeed: r.upSpeed, totalDl: r.totalDl, totalUp: r.totalUp });
          globalDlSpeed += r.dlSpeed; globalUpSpeed += r.upSpeed;
          
          // 🚀 组装热数据：完全模拟 AriaNg 的无状态读取
          r.tasks.forEach(t => {
              const total = parseInt(t.totalLength)||0, comp = parseInt(t.completedLength)||0;
              const speed = parseInt(t.downloadSpeed)||0, prog = total ? (comp/total*100) : 0;
              
              let st = t.status === 'active' ? 'downloading' : t.status;
              if (t.status === 'error' || (t.errorCode && String(t.errorCode) !== '0')) st = 'error';
              if (t.status === 'removed') st = (total > 0 && comp >= total) ? 'complete' : 'error';
              
              let fn = '解析中...';
              try {
                if (t.bittorrent && t.bittorrent.info && t.bittorrent.info.name) fn = t.bittorrent.info.name;
                else if (t.files && t.files.length > 0) {
                    const file = t.files[0];
                    if (file.path) fn = file.path.split(/[\\/]/).pop();
                    else if (file.uris && file.uris.length > 0) fn = decodeURIComponent(file.uris[0].uri.split('/').pop().split('?')[0]) || '未知任务';
                }
              } catch(e) {}
              if (!fn || fn === '[METADATA]') fn = '种子元数据下载中...';
              
              const up = parseInt(t.uploadLength)||0;
              const uid = `${r.idx}_${t.gid}`;
              
              const taskObj = { id: uid, gid: t.gid, filename: fn, total_size: total, downloaded_size: comp, uploaded_size: up, speed: speed, progress: prog, status: st, engine: `aria2_${r.idx}`, created_at: new Date().toISOString().replace('T',' ').substring(0,19) };
              liveTasks.push(taskObj);
              
              // 🧊 只有任务彻底死去(完成/报错)，才写入冷板凳数据库永久保存
              if (st === 'complete' || st === 'error') {
                  try { insertTaskStmt.run(uid, t.gid, fn, total, comp, up, speed, prog, st, `aria2_${r.idx}`); } catch(err){}
              }
          });
      });
    }
    
    // 🔗 无缝拼合：Aria2 内存热数据 + SQLite 冷历史记录
    
    // 🚀 100% 纯内存模式：废弃 SQLite 历史拼合，列表与 Aria2 底层绝对一致

    return { aria2Nodes: aNodesInfo, globalDlSpeed, globalUpSpeed, finalTasks: liveTasks };
  })();
  try { return await _syncPromise; } finally { _syncPromise = null; }
}

app.get('/api/tasks', async (req, res) => { const s = await syncDatabase(); res.json(s.finalTasks); });
app.get('/api/global-stats', async (req, res) => { res.json(await syncDatabase()); });

app.post('/api/force_kill_task', async (req, res) => {
    const { url, secret, gid } = req.body;
    if (!url || !gid) return res.json({success: false, error: '缺少参数'});
    const isValidTarget = config.aria2 && config.aria2.some(node => node.url === url);
    if (!isValidTarget) return res.json({success: false, error: '非法的请求目标'});
    
    const makeReq = (method, params=[]) => new Promise(resolve => {
        try {
            const payloadBuffer = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 'kill_'+Date.now(), method, params: secret ? [`token:${secret}`, ...params] : params }), 'utf8');
            const { URL } = require('url'); const u = new URL(url);
            const client = u.protocol === 'https:' ? https : http;
            
            const request = client.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': payloadBuffer.length }, timeout: 3000 }, (response) => {
                let data = ''; response.on('data', (chunk) => data += chunk);
                response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e){ resolve({error: '解析失败'}); } });
            });
            request.on('error', (e) => resolve({error: e.message})); request.write(payloadBuffer); request.end();
        } catch(e) { resolve({error: e.message}); }
    });

    await makeReq('aria2.forceRemove', [gid]);
    await new Promise(r => setTimeout(r, 600));
    const removeRes = await makeReq('aria2.removeDownloadResult', [gid]);
    try { 
        if(typeof db !== 'undefined') { 
            try{ db.prepare('DELETE FROM downloads WHERE gid=?').run(gid); }catch(e){} 
            safeDeleteTask('gid', gid);
        } 
    } catch(e){}
    
    res.json({success: true, message: '任务已彻底删除', debug_res: removeRes});
});

// --- 优雅退出机制 (Graceful Shutdown) ---
function shutdownGracefully() {
    logger.info('\n[系统] 接收到退出信号，正在安全关闭数据库连接...');
    try { if (db) db.close(); } catch(e) {}
    process.exit(0);
}
process.on('SIGTERM', shutdownGracefully);
process.on('SIGINT', shutdownGracefully);



// === 集群版：VideoOrganizer BFF 代理网关 ===
app.all('/api/vo/:id/:action', async (req, res) => {
    const nodes = config.vo_nodes || [];
    const node = nodes.find(n => String(n.id) === String(req.params.id));
    if (!node || !node.url) return res.json({ success: false, error: '节点未找到或 URL 为空' });
    
    const targetUrl = (node.url.startsWith('http') ? node.url : 'http://' + node.url).replace(/\/$/, '') + '/api/' + req.params.action;
    
    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            params: req.query,
            data: req.body,
            timeout: 3000
        });
        res.json(response.data);
    } catch (e) {
        res.status(200).json({ success: false, error: '离线/超时', details: e.message });
    }
});



// === 终极架构：HTTP & WS 共享端口 + 防并发雪崩锁 ===

// 🛡️ 全局异常捕获中间件与兜底防线
app.use((err, req, res, next) => {
    logger.error('🔥 [系统异常捕获]:', err.message);
    res.status(err.status || 500).json({ success: false, error: '服务器内部处理异常', msg: err.message });
});

// 彻底封杀导致 PM2 重启的终极元凶
process.on('uncaughtException', (err) => { 
    logger.error('💥 未捕获的严重异常 (已被安全拦截):', err); 
});
process.on('unhandledRejection', (reason) => { 
    logger.error('💥 未处理的 Promise 拒绝 (已被安全拦截):', reason); 
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/tasks', perMessageDeflate: { zlibDeflateOptions: { level: 4 }, threshold: 1024 } });

// 🚀 V3.0 企业级状态引擎：WebSocket 增量 Diff 同步
let lastFullPayload = "";
let isSyncing = false;
let previousTasksMap = new Map();

const runSyncLoop = async () => {
  if (isSyncing) { setTimeout(runSyncLoop, 1500); return; }
  isSyncing = true;
  try {
      const stats = await syncDatabase();
      const currentTasks = stats.finalTasks || [];
      if (wss.clients.size === 0) return; // 🛡️ 只要没人在看UI，立刻中止 Diff 计算和下发，但刚才的 syncDatabase 已经成功将完成的任务落盘！
      
      let added = [], updated = [], removed = [];
      const currentIds = new Set();
      
      // 1. 计算新增与更新 (Diff 算法核心)
      currentTasks.forEach(t => {
          currentIds.add(t.id);
          const prev = previousTasksMap.get(t.id);
          if (!prev) {
              added.push(t);
          } else if (
              prev.status !== t.status || 
              prev.progress !== t.progress || 
              prev.speed !== t.speed || 
              prev.downloaded_size !== t.downloaded_size
          ) {
              updated.push(t);
          }
      });
      
      // 2. 计算被移除的任务
      for (const id of previousTasksMap.keys()) {
          if (!currentIds.has(id)) removed.push(id);
      }
      
      const hasChanges = added.length > 0 || updated.length > 0 || removed.length > 0;
      
      // 永远维护一份全量快照，供新连接的客户端使用
      lastFullPayload = JSON.stringify({ type: 'full', tasks: currentTasks, stats: stats });
      
      // 3. 只有发生变化，才下发增量包 (大幅节省带宽)
      if (hasChanges) {
          const diffPayload = JSON.stringify({ type: 'diff', changes: { added, updated, removed }, stats: stats });
          wss.clients.forEach(client => { 
              if (client.readyState === WebSocket.OPEN && client.isAuthenticated) client.send(diffPayload); 
          });
          // 更新状态树
          previousTasksMap.clear();
          currentTasks.forEach(t => previousTasksMap.set(t.id, t));
      } else {
          // 哪怕任务没变化，也只发送极小的全局速度心跳包
          const heartbeat = JSON.stringify({ type: 'heartbeat', stats: stats });
          wss.clients.forEach(client => { 
              if (client.readyState === WebSocket.OPEN && client.isAuthenticated) client.send(heartbeat); 
          });
      }
  } catch (e) {}
  finally { isSyncing = false; setTimeout(runSyncLoop, 1500); }
};
runSyncLoop(); // 🚀 递归拉取，永不漂移

const interval = setInterval(() => { wss.clients.forEach(ws => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);
wss.on('close', () => clearInterval(interval));
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  try { jwt.verify(token, process.env.JWT_SECRET || 'ManagerPro_JWT_Secret_2026'); } catch(e) { return ws.close(); }
  ws.isAuthenticated = true; ws.isAlive = true;
  
  // ⚡ 新客户端接入时，下发当前全量快照
  if (lastFullPayload) ws.send(lastFullPayload);
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => { /* 静默丢弃底层的网络中断报错 */ });
});

server.listen(PORT, () => logger.info('🚀 API & WS Cluster Unified on PORT ' + PORT));
