const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const app = express();
const PORT = 1111;
const WS_PORT = 28080;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // 调大以支持稍大体积的种子文件
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const COOKIE_FILE = path.join(__dirname, 'qbit_cookie.txt');

function loadConfig() { let cfg = { auth: { username: 'admin', password: 'password' }, aria2: [], qbit: { baseUrl: '', username: '', password: '' }, openlist: [] }; try { if (fs.existsSync(CONFIG_FILE)) { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } } catch (e) {} return cfg; }
function saveConfig(config) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
function loadCookie() { try { return fs.existsSync(COOKIE_FILE) ? fs.readFileSync(COOKIE_FILE, 'utf8').trim() : null; } catch(e){return null;} }
function saveCookie(c) { fs.writeFileSync(COOKIE_FILE, c); }

let config = loadConfig();

function authMiddleware(req, res, next) { if (req.path === '/login' || req.originalUrl === '/api/login') return next(); const authHeader = req.headers.authorization; if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' }); try { const [u, p] = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8').split(':'); if (u === config.auth.username && p === config.auth.password) return next(); } catch(e) {} res.status(401).json({ error: 'Unauthorized' }); }

app.use('/api', authMiddleware);
app.post('/api/login', (req, res) => { const { username, password } = req.body; if (username === config.auth.username && password === config.auth.password) res.json({ success: true, token: Buffer.from(`${username}:${password}`).toString('base64') }); else res.status(401).json({ success: false }); });

let qbitCookies = loadCookie();
const db = new Database('downloads.db');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, url TEXT, filename TEXT DEFAULT '未知', total_size INTEGER DEFAULT 0, downloaded_size INTEGER DEFAULT 0, speed INTEGER DEFAULT 0, progress REAL DEFAULT 0, status TEXT DEFAULT 'waiting', engine TEXT, hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

function getOlConf(req) { return config.openlist[req.body.olIdx || 0]; }

