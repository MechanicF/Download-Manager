const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 1111;
const WS_PORT = 28080;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const COOKIE_FILE = path.join(__dirname, 'qbit_cookie.txt');

function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) {}
  return { 
    aria2: { url: 'http://154.51.248.18:6800/jsonrpc', secret: '178aefc5e49e1f559501' }, 
    qbit: { baseUrl: 'http://154.51.248.18:8999/api/v2', username: 'admin', password: 'fan196123' },
    wsPort: WS_PORT
  };
}

function saveConfig(config) { 
  config.wsPort = config.wsPort || WS_PORT;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); 
}

function loadCookie() { 
  try { return fs.existsSync(COOKIE_FILE) ? fs.readFileSync(COOKIE_FILE, 'utf8').trim() : null; } 
  catch (e) { return null; } 
}

function saveCookie(cookie) { fs.writeFileSync(COOKIE_FILE, cookie); }

function detectEngine(url) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('magnet:') || lowerUrl.includes('.torrent') || lowerUrl.includes('tracker=') || lowerUrl.includes('btih:')) return 'qbit';
  return 'aria2';
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0;
  if (typeof sizeStr === 'number') return sizeStr;
  const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4 };
  return value * (units[unit] || 1);
}

let config = loadConfig();
let qbitCookies = loadCookie();

const db = new Database('downloads.db');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, filename TEXT DEFAULT '未知文件', total_size INTEGER DEFAULT 0,
  downloaded_size INTEGER DEFAULT 0, speed INTEGER DEFAULT 0, progress REAL DEFAULT 0,
  status TEXT DEFAULT 'waiting', engine TEXT DEFAULT 'aria2', hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const aria2 = {
  async call(method, params = []) {
    try {
      const payload = { jsonrpc: '2.0', id: Date.now(), method: `aria2.${method}`, params: [`token:${config.aria2.secret}`, ...params] };
      const res = await axios.post(config.aria2.url, payload, { timeout: 15000 });
      return res.data.result;
    } catch (err) {
      console.error(`[Aria2 ${method} 错误]:`, err.response?.data || err.message);
      throw err;
    }
  },
  async addUri(urls, options = {}) {
    const urlArray = Array.isArray(urls) ? urls : [urls];
    return this.call('addUri', [urlArray, options]);
  },
  async tellStatus(gid, keys) { return this.call('tellStatus', [gid, keys || []]); },
  async getFiles(gid) { return this.call('getFiles', [gid]); },
  async remove(gid) { return this.call('remove', [gid]); },
  async pause(gid) { return this.call('pause', [gid]); },
  async unpause(gid) { return this.call('unpause', [gid]); },
  async getVersion() { return this.call('getVersion'); },
  async getGlobalStat() { return this.call('getGlobalStat'); }
};

