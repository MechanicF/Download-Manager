const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSecureToken() {
  return crypto.createHmac('sha256', 'ManagerPro_Sec_2026').update(config.auth.username + ':' + config.auth.password).digest('hex');
}

const app = express();
const PORT = 1111;
const WS_PORT = 28080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'config.json');
function loadConfig() { 
  let cfg = { auth: { username: 'admin', password: 'password' }, aria2: [], openlist: [] };
  try { 
      if (fs.existsSync(CONFIG_FILE)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; 
  } catch (e) {
      console.error('配置加载异常:', e.message);
  } 
  return cfg;
}
const saveConfig = (c) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));

let config = loadConfig();

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth) return false;
  return auth.split(' ')[1] === getSecureToken();
}

app.post('/api/login', (req, res) => {
  if (req.body.username === config.auth.username && req.body.password === config.auth.password) {
    res.json({ success: true, token: getSecureToken() });
  } else res.status(401).json({ success: false });
});

app.use('/api', (req, res, next) => { if(checkAuth(req)) next(); else res.status(401).send(); });

const db = new Database('downloads.db');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, gid TEXT, url TEXT, filename TEXT, total_size INTEGER, downloaded_size INTEGER, speed INTEGER, progress REAL, status TEXT, engine TEXT, hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
try { db.exec('ALTER TABLE tasks ADD COLUMN url TEXT'); } catch(e){}
db.exec(`CREATE TABLE IF NOT EXISTS global_stats (engine TEXT PRIMARY KEY, historical_dl INTEGER DEFAULT 0, historical_up INTEGER DEFAULT 0)`);
try { db.exec('ALTER TABLE tasks ADD COLUMN uploaded_size INTEGER DEFAULT 0'); } catch(e){}

// 核心：安全删除并在咽气前记账 (已修复 SQL 拼接隐患)
function safeDeleteTask(field, value) {
  if (field !== 'id' && field !== 'gid') return; // 防御 SQL 注入白名单
  try {
    const t = db.prepare(`SELECT * FROM tasks WHERE ${field}=?`).get(value);
    if(t) {
        const dl = t.downloaded_size || 0; 
        const up = t.uploaded_size || 0;
        db.prepare(`INSERT INTO global_stats (engine, historical_dl, historical_up) VALUES (?, ?, ?) ON CONFLICT(engine) DO UPDATE SET historical_dl=historical_dl+?, historical_up=historical_up+?`).run(t.engine, dl, up, dl, up);
        db.prepare(`DELETE FROM tasks WHERE ${field}=?`).run(value);
    }
  } catch(e) {
      console.error('安全删除任务失败:', e.message);
  }
}

const aria2 = {
  async call(idx, method, params = []) {
    const srv = config.aria2[idx];
    if(!srv) throw new Error('Aria2节点未配置');
    const r = await axios.post(srv.url, { jsonrpc:'2.0', id:Date.now(), method:`aria2.${method}`, params:[`token:${srv.secret}`, ...params] }, {timeout:15000});
    if (r.data.error) throw new Error(r.data.error.message);
    return r.data.result;
  }
};

// --- 全局与引擎配置 API ---
app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => { config = req.body; saveConfig(config); res.json({success:true, newToken: getSecureToken()}); });
app.get('/api/engine/aria2/:id/config', async (req, res) => { 
  try { res.json({ success: true, data: await aria2.call(parseInt(req.params.id), 'getGlobalOption') }); } 
  catch(e) { res.json({success:false, error:e.message}); } 
});
app.post('/api/engine/aria2/:id/config', async (req, res) => { 
  try { await aria2.call(parseInt(req.params.id), 'changeGlobalOption', [req.body]); res.json({success:true}); } 
  catch(e) { res.json({success:false, error:e.message}); } 
});

