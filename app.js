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
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'config.json');

function loadConfig() { 
  let cfg = { auth: { username: 'admin', password: 'password' }, aria2: [], openlist: [] }; 
  try { if (fs.existsSync(CONFIG_FILE)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch (e) {} 
  return cfg; 
}
const saveConfig = (c) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));

let config = loadConfig();

function checkAuth(req) {
  const auth = req.headers.authorization;
  if (!auth) return false;
  try {
    const [u, p] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    return u === config.auth.username && p === config.auth.password;
  } catch(e) { return false; }
}

app.post('/api/login', (req, res) => {
  if (req.body.username === config.auth.username && req.body.password === config.auth.password) {
    res.json({ success: true, token: Buffer.from(`${req.body.username}:${req.body.password}`).toString('base64') });
  } else res.status(401).json({ success: false });
});

app.use('/api', (req, res, next) => { if(checkAuth(req)) next(); else res.status(401).send(); });

const db = new Database('downloads.db');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, gid TEXT, url TEXT, filename TEXT, total_size INTEGER, downloaded_size INTEGER, speed INTEGER, progress REAL, status TEXT, engine TEXT, hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
try { db.exec('ALTER TABLE tasks ADD COLUMN url TEXT'); } catch(e){}

const aria2 = {
  async call(idx, method, params = []) {
    const srv = config.aria2[idx]; if(!srv) throw new Error('Aria2节点未配置');
    const r = await axios.post(srv.url, { jsonrpc:'2.0', id:Date.now(), method:`aria2.${method}`, params:[`token:${srv.secret}`, ...params] }, {timeout:5000});
    if (r.data.error) throw new Error(r.data.error.message);
    return r.data.result;
  }
};

// --- 全局与引擎配置 API ---
app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => { config = req.body; saveConfig(config); res.json({success:true}); });

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

// --- 任务操作 API ---
app.get('/api/tasks/:id/details', async (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id); if(!t) return res.json({success:false, error:'记录不存在'});
  try {
    const idx = parseInt(t.engine.split('_')[1]);
    const r = await aria2.call(idx, 'tellStatus', [t.gid]);
    res.json({success:true, engine:'Aria2', data:r, files:(r.files||[]).map(f=>({name:f.path.split(/[\\/]/).pop(), size:parseInt(f.length)}))});
  } catch(e){ res.json({success:false, error:'引擎连接失败'}); }
});