const qbit = {
  async request(endpoint, method = 'GET', data = null) {
    const configReq = { method, url: `${config.qbit.baseUrl}${endpoint}`, timeout: 15000 };
    if (data) {
      if (data instanceof FormData) configReq.data = data;
      else { configReq.data = data; configReq.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; }
    }
    if (qbitCookies) configReq.headers = { ...configReq.headers, 'Cookie': qbitCookies };
    try { return (await axios(configReq)).data; }
    catch (err) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        await this.login();
        if (qbitCookies) { configReq.headers = { ...configReq.headers, 'Cookie': qbitCookies }; return (await axios(configReq)).data; }
      }
      throw err;
    }
  },
  async login() {
    try {
      const res = await axios.post(`${config.qbit.baseUrl}/auth/login`,
        `username=${encodeURIComponent(config.qbit.username)}&password=${encodeURIComponent(config.qbit.password)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
      if (res.data === 'Ok.') {
        const setCookie = res.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) { qbitCookies = setCookie[0].split(';')[0]; saveCookie(qbitCookies); return true; }
      }
      return false;
    } catch (err) { console.error('QBit登录失败:', err.message); return false; }
  },
  async checkConnection() {
    try { await axios.get(`${config.qbit.baseUrl}/app/version`, { headers: qbitCookies ? { 'Cookie': qbitCookies } : {}, timeout: 5000 }); return true; }
    catch (err) { return err.response?.status !== 403 && err.response?.status !== 401 ? true : await this.login(); }
  },
  async addTorrent(url) { const formData = new FormData(); formData.append('urls', url); return this.request('/torrents/add', 'POST', formData); },
  async getTorrents() { return this.request('/torrents/info'); },
  async getTorrentProperties(hash) { return this.request(`/torrents/properties?hash=${hash}`); },
  async getTorrentFiles(hash) { return this.request(`/torrents/files?hash=${hash}`); },
  async getTorrentPeers(hash) { return this.request(`/torrents/peers?hash=${hash}`); },
  async getTorrentTrackers(hash) { return this.request(`/torrents/trackers?hash=${hash}`); },
  async deleteTorrent(hash, deleteFiles = false) { return this.request('/torrents/delete', 'POST', `hashes=${hash}&deleteFiles=${deleteFiles}`); },
  async pauseTorrent(hash) { return this.request('/torrents/pause', 'POST', `hashes=${hash}`); },
  async resumeTorrent(hash) { return this.request('/torrents/resume', 'POST', `hashes=${hash}`); }
};

// API 路由
app.get('/api/config', (req, res) => { res.json({ ...config, wsPort: config.wsPort || WS_PORT }); });

app.post('/api/config', (req, res) => { 
  config = { ...config, ...req.body, wsPort: config.wsPort || WS_PORT }; 
  saveConfig(config); 
  qbitCookies = null; 
  res.json({ success: true }); 
});

app.post('/api/test-connection', async (req, res) => {
  const { type } = req.body;
  try {
    if (type === 'aria2') { await aria2.getVersion(); res.json({ success: true }); }
    else if (type === 'qbit') { const ok = await qbit.login(); res.json({ success: ok, error: ok ? null : '登录失败' }); }
  } catch (err) { res.json({ success: false, error: err.message }); }
});

app.get('/api/global-stats', async (req, res) => {
  let aria2Ok = false, qbitOk = false;
  let aria2Speed = 0, qbitSpeed = 0;
  try { 
    const v = await aria2.getVersion(); 
    aria2Ok = true; 
    const gs = await aria2.getGlobalStat();
    aria2Speed = parseInt(gs.downloadSpeed) || 0;
  } catch (e) {}
  try { 
    qbitOk = await qbit.checkConnection(); 
    const torrents = await qbit.getTorrents();
    qbitSpeed = torrents.reduce((sum, t) => sum + (t.dlspeed || 0), 0);
  } catch (e) {}
  res.json({ aria2: aria2Ok, qbit: qbitOk, aria2Speed, qbitSpeed });
});

app.post('/api/download', async (req, res) => {
  const { url, engine } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
  
  const urls = url.split(/[\n,]/).map(u => u.trim()).filter(u => u && u.length > 0);
  if (urls.length === 0) return res.status(400).json({ success: false, error: '无效的 URL' });
  
  console.log(`[添加下载] ${urls.length} 个链接`);
  const results = [];
  
  for (const downloadUrl of urls) {
    const autoEngine = engine || detectEngine(downloadUrl);
    console.log(`  - ${downloadUrl.substring(0, 40)}... (${autoEngine})`);
    
    try {
      if (autoEngine === 'aria2') {
        const gid = await aria2.addUri(downloadUrl, { dir: '/downloads' });
        
        // 延迟获取文件名
        setTimeout(async () => {
          try {
            const files = await aria2.getFiles(gid);
            if (files && files.length > 0) {
              // Aria2返回的文件格式可能是 {path: "...", length: "..."}
              let filename = '未知文件';
              if (files[0].path) {
                filename = files[0].path.split('/').pop();
              } else if (files[0].uri) {
                filename = files[0].uri.split('/').pop();
              }
              console.log(`[获取文件名] ${gid}: ${filename}`);
              db.prepare(`UPDATE tasks SET filename = ? WHERE id = ?`).run(filename, gid);
            }
          } catch(e) { console.error('[获取文件名失败]', e.message); }
        }, 2000);
        
        db.prepare(`INSERT OR REPLACE INTO tasks (id, url, filename, status, engine) VALUES (?, ?, ?, ?, ?)`)
          .run(gid, downloadUrl, '等待中...', 'waiting', 'aria2');
        results.push({ success: true, id: gid, engine: 'aria2', url: downloadUrl });
        
      } else if (autoEngine === 'qbit') {
        if (!qbitCookies) await qbit.login();
        if (!qbitCookies) { 
          results.push({ success: false, error: 'QBit 登录失败', url: downloadUrl }); 
          continue;
        }
        
        await qbit.addTorrent(downloadUrl);
        await new Promise(r => setTimeout(r, 3000));
        const torrents = await qbit.getTorrents();
        
        const latest = torrents.find(t => t.downloaded === 0 || t.progress < 1) || torrents[0];
        
        if (latest) {
          const taskId = `qbit_${latest.hash}`;
          db.prepare(`INSERT OR REPLACE INTO tasks (id, url, filename, status, engine, hash) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(taskId, downloadUrl, latest.name, 'downloading', 'qbit', latest.hash);
          results.push({ success: true, id: taskId, engine: 'qbit', url: downloadUrl });
        } else {
          results.push({ success: false, error: '添加种子失败', url: downloadUrl });
        }
      }
    } catch (error) {
      console.error(`[添加失败] ${downloadUrl}: ${error.message}`);
      results.push({ success: false, error: error.message, url: downloadUrl });
    }
  }
  
  const allSuccess = results.every(r => r.success);
  res.json({ 
    success: allSuccess, 
    results: results,
    message: `${results.filter(r => r.success).length}/${urls.length} 个任务添加成功`
  });
});