// --- OpenList 云盘 API ---
function getOlConf(idx) { return config.openlist[idx || 0]; }
app.post('/api/openlist/list', async (req, res) => { const c = getOlConf(req.body.olIdx); if(!c) return res.status(400).json({error:'未配置云盘'}); try { res.json((await axios.post(`${c.url}/api/fs/list`, { path: req.body.path||"/", password: "", page: 1, per_page: 0, refresh: true }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/get', async (req, res) => { const c = getOlConf(req.body.olIdx); try { res.json((await axios.post(`${c.url}/api/fs/get`, { path: req.body.path, password: "" }, { headers: { 'Authorization': c.token||'' }, timeout: 10000 })).data); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/openlist/rename', async (req, res) => { const c=getOlConf(req.body.olIdx); try{res.json((await axios.post(`${c.url}/api/fs/rename`,{name:req.body.name,path:req.body.path},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });
app.post('/api/openlist/remove', async (req, res) => { const c=getOlConf(req.body.olIdx); try{res.json((await axios.post(`${c.url}/api/fs/remove`,{dir:req.body.dir,names:req.body.names},{headers:{'Authorization':c.token||''}})).data);}catch(e){res.status(500).json({error:e.message});} });

// --- 聚合搜索与 MoviePilot ---
app.post('/api/pansou/search', async (req, res) => {
    const { keyword } = req.body;
    const pUrl = config.pansou_url || Buffer.from('aHR0cDovLzM4Ljc2LjIwNC4xMTQ6ODA1L2FwaS9zZWFyY2g/a3c9e2t9', 'base64').toString();
    try {
        const targetUrl = pUrl.replace('{k}', encodeURIComponent(keyword));
        const r = await axios.get(targetUrl, { timeout: 15000 });
        res.json({ success: true, data: r.data });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/moviepilot/recognize', async (req, res) => {
    const { filename } = req.body;
    // 已更新为新的 MoviePilot 目标地址
    const mpUrl = config.moviepilot_url || Buffer.from('aHR0cDovLzM4Ljc2LjIwNC4xMTQ6MzAwMA==', 'base64').toString();
    const mpToken = config.moviepilot_token || Buffer.from('TWVjaGFuaWNGXzIwMjZfU3VwZXJTZWNyZXQ=', 'base64').toString();
    
    try {
        const r = await axios.get(mpUrl.replace(/\/$/, '') + '/api/v1/media/recognize2', {
            params: { title: filename, token: mpToken },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' }
        });
        const d = r.data;
        if (d && d.media_info) {
            let name = d.media_info.title || d.meta_info?.title || '';
            if (name) name = name.replace(/\s+/g, '.').replace(/[\(\)]/g, '');
            if (d.media_info.year) name += '.' + d.media_info.year;
            if (d.meta_info && d.meta_info.begin_season != null) name += '.S' + String(d.meta_info.begin_season).padStart(2,'0');
            if (d.meta_info && d.meta_info.begin_episode != null) name += '.E' + String(d.meta_info.begin_episode).padStart(2,'0');
            res.json({ success: true, cleanName: name });
        } else { 
            res.json({ success: false, error: '未能识别出媒体信息' });
        }
    } catch (e) {
        res.json({ success: false, error: e.response?.status ? 'MP报错(' + e.response.status + ')' : '请求失败' });
    }
});

app.get('/api/tasks/:id/details', async (req, res) => {
  try {
    const id = req.params.id;
    const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
    if (!t) return res.json({ success: false, error: '任务不存在或已被彻底清除' });

    const idx = parseInt(t.engine.split('_')[1]);
    const status = await aria2.call(idx, 'tellStatus', [t.gid]);

    const files = (status.files || []).map(f => {
        let name = f.path ? f.path.split(/[\\/]/).pop() : '未知文件';
        if (!f.path && f.uris && f.uris.length > 0) {
            name = decodeURIComponent(f.uris[0].uri.split('/').pop().split('?')[0]);
        }
        return { name: name, size: parseInt(f.length) || 0 };
    });

    res.json({
        success: true,
        engine: config.aria2[idx] ? config.aria2[idx].name : t.engine,
        data: {
            dir: status.dir || '未知',
            connections: status.connections || 0,
            numPieces: status.numPieces || 0,
            infoHash: status.infoHash || ''
        },
        files: files
    });
  } catch (e) {
    res.json({ success: false, error: 'Aria2 引擎查询失败: ' + e.message });
  }
});

app.post('/api/tasks/:id/:act', async (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id); if(!t) return res.json({success:false});
  try {
    const idx = parseInt(t.engine.split('_')[1]);
    if(req.params.act==='pause') await aria2.call(idx, 'pause', [t.gid]);
    else if(req.params.act==='resume') await aria2.call(idx, 'unpause', [t.gid]);
    else if(req.params.act==='delete') await aria2.call(idx, 'remove', [t.gid]);
  } catch(e){
      console.error(`单任务操作失败 (${req.params.act}):`, e.message);
  } 
  if(req.params.act==='pause') db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(t.id);
  if(req.params.act==='resume') db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(t.id);
  if(req.params.act==='delete') safeDeleteTask('id', t.id);
  res.json({success:true});
});

app.post('/api/tasks/batch', async (req, res) => {
  const { ids, action } = req.body;
  for (const id of ids) {
    const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if(!t) continue;
    try {
      const idx = parseInt(t.engine.split('_')[1]);
      if(action==='pause') { const tk = db.prepare('SELECT gid FROM tasks WHERE id=?').get(id); if(tk) await aria2.call(idx, 'pause', [tk.gid]); }
      else if(action==='resume') { const tk = db.prepare('SELECT gid FROM tasks WHERE id=?').get(id); if(tk) await aria2.call(idx, 'unpause', [tk.gid]); }
      else if(action==='delete') { const tk = db.prepare('SELECT gid FROM tasks WHERE id=?').get(id); if(tk) await aria2.call(idx, 'remove', [tk.gid]); }
    } catch(e){
        console.error(`批量操作失败 (${action}):`, e.message);
    }
    if(action==='pause') db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(id);
    if(action==='resume') db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(id);
    if(action==='delete') safeDeleteTask('id', id);
  }
  res.json({success:true});
});

// --- 下载与投递 ---
let cachedTrackers = "";
async function getTrackers() {
  if(cachedTrackers) return cachedTrackers;
  try { const res = await axios.get('https://cf.trackerslist.com/best.txt', {timeout: 3000}); cachedTrackers = res.data.trim().replace(/\n/g, ','); return cachedTrackers; } 
  catch(e) { return ""; }
}

app.post('/api/download', async (req, res) => {
  const { url, engine, headers } = req.body; const urls = url.split(/[\n,]/).map(u=>u.trim()).filter(u=>u);
  if(urls.length===0) return res.json({success:false, error:'地址为空'});
  if(!config.aria2 || config.aria2.length===0) return res.json({success:false, error:'请先配置Aria2节点'});
  
  let sc = 0; let lastErr = '';
  for (const dlUrl of urls) {
    let target = engine === 'auto' ? 'aria2_0' : engine;
    try {
      const idx = parseInt(target.split('_')[1]);
      let opts = {};
      if (headers) { let arr = []; for(const [k,v] of Object.entries(headers)) arr.push(`${k}: ${v}`); if(arr.length>0) opts.header = arr; }
      if (dlUrl.toLowerCase().startsWith('magnet:') || dlUrl.toLowerCase().includes('.torrent')) { const tk = await getTrackers(); if(tk) opts['bt-tracker'] = tk; }
      
      const gid = await aria2.call(idx, 'addUri', [[dlUrl], opts]);
      db.prepare("INSERT OR REPLACE INTO tasks (id, url, engine, status) VALUES (?, ?, ?, 'waiting')").run(gid, dlUrl, target);
      sc++;
    } catch (e) { lastErr = e.message; }
  }
  if(sc>0) res.json({success:true, message:`成功投递 ${sc} 个任务`});
  else res.json({success:false, error: lastErr||'投递失败'});
});

app.post('/api/upload', async (req, res) => {
  const { engine, fileBase64, filename } = req.body;
  if (!config.aria2 || config.aria2.length === 0) return res.json({ success: false, error: '请先配置 Aria2 节点' });
  let target = engine === 'auto' ? 'aria2_0' : engine;
  try {
    const idx = parseInt(target.split('_')[1]);
    const gid = await aria2.call(idx, 'addTorrent', [fileBase64]);
    db.prepare("INSERT OR REPLACE INTO tasks (id, filename, engine, status) VALUES (?, ?, ?, 'waiting')").run(gid, filename || '本地种子.torrent', target);
    res.json({ success: true, message:'种子已上传' });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// --- 数据同步核心 ---
async function syncDatabase() {
  let aTasks = [];
  let aNodesInfo = [];
  let globalDlSpeed = 0; let globalUpSpeed = 0;
  
  if (config.aria2) {
    for(let i=0; i<config.aria2.length; i++) {
      try {
        const [a, w, s, stat] = await Promise.all([
          aria2.call(i,'tellActive'), 
          aria2.call(i,'tellWaiting',[0,200]), 
          aria2.call(i,'tellStopped',[0,200]),
          aria2.call(i,'getGlobalStat')
        ]);
        const allTasks = [...a, ...w, ...s];
        aTasks = aTasks.concat(allTasks.filter(t=>t.status!=='removed').map(t=>({...t, _eng:`aria2_${i}`, _uid:`${i}_${t.gid}`})));
        
        let totalDl = 0; let totalUp = 0;
        allTasks.forEach(t => {
          totalDl += parseInt(t.completedLength)||0;
          totalUp += parseInt(t.uploadLength)||0;
        });
        const dlSpeed = parseInt(stat.downloadSpeed)||0;
        const upSpeed = parseInt(stat.uploadSpeed)||0;
        globalDlSpeed += dlSpeed; globalUpSpeed += upSpeed;
        const h = db.prepare('SELECT historical_dl, historical_up FROM global_stats WHERE engine=?').get(`aria2_${i}`);
        const finalDl = totalDl + (h ? h.historical_dl : 0);
        const finalUp = totalUp + (h ? h.historical_up : 0);
        aNodesInfo.push({ online: true, name: config.aria2[i].name, dlSpeed, upSpeed, totalDl: finalDl, totalUp: finalUp });
      } catch(e){ 
          aNodesInfo.push({ online: false, name: config.aria2[i].name, dlSpeed:0, upSpeed:0, totalDl:0, totalUp:0 });
      }
    }
  }

  try {
    db.transaction(() => {
      const curIds = new Set();
      aTasks.forEach(t => {
        curIds.add(t._uid); 
        const total = parseInt(t.totalLength)||0, comp = parseInt(t.completedLength)||0;
        const speed = parseInt(t.downloadSpeed)||0, prog = total ? (comp/total*100) : 0;
        const st = t.status==='active' ? 'downloading' : t.status;
        
        let fn = '解析中...';
        try {
          if (t.bittorrent && t.bittorrent.info && t.bittorrent.info.name) fn = t.bittorrent.info.name;
          else if (t.files && t.files.length > 0 && t.files[0].path) fn = t.files[0].path.split(/[\\/]/).pop();
          else if (t.files && t.files.length > 0 && t.files[0].uris && t.files[0].uris.length > 0) fn = decodeURIComponent(t.files[0].uris[0].uri.split('/').pop().split('?')[0]);
        } catch(e) {}
        if (!fn || fn === '[METADATA]' || fn === '') fn = '种子元数据下载中...';
        
        const up = parseInt(t.uploadLength)||0;
        db.prepare('INSERT INTO tasks (id, gid, filename, total_size, downloaded_size, uploaded_size, speed, progress, status, engine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, total_size=excluded.total_size, downloaded_size=excluded.downloaded_size, uploaded_size=excluded.uploaded_size, speed=excluded.speed, progress=excluded.progress, status=excluded.status')
          .run(t._uid, t.gid, fn, total, comp, up, speed, prog, st, t._eng);
      });
      
      db.prepare('SELECT id, engine FROM tasks').all().forEach(row => {
        if(!curIds.has(row.id)) {
          if (row.engine && row.engine.startsWith('aria2_')) {
            const idx = parseInt(row.engine.split('_')[1]);
            if (aNodesInfo[idx] && aNodesInfo[idx].online) safeDeleteTask('id', row.id);
          } else { safeDeleteTask('id', row.id); }
        }
      });
    })();
  } catch (err) { console.error('Sync Error:', err.message); }
  
  return { aria2Nodes: aNodesInfo, globalDlSpeed, globalUpSpeed };
}

app.get('/api/tasks', async (req, res) => { await syncDatabase(); res.json(db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()); });
app.get('/api/global-stats', async (req, res) => { res.json(await syncDatabase()); });

// 修复：添加了摘要对比，避免产生毫无意义的全量广播消耗 CPU
const wss = new WebSocket.Server({ port: WS_PORT });
let lastBroadcastPayload = ""; 

setInterval(async () => {
  if (wss.clients.size === 0) return; 
  await syncDatabase();
  const payload = JSON.stringify(db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all());
  
  if (payload === lastBroadcastPayload) return; // 数据无变化则跳过网络发送
  lastBroadcastPayload = payload;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
      client.send(payload);
    }
  });
}, 1500);

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  if(token !== getSecureToken()) return ws.close();
  ws.isAuthenticated = true; 
});

// 修复 SSRF 漏洞：加入目标 URL 白名单校验
app.post('/api/force_kill_task', async (req, res) => {
    const { url, secret, gid } = req.body;
    if (!url || !gid) return res.json({success: false, error: '缺少参数'});
    
    // 防御 SSRF：强制要求被杀任务的 URL 必须在当前配置的 Aria2 节点列表中
    const isValidTarget = config.aria2 && config.aria2.some(node => node.url === url);
    if (!isValidTarget) return res.json({success: false, error: '非法的请求目标：该 RPC 地址不在允许的配置名单内'});
    
    const http = require('http'); const https = require('https');
    
    const makeReq = (method, params=[]) => new Promise(resolve => {
        try {
            const payloadBuffer = Buffer.from(JSON.stringify({ 
                jsonrpc: '2.0', id: 'kill_'+Date.now(), method, 
                params: secret ? [`token:${secret}`, ...params] : params 
            }), 'utf8');
            
            const { URL } = require('url'); const u = new URL(url);
            const client = u.protocol === 'https:' ? https : http;
            
            const request = client.request(url, { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': payloadBuffer.length
                }, 
                timeout: 3000 
            }, (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e){ resolve({error: '解析失败'}); } });
            });
            request.on('error', (e) => resolve({error: e.message})); 
            request.write(payloadBuffer);
            request.end();
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

app.listen(PORT, () => console.log('🚀 API Running on ' + PORT));