app.post('/api/openlist/list', async (req, res) => { const c = getOlConf(req); if(!c||!c.url) return res.status(400).json({error:'未配置'}); try { res.json((await axios.post(`${c.url}/api/fs/list`, { path: req.body.path||"/", password: "", page: 1, per_page: 0, refresh: true }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/get', async (req, res) => { const c = getOlConf(req); if(!c||!c.url) return res.status(400).json({error:'未配置'}); try { res.json((await axios.post(`${c.url}/api/fs/get`, { path: req.body.path, password: "" }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/rename', async (req, res) => { const c=getOlConf(req); try{res.json((await axios.post(`${c.url}/api/fs/rename`,{name:req.body.name,path:req.body.path},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/openlist/remove', async (req, res) => { const c=getOlConf(req); try{res.json((await axios.post(`${c.url}/api/fs/remove`,{dir:req.body.dir,names:req.body.names},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });

const aria2 = { async call(idx, method, params = []) { const srv = config.aria2[idx]; if(!srv) throw new Error('Aria2 节点不存在'); const payload = { jsonrpc: '2.0', id: Date.now(), method: `aria2.${method}`, params: [`token:${srv.secret}`, ...params] }; const res = await axios.post(srv.url, payload, { timeout: 10000 }); if (res.data.error) throw new Error(res.data.error.message); return res.data.result; } };

const qbit = {
  getBaseUrl() { if (!config.qbit || !config.qbit.baseUrl) return ''; return config.qbit.baseUrl.replace(/\/$/, ''); },
  async request(endpoint, method = 'GET', data = null) {
    const baseUrl = this.getBaseUrl(); if (!baseUrl) return [];
    const req = { method, url: `${baseUrl}${endpoint}`, timeout: 10000 };
    if (data) { if (data instanceof FormData) { req.data = data; req.headers = data.getHeaders(); } else { req.data = data; req.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; } }
    if (qbitCookies) req.headers = { ...req.headers, 'Cookie': qbitCookies };
    try { return (await axios(req)).data; } catch (err) { if (err.response?.status === 403 || err.response?.status === 401) { const loggedIn = await this.login(); if (loggedIn && qbitCookies) { req.headers = { ...req.headers, 'Cookie': qbitCookies }; return (await axios(req)).data; } } throw err; }
  },
  async login() {
    const baseUrl = this.getBaseUrl(); if (!baseUrl) return false;
    try { const res = await axios.post(`${baseUrl}/api/v2/auth/login`, `username=${encodeURIComponent(config.qbit.username)}&password=${encodeURIComponent(config.qbit.password)}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 }); if (res.data === 'Ok.') { const setCookie = res.headers['set-cookie']; if (setCookie?.length > 0) { qbitCookies = setCookie[0].split(';')[0]; saveCookie(qbitCookies); return true; } } return false; } catch (err) { return false; }
  }
};

app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => { config = { ...config, ...req.body }; saveConfig(config); qbitCookies = null; res.json({ success: true }); });
app.get('/api/engine/aria2/:id/config', async (req, res) => { try { const idx = parseInt(req.params.id); const options = await aria2.call(idx, 'getGlobalOption'); res.json({ success: true, data: options }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/engine/aria2/:id/config', async (req, res) => { try { const idx = parseInt(req.params.id); await aria2.call(idx, 'changeGlobalOption', [req.body]); res.json({ success: true, message: 'Aria2 物理引擎参数已热重载' }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.get('/api/engine/qbit/config', async (req, res) => { try { const prefs = await qbit.request('/api/v2/app/preferences'); res.json({ success: true, data: prefs }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
app.post('/api/engine/qbit/config', async (req, res) => { try { await qbit.request('/api/v2/app/setPreferences', 'POST', `json=${encodeURIComponent(JSON.stringify(req.body))}`); res.json({ success: true, message: 'qBittorrent 物理引擎参数已热重载' }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });

async function getBestAria2Node() { if (!config.aria2 || config.aria2.length === 0) return -1; let bestIdx = 0; let minLoad = Infinity; for(let i=0; i<config.aria2.length; i++) { try { const stat = await aria2.call(i, 'getGlobalStat'); const load = parseInt(stat.numActive); if(load < minLoad) { minLoad = load; bestIdx = i; } } catch(e){} } return bestIdx; }
let cachedTrackers = ""; async function getTrackers() { if(cachedTrackers) return cachedTrackers; try { const res = await axios.get('https://cf.trackerslist.com/best.txt', {timeout: 3000}); cachedTrackers = res.data.trim().replace(/\n/g, ','); return cachedTrackers; } catch(e) { return "udp://tracker.opentrackr.org:1337/announce,udp://open.demonii.com:1337/announce"; } }

app.post('/api/download', async (req, res) => {
  const { url, engine, headers } = req.body; const urls = url.split(/[\n,]/).map(u => u.trim()).filter(u => u); if (urls.length === 0) return res.status(400).json({ success: false });
  const results = [];
  for (const dlUrl of urls) {
    const isBT = dlUrl.toLowerCase().startsWith('magnet:') || dlUrl.toLowerCase().includes('.torrent');
    let targetEngine = engine; if (!targetEngine || targetEngine === 'auto') { if (isBT && config.qbit && config.qbit.baseUrl) { targetEngine = 'qbit'; } else { const bestIdx = await getBestAria2Node(); targetEngine = bestIdx > -1 ? `aria2_${bestIdx}` : 'qbit'; } }
    try {
      if (targetEngine.startsWith('aria2_')) {
        const idx = parseInt(targetEngine.split('_')[1]); let headerArray = []; if (headers) { for (const [k, v] of Object.entries(headers)) headerArray.push(`${k}: ${v}`); }
        const aria2Options = {}; if (headerArray.length > 0) aria2Options.header = headerArray; if (isBT) aria2Options.btTracker = await getTrackers();
        const gid = await aria2.call(idx, 'addUri', [[dlUrl], aria2Options]); db.prepare(`INSERT OR REPLACE INTO tasks (id, url, status, engine) VALUES (?, ?, 'waiting', ?)`).run(gid, dlUrl, targetEngine); results.push({ success: true });
      } else {
        let beforeTorrents = []; try { beforeTorrents = await qbit.request('/api/v2/torrents/info'); } catch(e) { await qbit.login(); beforeTorrents = await qbit.request('/api/v2/torrents/info'); } const beforeHashes = new Set(beforeTorrents.map(t => t.hash));
        const form = new FormData(); form.append('urls', dlUrl); await qbit.request('/api/v2/torrents/add', 'POST', form); await new Promise(r => setTimeout(r, 2000)); 
        const afterTorrents = await qbit.request('/api/v2/torrents/info'); const newTorrent = afterTorrents.find(t => !beforeHashes.has(t.hash)) || afterTorrents[0];
        if (newTorrent) { db.prepare(`INSERT OR REPLACE INTO tasks (id, url, filename, status, engine, hash) VALUES (?, ?, ?, 'downloading', 'qbit', ?)`).run(`qbit_${newTorrent.hash}`, dlUrl, newTorrent.name, newTorrent.hash); results.push({ success: true }); } else { const bestIdx = await getBestAria2Node(); if (bestIdx > -1) { const gid = await aria2.call(bestIdx, 'addUri', [[dlUrl], { "btTracker": await getTrackers() }]); db.prepare(`INSERT OR REPLACE INTO tasks (id, url, status, engine) VALUES (?, ?, 'waiting', ?)`).run(gid, dlUrl, `aria2_${bestIdx}`); results.push({ success: true }); } else { results.push({ success: false, error: '无法投递到任何节点' }); } }
      }
    } catch (e) { results.push({ success: false, error: e.message }); }
  }
  res.json({ success: results.some(r => r.success), message: `添加完成: 已成功推送 ${results.filter(r => r.success).length} 个任务` });
});

// 🌟 新增：本地种子直传接口
app.post('/api/upload', async (req, res) => {
    const { engine, fileBase64, filename } = req.body;
    if (!fileBase64) return res.status(400).json({ success: false, error: '没有获取到文件数据' });
    
    let targetEngine = engine;
    if (!targetEngine || targetEngine === 'auto') {
        // 种子文件默认优先尝试交给 qBit 跑
        targetEngine = (config.qbit && config.qbit.baseUrl) ? 'qbit' : 'aria2_0';
    }
    
    try {
        if (targetEngine.startsWith('aria2_')) {
            const idx = parseInt(targetEngine.split('_')[1]);
            const gid = await aria2.call(idx, 'addTorrent', [fileBase64]);
            db.prepare(`INSERT OR REPLACE INTO tasks (id, url, filename, status, engine) VALUES (?, ?, ?, 'waiting', ?)`).run(gid, '本地上传', filename || '上传的种子.torrent', targetEngine);
        } else {
            const buffer = Buffer.from(fileBase64, 'base64');
            const form = new FormData();
            form.append('torrents', buffer, { filename: filename || 'upload.torrent' });
            await qbit.request('/api/v2/torrents/add', 'POST', form);
            // 依靠双向同步引擎后续捕获该任务，这里不做立即插库
        }
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

// 🌟 新增：任务底层详情获取接口
app.get('/api/tasks/:id/details', async (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    try {
        if (task.engine.startsWith('aria2_')) {
            const idx = parseInt(task.engine.split('_')[1]);
            const stat = await aria2.call(idx, 'tellStatus', [task.id]);
            res.json({ success: true, engine: 'Aria2', data: stat });
        } else {
            const prop = await qbit.request(`/api/v2/torrents/properties?hash=${task.hash}`);
            const trackers = await qbit.request(`/api/v2/torrents/trackers?hash=${task.hash}`).catch(()=>[]);
            res.json({ success: true, engine: 'qBittorrent', data: prop, trackers });
        }
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.get('/api/global-stats', async (req, res) => { let aria2Speed = 0, qbitSpeed = 0, aria2NodesOnline = []; if (config.aria2) { for(let i=0; i<config.aria2.length; i++) { try { const gs = await aria2.call(i, 'getGlobalStat'); aria2Speed += parseInt(gs.downloadSpeed) || 0; aria2NodesOnline.push(true); } catch(e) { aria2NodesOnline.push(false); } } } let qbitOk = false; try { const torrents = await qbit.request('/api/v2/torrents/info'); qbitOk = true; qbitSpeed = torrents.reduce((s, t) => s + (t.dlspeed || 0), 0); } catch(e){} res.json({ aria2Nodes: aria2NodesOnline, qbit: qbitOk, aria2Speed, qbitSpeed }); });

async function syncDatabase() {
  let allAriaTasks = []; let ariaOnline = {};
  if (config.aria2) {
    for(let i=0; i<config.aria2.length; i++) {
      try {
        const [a, w, s] = await Promise.all([ aria2.call(i, 'tellActive'), aria2.call(i, 'tellWaiting', [0, 1000]), aria2.call(i, 'tellStopped', [0, 1000]) ]);
        const filtered = [...a, ...w, ...s].filter(t => t.status !== 'removed').map(t => ({...t, _engineId: `aria2_${i}`}));
        allAriaTasks = allAriaTasks.concat(filtered);
        ariaOnline[`aria2_${i}`] = true;
      } catch(e) { ariaOnline[`aria2_${i}`] = false; }
    }
  }

  let qTorrents = null; try { qTorrents = await qbit.request('/api/v2/torrents/info'); } catch(e){}

  const stmt = db.prepare(`
    INSERT INTO tasks (id, url, filename, total_size, downloaded_size, speed, progress, status, engine, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      filename=excluded.filename, total_size=excluded.total_size, downloaded_size=excluded.downloaded_size,
      speed=excluded.speed, progress=excluded.progress, status=excluded.status
  `);

  const currentEngineIds = new Set();

  for (const aTask of allAriaTasks) {
    currentEngineIds.add(aTask.gid);
    const total = parseInt(aTask.totalLength) || 0; const completed = parseInt(aTask.completedLength) || 0;
    const progress = total > 0 ? (completed / total * 100) : (aTask.status === 'complete' ? 100 : 0);
    let filename = '获取信息中...'; if (aTask.files && aTask.files[0] && aTask.files[0].path) filename = aTask.files[0].path.split(/[\\/]/).pop();
    let status = aTask.status; if (status === 'active') status = 'downloading'; if (status === 'error') status = 'error';
    let url = ''; if (aTask.files && aTask.files[0] && aTask.files[0].uris && aTask.files[0].uris[0]) url = aTask.files[0].uris[0].uri;
    stmt.run(aTask.gid, url, filename, total, completed, parseInt(aTask.downloadSpeed)||0, progress, status, aTask._engineId, null);
  }

  if (qTorrents && Array.isArray(qTorrents)) {
    for (const qTask of qTorrents) {
      const id = `qbit_${qTask.hash}`; currentEngineIds.add(id);
      const statusMap = { 'downloading': 'downloading', 'stalledDL': 'downloading', 'pausedDL': 'paused', 'uploading': 'complete', 'stalledUP': 'complete', 'checkingDL': 'downloading', 'checkingUP': 'complete', 'queuedDL': 'waiting', 'queuedUP': 'waiting', 'allocating': 'downloading', 'metaDL': 'downloading' };
      stmt.run(id, qTask.magnet_uri || '', qTask.name, qTask.size, qTask.downloaded, qTask.dlspeed || 0, qTask.progress * 100, statusMap[qTask.state] || 'downloading', 'qbit', qTask.hash);
    }
  }

  const allDbTasks = db.prepare(`SELECT id, engine FROM tasks`).all();
  const deleteStmt = db.prepare(`DELETE FROM tasks WHERE id = ?`);
  for (const dbTask of allDbTasks) {
    if (!currentEngineIds.has(dbTask.id)) {
       if (dbTask.engine.startsWith('aria2_') && ariaOnline[dbTask.engine]) { deleteStmt.run(dbTask.id); }
       else if (dbTask.engine === 'qbit' && qTorrents !== null) { deleteStmt.run(dbTask.id); }
    }
  }
}

app.get('/api/tasks', async (req, res) => { await syncDatabase(); res.json(db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all()); });

// 🔥 核心修复：严谨拼接 qBit 暂停/继续的 hash 字段
app.post('/api/tasks/batch', async (req, res) => { 
  const { ids, action } = req.body; 
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No tasks selected' }); 
  for (const id of ids) { 
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id); 
    if (!task) continue; 
    try { 
      if (task.engine.startsWith('aria2_')) { 
        const idx = parseInt(task.engine.split('_')[1]); 
        if (action === 'pause') await aria2.call(idx, 'pause', [id]); 
        if (action === 'resume') await aria2.call(idx, 'unpause', [id]); 
        if (action === 'delete') await aria2.call(idx, 'remove', [id]); 
      } else { 
        if (action === 'pause') await qbit.request('/api/v2/torrents/pause', 'POST', `hashes=${task.hash}`); 
        if (action === 'resume') await qbit.request('/api/v2/torrents/resume', 'POST', `hashes=${task.hash}`); 
        if (action === 'delete') await qbit.request('/api/v2/torrents/delete', 'POST', `hashes=${task.hash}&deleteFiles=false`); 
      } 
      if (action === 'pause') db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(id); 
      if (action === 'resume') db.prepare(`UPDATE tasks SET status = 'downloading' WHERE id = ?`).run(id); 
      if (action === 'delete') db.prepare('DELETE FROM tasks WHERE id = ?').run(id); 
    } catch(e) {} 
  } 
  res.json({ success: true }); 
});

app.post('/api/tasks/:id/:action', async (req, res) => { 
  const { id, action } = req.params; 
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id); 
  if (!task) return res.status(404).json({ error: 'Not found' }); 
  try { 
    if (task.engine.startsWith('aria2_')) { 
      const idx = parseInt(task.engine.split('_')[1]); 
      if (action === 'pause') await aria2.call(idx, 'pause', [id]); 
      if (action === 'resume') await aria2.call(idx, 'unpause', [id]); 
      if (action === 'delete') await aria2.call(idx, 'remove', [id]); 
    } else { 
      // 这里的 `hashes=` 是 qBit 原生的严格接收格式
      if (action === 'pause') await qbit.request('/api/v2/torrents/pause', 'POST', `hashes=${task.hash}`); 
      if (action === 'resume') await qbit.request('/api/v2/torrents/resume', 'POST', `hashes=${task.hash}`); 
      if (action === 'delete') await qbit.request('/api/v2/torrents/delete', 'POST', `hashes=${task.hash}&deleteFiles=false`); 
    } 
    if (action === 'pause') db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(id); 
    if (action === 'resume') db.prepare(`UPDATE tasks SET status = 'downloading' WHERE id = ?`).run(id); 
    if (action === 'delete') db.prepare('DELETE FROM tasks WHERE id = ?').run(id); 
    res.json({ success: true }); 
  } catch(e) { res.json({ success: false }); } 
});

const wss = new WebSocket.Server({ port: WS_PORT });
function checkWsAuth(req) { const t = new URL(req.url, `http://localhost`).searchParams.get('token'); if(!t) return false; try { const [u, p] = Buffer.from(t, 'base64').toString('utf8').split(':'); return u === config.auth.username && p === config.auth.password; } catch(e) { return false; } }

wss.on('connection', (ws, req) => {
  if (!checkWsAuth(req)) return ws.close(1008, 'Unauthorized');
  
  // 原有的单纯向前端推数据的轮询，SSH相关均已干掉
  const interval = setInterval(async () => { 
    await syncDatabase(); 
    db.prepare(`SELECT * FROM tasks WHERE status NOT IN ('complete', 'error')`).all().forEach(t => ws.send(JSON.stringify(t))); 
  }, 1500);
  ws.on('close', () => clearInterval(interval));
});

app.listen(PORT, () => console.log(`🚀 X Engine 启动成功: http://localhost:${PORT}`));