app.get('/api/tasks', async (req, res) => {
  try {
    const { sort } = req.query;
    let orderBy = 'created_at DESC';
    if (sort === 'name') orderBy = 'filename ASC';
    else if (sort === 'size') orderBy = 'total_size DESC';
    else if (sort === 'progress') orderBy = 'progress DESC';
    else if (sort === 'speed') orderBy = 'speed DESC';
    
    let tasks = db.prepare(`SELECT * FROM tasks ORDER BY ${orderBy}`).all();
    
    let qbitTorrents = [];
    try { qbitTorrents = await qbit.getTorrents(); } catch (e) { console.error('[QBit 获取列表失败]', e.message); }
    
    for (const task of tasks) {
      if (task.status === 'complete' || task.status === 'error') continue;
      
      try {
        if (task.engine === 'aria2') {
          try {
            const status = await aria2.tellStatus(task.id, ['status', 'totalLength', 'completedLength', 'downloadSpeed', 'uploadSpeed', 'files', 'errorCode', 'paused']);
            const files = status.files || [];
            const file = files[0] || {};
            const total = parseInt(status.totalLength) || 0;
            const completed = parseInt(status.completedLength) || 0;
            const progress = total > 0 ? (completed / total * 100) : 0;
            
            let dbStatus = status.status;
            if (status.errorCode && status.errorCode !== '0') dbStatus = 'error';
            if (status.paused) dbStatus = 'paused';
            
            // 获取文件名
            let filename = task.filename;
            if (file.path) {
              filename = file.path.split('/').pop();
            } else if (file.uri) {
              filename = file.uri.split('/').pop();
            }
            
            db.prepare(`UPDATE tasks SET progress = ?, speed = ?, total_size = ?, downloaded_size = ?, status = ?, filename = ? WHERE id = ?`)
              .run(progress, status.downloadSpeed || 0, total, completed, dbStatus, filename, task.id);
          } catch (ae) {
            console.error(`[Aria2更新错误] ${task.id}: ${ae.message}`);
            if (ae.response?.status === 400 || ae.response?.status === 404) {
              db.prepare(`UPDATE tasks SET status = 'complete', progress = 100 WHERE id = ?`).run(task.id);
            }
          }
          
        } else if (task.engine === 'qbit' && task.hash) {
          const t = qbitTorrents.find(x => x.hash === task.hash);
          
          if (t) {
            const totalSize = parseSize(t.size);
            const downloadedSize = parseSize(t.downloaded);
            const progress = t.progress * 100;
            const statusMap = {
              'downloading': 'downloading', 'metaDL': 'waiting', 'pausedDL': 'paused', 'pausedUP': 'paused',
              'queuedDL': 'waiting', 'queuedUP': 'queuedUP', 'uploading': 'uploading',
              'stalledDL': 'stalled', 'stalledUP': 'stalledUP', 'checkingUP': 'checking', 'checkingDL': 'checking',
              'forcedDL': 'downloading', 'forcedUP': 'uploading', 'error': 'error'
            };
            const dbStatus = statusMap[t.state] || t.state;
            
            db.prepare(`UPDATE tasks SET progress = ?, speed = ?, total_size = ?, downloaded_size = ?, status = ?, filename = ? WHERE id = ?`)
              .run(progress, t.dlspeed || 0, totalSize, downloadedSize, dbStatus, t.name, task.id);
          } else {
            db.prepare(`UPDATE tasks SET status = 'complete', progress = 100 WHERE id = ?`).run(task.id);
          }
        }
      } catch (e) { console.error(`[更新错误] ${task.id}: ${e.message}`); }
    }
    
    tasks = db.prepare(`SELECT * FROM tasks ORDER BY ${orderBy}`).all();
    res.json(tasks);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  try {
    if (task.engine === 'aria2') await aria2.remove(task.id);
    else if (task.engine === 'qbit' && task.hash) await qbit.deleteTorrent(task.hash);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id); res.json({ success: true }); }
});