app.post('/api/tasks/:id/:act', async (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id); if(!t) return res.json({success:false});
  try {
    const idx = parseInt(t.engine.split('_')[1]);
    if(req.params.act==='pause') await aria2.call(idx, 'pause', [t.gid]);
    else if(req.params.act==='resume') await aria2.call(idx, 'unpause', [t.gid]);
    else if(req.params.act==='delete') await aria2.call(idx, 'remove', [t.gid]);
  } catch(e){} 
  if(req.params.act==='pause') db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(t.id);
  if(req.params.act==='resume') db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(t.id);
  if(req.params.act==='delete') db.prepare("DELETE FROM tasks WHERE id=?").run(t.id);
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
    } catch(e){}
    if(action==='pause') db.prepare("UPDATE tasks SET status='paused' WHERE id=?").run(id);
    if(action==='resume') db.prepare("UPDATE tasks SET status='downloading' WHERE id=?").run(id);
    if(action==='delete') db.prepare("DELETE FROM tasks WHERE id=?").run(id);
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
  let aTasks = []; let aNodesInfo = [];
  let globalDlSpeed = 0; let globalUpSpeed = 0;

  if (config.aria2) {
    for(let i=0; i<config.aria2.length; i++) {
      try {
        const [a, w, s, stat] = await Promise.all([
          aria2.call(i,'tellActive'), 
          aria2.call(i,'tellWaiting',[0,1000]), 
          aria2.call(i,'tellStopped',[0,1000]),
          aria2.call(i,'getGlobalStat')
        ]);
        
        const allTasks = [...a, ...w, ...s];
        // 核心修复：把节点序号 i 加入唯一 ID，绝对杜绝多节点 GID 冲突
        aTasks = aTasks.concat(allTasks.filter(t=>t.status!=='removed').map(t=>({...t, _eng:`aria2_${i}`, _uid:`${i}_${t.gid}`})));
        
        let totalDl = 0; let totalUp = 0;
        allTasks.forEach(t => {
          totalDl += parseInt(t.completedLength)||0;
          totalUp += parseInt(t.uploadLength)||0;
        });
        
        const dlSpeed = parseInt(stat.downloadSpeed)||0;
        const upSpeed = parseInt(stat.uploadSpeed)||0;
        globalDlSpeed += dlSpeed; globalUpSpeed += upSpeed;
        
        aNodesInfo.push({ online: true, name: config.aria2[i].name, dlSpeed, upSpeed, totalDl, totalUp });
      } catch(e){ aNodesInfo.push({ online: false, name: config.aria2[i].name, dlSpeed:0, upSpeed:0, totalDl:0, totalUp:0 }); }
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
        
        // 使用 _uid 作为主键，彻底告别冲突
        db.prepare('INSERT INTO tasks (id, gid, filename, total_size, downloaded_size, speed, progress, status, engine) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, total_size=excluded.total_size, downloaded_size=excluded.downloaded_size, speed=excluded.speed, progress=excluded.progress, status=excluded.status')
          .run(t._uid, t.gid, fn, total, comp, speed, prog, st, t._eng);
      });
      
      db.prepare('SELECT id, engine FROM tasks').all().forEach(row => {
        if(!curIds.has(row.id)) {
          if (row.engine && row.engine.startsWith('aria2_')) {
            const idx = parseInt(row.engine.split('_')[1]);
            if (aNodesInfo[idx] && aNodesInfo[idx].online) db.prepare('DELETE FROM tasks WHERE id=?').run(row.id);
          } else { db.prepare('DELETE FROM tasks WHERE id=?').run(row.id); }
        }
      });
    })();
  } catch (err) { console.error('Sync Error:', err.message); }
  
  return { aria2Nodes: aNodesInfo, globalDlSpeed, globalUpSpeed };
}

app.get('/api/tasks', async (req, res) => { await syncDatabase(); res.json(db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()); });
app.get('/api/global-stats', async (req, res) => { res.json(await syncDatabase()); });

const wss = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  if(token !== Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64')) return ws.close();
  const timer = setInterval(async () => {
    await syncDatabase();
    ws.send(JSON.stringify(db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all()));
  }, 1500);
  ws.on('close', () => clearInterval(timer));
});


// 🔪 降维杀手 API：无视原有逻辑，直接代理强杀 Aria2
app.post('/api/force_kill_task', async (req, res) => {
    const { url, secret, gid } = req.body;
    if (!url || !gid) return res.json({success: false, error: '缺少参数'});
    
    const http = require('http'); const https = require('https');
    
    const makeReq = (method, params=[]) => new Promise(resolve => {
        try {
            // 将 JSON 转为 Buffer，精确计算字节长度！这是破局的核心！
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
                    'Content-Length': payloadBuffer.length // 强制告诉 Aria2 长度，拒绝分块传输！
                }, 
                timeout: 3000 
            }, (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e){ resolve({error: '解析失败'}); } });
            });
            request.on('error', (e) => resolve({error: e.message})); 
            request.write(payloadBuffer); // 发送精确的 Buffer
            request.end();
        } catch(e) { resolve({error: e.message}); }
    });

    // 真正的二连击绝杀：
    await makeReq('aria2.forceRemove', [gid]); // 强杀
    await new Promise(r => setTimeout(r, 600)); // 等 Aria2 反应半秒钟
    const removeRes = await makeReq('aria2.removeDownloadResult', [gid]); // 扬骨灰
    
    // 超度本地数据库
    try { if(typeof db !== 'undefined') { db.run('DELETE FROM downloads WHERE gid=?', [gid]); db.run('DELETE FROM tasks WHERE gid=?', [gid]); } } catch(e){}
    
    // 为了防止还有幺蛾子，我们把第二次清理的返回结果打印在日志里
    res.json({success: true, message: '任务已彻底删除', debug_res: removeRes});
});

app.listen(PORT, () => console.log('🚀 API Running on ' + PORT));