app.post('/api/tasks/:id/pause', async (req, res) => { 
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  try {
    if (task.engine === 'aria2') await aria2.pause(task.id);
    else if (task.engine === 'qbit' && task.hash) await qbit.pauseTorrent(task.hash);
    db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.post('/api/tasks/:id/resume', async (req, res) => { 
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  try {
    if (task.engine === 'aria2') await aria2.unpause(task.id);
    else if (task.engine === 'qbit' && task.hash) await qbit.resumeTorrent(task.hash);
    db.prepare(`UPDATE tasks SET status = 'downloading' WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); } 
});

app.post('/api/tasks/:id/delete', async (req, res) => {
  const { deleteFiles } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  try {
    if (task.engine === 'aria2') await aria2.remove(task.id);
    else if (task.engine === 'qbit' && task.hash) await qbit.deleteTorrent(task.hash, deleteFiles || false);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id); res.json({ success: true }); }
});

// WebSocket
const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`🔌 WebSocket 启动在 ws://localhost:${WS_PORT}`);

wss.on('connection', (ws) => {
  console.log('✅ WebSocket 客户端连接');
  
  const interval = setInterval(async () => {
    try {
      const tasks = db.prepare("SELECT * FROM tasks WHERE status IN ('downloading', 'waiting', 'uploading', 'stalled', 'stalledUP')").all();
      let qbitTorrents = [];
      try { qbitTorrents = await qbit.getTorrents(); } catch (e) {}
      
      for (const task of tasks) {
        try {
          let status = {};
          if (task.engine === 'aria2') {
            const s = await aria2.tellStatus(task.id, ['status', 'totalLength', 'completedLength', 'downloadSpeed', 'files']);
            const files = s.files || [];
            const file = files[0] || {};
            const total = parseInt(s.totalLength) || 1;
            const completed = parseInt(s.completedLength) || 0;
            
            let filename = task.filename;
            if (file.path) filename = file.path.split('/').pop();
            else if (file.uri) filename = file.uri.split('/').pop();
            
            status = { 
              id: task.id, 
              progress: (completed / total * 100).toFixed(1), 
              speed: s.downloadSpeed || 0, 
              status: s.status, 
              filename: filename
            };
          } else if (task.engine === 'qbit' && task.hash) {
            const t = qbitTorrents.find(x => x.hash === task.hash);
            if (t) status = { id: task.id, progress: (t.progress * 100).toFixed(1), speed: t.dlspeed || 0, status: t.state, filename: t.name };
          }
          if (status.id) ws.send(JSON.stringify(status));
        } catch (e) {}
      }
    } catch (e) {}
  }, 1500);

  ws.on('close', () => { clearInterval(interval); console.log('❌ WebSocket 客户端断开'); });
});

app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
