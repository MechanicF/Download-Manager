/* ==========================================
 * Download Manager Pro - Core Logic
 * ========================================== */

let authToken = localStorage.getItem('manager_auth_token') || '';
    let tasks = []; let deadTasks = new Set(); let sysConfig = {}; let ws = null;
    let currentTaskFilter = 'all'; let selectedTasks = new Set();
    let currentOpenListPath = '/'; let olFiles = []; let olSelected = new Set(); 
    let olSortBy = 'name'; let olSortDesc = false;

    let savedSort = localStorage.getItem('dm_task_sort') || 'created_at_desc'; 
    let sortParts = savedSort.split('_'); let taskSortDesc = sortParts.pop() === 'desc'; let taskSortBy = sortParts.join('_');

    function showToast(m, t='success'){ const d = document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<span>${t==='success'?'✅':'❌'}</span> <span>${m}</span>`; document.getElementById('toast-container').appendChild(d); setTimeout(()=>d.remove(), 3000); }
    function formatSize(b) { if(!b) return '0 B'; const k=1024, s=['B','KB','MB','GB','TB'], i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(2)+' '+s[i]; }
    function formatTime(s) { if(!s||s===Infinity) return '--:--:--'; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sc=Math.floor(s%60); return `${h>0?h+'h ':''}${m}m ${sc}s`; }
    function showModal(id){ document.getElementById(id).classList.add('show'); }
    function hideModal(id){ document.getElementById(id).classList.remove('show'); }
    function toggleMobileMenu(){ const s=document.querySelector('.sidebar'), o=document.getElementById('mobile-overlay'); if(s)s.classList.toggle('open'); if(o)o.classList.toggle('show'); }
    function closeMobileMenu(){ const s=document.querySelector('.sidebar'), o=document.getElementById('mobile-overlay'); if(s)s.classList.remove('open'); if(o)o.classList.remove('show'); }
    function toggleTheme(){ const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',t); localStorage.setItem('dm_theme',t); }

    async function api(u, o={}){
      const h = {'Content-Type':'application/json'}; if(authToken) h['Authorization']='Bearer '+authToken;
      const r = await fetch(u, {headers:h, ...o});
      if(r.status===401){ document.getElementById('login-screen').style.display='flex'; return {error:'Unauthorized'}; }
      const txt = await r.text(); try { return JSON.parse(txt); } catch(e) { throw new Error('HTTP ' + r.status + ' ' + txt.substring(0,40)); }
    }

    async function doLogin(){
      const u=document.getElementById('login-user').value, p=document.getElementById('login-pass').value;
      const r=await api('/api/login',{method:'POST',body:JSON.stringify({username:u,password:p})});
      if(r.success){ authToken=r.token; localStorage.setItem('manager_auth_token',authToken); location.reload(); }
      else showToast('账号或密码错误', 'error');
    }
    function doLogout(){ localStorage.removeItem('manager_auth_token'); location.reload(); }

    
    
    let globalPansouItems = []; // 保存全局搜索结果
    let currentPansouFilter = 'all';

    async function doPansouSearch() {
        const k = document.getElementById('pansou-keyword').value.trim();
        if (!k) return showToast('请输入搜索关键字', 'warning');
        const btn = document.getElementById('btn-pansou-search');
        btn.disabled = true; btn.textContent = '检索中...';
        document.getElementById('pansou-results').innerHTML = `<div style="text-align:center; padding:100px 20px; color:var(--text-muted); display:flex; flex-direction:column; align-items:center;">
        <svg viewBox="0 0 24 24" style="width:40px; height:40px; margin-bottom:20px; animation:spin-slow 1s linear infinite; stroke:var(--primary); stroke-width:2.5; fill:none; stroke-linecap:round; stroke-linejoin:round;">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <div style="font-size:15px; font-weight:600; color:var(--text-main); letter-spacing:1px; animation:blink 2s infinite;">正在检索全网资源...</div>
        <div style="font-size:12px; margin-top:8px; opacity:0.6;">穿透引擎节点，这通常需要几秒钟</div>
    </div>`;
        document.getElementById('pansou-filter-bar').style.display = 'none';

        try {
            const r = await api('/api/pansou/search', { method: 'POST', body: JSON.stringify({ keyword: k }) });
            if (r.success) {
                let items = [];
                const rawData = r.data.data || r.data;
                
                // 提取并拍扁数据
                if (rawData.merged_by_type) {
                    for (const [diskType, fileList] of Object.entries(rawData.merged_by_type)) {
                        if (Array.isArray(fileList)) {
                            fileList.forEach(file => {
                                file._diskType = diskType;
                                items.push(file);
                            });
                        }
                    }
                } else {
                    items = Array.isArray(rawData) ? rawData : (rawData.items || rawData.list || []);
                    items.forEach(file => { if(!file._diskType) file._diskType = 'other'; });
                }

                globalPansouItems = items;

                if (globalPansouItems.length === 0) {
                    document.getElementById('pansou-results').innerHTML = '<div style="text-align:center; padding:80px; color:var(--text-muted);">未找到相关资源 📭</div>';
                    return;
                }

                // 生成顶部分类过滤按钮
                renderPansouFilters();
                // 渲染全部结果
                renderPansouResults('all');

            } else {
                document.getElementById('pansou-results').innerHTML = `<div style="text-align:center; padding:80px; color:var(--danger);">搜索失败: ${r.error}</div>`;
            }
        } catch(e) {
            document.getElementById('pansou-results').innerHTML = '<div style="text-align:center; padding:80px; color:var(--danger);">请求异常，请检查后端网络</div>';
        } finally {
            btn.disabled = false; btn.textContent = '🔍 搜索全网';
        }
    }

    function renderPansouFilters() {
        const types = new Set(globalPansouItems.map(item => item._diskType || 'other'));
        const filterBar = document.getElementById('pansou-filter-bar');
        
        if (types.size <= 1) {
            filterBar.style.display = 'none';
            return;
        }

        let html = `<button class="btn ${currentPansouFilter === 'all' ? 'btn-primary' : 'btn-default'} btn-sm" onclick="renderPansouResults('all')">全部 (${globalPansouItems.length})</button>`;
        
        Array.from(types).sort().forEach(type => {
            const count = globalPansouItems.filter(i => (i._diskType || 'other') === type).length;
            const displayName = type.toUpperCase();
            html += `<button class="btn ${currentPansouFilter === type ? 'btn-primary' : 'btn-default'} btn-sm" onclick="renderPansouResults('${type}')">${displayName} (${count})</button>`;
        });

        filterBar.innerHTML = html;
        filterBar.style.display = 'flex';
    }

    function renderPansouResults(filterType) {
        currentPansouFilter = filterType;
        renderPansouFilters(); // 刷新按钮高亮状态

        const filteredItems = filterType === 'all' 
            ? globalPansouItems 
            : globalPansouItems.filter(item => (item._diskType || 'other') === filterType);

        if (filteredItems.length === 0) {
             document.getElementById('pansou-results').innerHTML = '<div style="text-align:center; padding:50px; color:var(--text-muted);">该分类下暂无资源</div>';
             return;
        }

        let h = '<table class="ol-table"><tr><th>资源名称</th><th style="width:150px;">附加信息</th><th style="width:140px;">操作</th></tr>';
        filteredItems.forEach(item => {
            const name = escapeHtml(item.note || item.title || item.name || '未知资源');
            const link = item.url || item.link || '';
            const diskTag = item._diskType ? `<span style="background:var(--primary-light); color:var(--primary); padding:2px 6px; border-radius:4px; font-size:11px; margin-right:6px; font-weight:bold;">${item._diskType.toUpperCase()}</span>` : '';
            const pwdTag = item.password ? `<span style="color:var(--warning); font-size:11px; border:1px solid var(--warning); padding:1px 4px; border-radius:4px; margin-left:6px;" title="提取码: ${item.password}">🔑 ${item.password}</span>` : '';
            const meta = (item.datetime || item.date || '').split('T')[0] || item.size || '-';
            
            h += `<tr>
                <td style="word-break:break-all; font-weight:500; color:var(--text-main);">${diskTag}${name}${pwdTag}</td>
                <td style="color:var(--text-muted); font-size:12px;">${meta}</td>
                <td>
                    <a href="${link}" target="_blank" class="btn btn-info btn-sm" style="text-decoration:none; background:#722ed1;">🔗 打开</a>
                    <button class="btn btn-default btn-sm" onclick="copyText('${link}${item.password ? ' 提取码:' + item.password : ''}')">📋 复制</button>
                </td>
            </tr>`;
        });
        h += '</table>';
        document.getElementById('pansou-results').innerHTML = h;
    }
    

    function copyText(txt) {
        if (!txt) return showToast('链接为空', 'warning');
        if(navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(txt); }
        else { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
        showToast('链接已复制到剪贴板');
    }

    function switchTab(id, el){
      document.querySelectorAll('.section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
      const targetSec = document.getElementById('section-'+id);
      if(targetSec) { targetSec.classList.add('active'); targetSec.style.display = 'flex'; }
      
      document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active')); if(el) el.classList.add('active');
      if(id==='settings') loadConfig();
      if(id==='openlist' && (typeof olFiles === 'undefined' || olFiles.length===0)) loadOpenList();
      if(typeof closeMobileMenu === 'function') closeMobileMenu();
    }

    let currentEditEngineId = 0; let isRawConfigMode = false;
    const aria2ConfigMap = [
      { key: 'dir', label: '📂 默认下载路径', desc: '文件保存的绝对路径 (如 /downloads)' },
      { key: 'max-concurrent-downloads', label: '🚦 最大并行任务数', desc: '同时允许下载的任务数量' },
      { key: 'continue', label: '⏯️ 断点续传', desc: '开启后自动恢复下载', type: 'boolean' },
      
      { key: 'split', label: '🔪 单文件最大线程', desc: '下载单个文件时使用的最大连接数 (1-16)' },
      { key: 'max-connection-per-server', label: '🌐 单服务器最大连接', desc: '每个服务器允许的最大连接数 (1-16)' },
      { key: 'min-split-size', label: '🧩 最小分片大小', desc: '文件分块大小 (如: 1M, 10M)', type: 'size' },
      
      { key: 'max-overall-download-limit', label: '⬇️ 全局下载限速', desc: '0 为不限速 (如: 1M, 100K)', type: 'size' },
      { key: 'max-overall-upload-limit', label: '⬆️ 全局上传限速', desc: '0 为不限速 (如: 1M, 100K)', type: 'size' },
      { key: 'max-download-limit', label: '🔽 单任务下载限速', desc: '0 为不限速', type: 'size' },
      { key: 'max-upload-limit', label: '🔼 单任务上传限速', desc: '0 为不限速', type: 'size' },
      
      { key: 'user-agent', label: '🥸 UA 伪装', desc: '自定义 User-Agent 请求头，防盗链必备' },
      { key: 'referer', label: '🔗 默认 Referer', desc: '自定义引用页，用于突破防盗链' },
      { key: 'all-proxy', label: '🌍 全局代理', desc: '所有流量走代理 (例如: http://127.0.0.1:7890)' },
      
      { key: 'bt-max-peers', label: '🕸️ BT 最大连接数', desc: '每个 BT 任务的最大节点连接数 (默认 55)' },
      { key: 'enable-dht', label: '📡 启用 DHT 网络', desc: '无 Tracker 也能寻找节点', type: 'boolean' },
      { key: 'enable-peer-exchange', label: '🔄 启用 PEX 交换', desc: 'Peer 交换机制', type: 'boolean' },
      { key: 'bt-tracker', label: '🎯 默认 Tracker', desc: '逗号分隔的 BT Tracker 列表' },
      { key: 'seed-time', label: '🌱 做种时间 (分钟)', desc: '0 为不做种，PT玩家建议留空或加大' },
      { key: 'seed-ratio', label: '⚖️ 做种分享率', desc: '达到指定分享率后停止做种 (如 1.0, 1.5)' },
      
      { key: 'disk-cache', label: '💾 磁盘缓存大小', desc: '内存写盘缓存，极大减少机械盘磨损', type: 'size' },
      { key: 'file-allocation', label: '📦 文件预分配机制', desc: 'none, prealloc, trunc, falloc' }
    ];

    function toggleConfigMode() {
      isRawConfigMode = !isRawConfigMode;
      document.getElementById('engine-config-visual').style.display = isRawConfigMode ? 'none' : 'grid';
      document.getElementById('engine-config-raw').style.display = isRawConfigMode ? 'flex' : 'none';
      document.getElementById('btn-toggle-cfg').innerHTML = isRawConfigMode ? '🎨 切换至可视化模式' : '💻 切换至源码模式';
      if (isRawConfigMode) {
        try {
          let payload = JSON.parse(document.getElementById('engine-config-json-input').value || '{}');
          aria2ConfigMap.forEach(item => { const el = document.getElementById(`cfg-${item.key}`); if(el) payload[item.key] = el.value; });
          document.getElementById('engine-config-json-input').value = JSON.stringify(payload, null, 2);
        } catch(e) {}
      }
    }

    async function openEngineConfigView(idx) {
      currentEditEngineId = idx; isRawConfigMode = false; 
      document.getElementById('engine-config-visual').style.display = 'grid';
      document.getElementById('engine-config-raw').style.display = 'none';
      document.getElementById('btn-toggle-cfg').innerHTML = '💻 切换至源码模式';
      
      switchTab('engine-config');
      document.getElementById('engine-config-title').textContent = `⚙️ 参数调优 (节点 ${idx+1})`;
      const vContainer = document.getElementById('engine-config-visual');
      vContainer.innerHTML = '<div style="color:var(--primary); padding:20px; font-weight:bold; font-size:16px;">正在拉取引擎底层配置...</div>';
      document.getElementById('engine-config-json-input').value = '拉取中...';
      
      const r = await api(`/api/engine/aria2/${idx}/config`);
      if(r.success) {
        document.getElementById('engine-config-json-input').value = JSON.stringify(r.data, null, 2);
        let formHtml = '';
        // 智能字节逆向转换 (Byte -> KB/MB)
        const formatSize = (v) => {
            if(!v || isNaN(v)) return v;
            const b = parseInt(v);
            if (b === 0) return '0';
            if (b >= 1048576 && b % 1048576 === 0) return (b / 1048576) + 'M';
            if (b >= 1024 && b % 1024 === 0) return (b / 1024) + 'K';
            return v;
        };

        aria2ConfigMap.forEach(item => {
          let val = r.data[item.key] !== undefined ? r.data[item.key] : '';
          let inputHtml = '';
          
          if (item.type === 'boolean') {
              const selT = val === 'true' ? 'selected' : '';
              const selF = val === 'false' ? 'selected' : '';
              inputHtml = `<select id="cfg-${item.key}" class="form-control" style="border-color:#d9d9d9; font-weight:600; color:var(--primary); cursor:pointer;">
                  <option value="true" ${selT}>开启 (true)</option>
                  <option value="false" ${selF}>关闭 (false)</option>
              </select>`;
          } else {
              if (item.type === 'size') val = formatSize(val);
              inputHtml = `<input type="text" id="cfg-${item.key}" class="form-control" value="${val}" style="border-color:#d9d9d9; font-family:monospace; color:var(--primary); font-weight:600;">`;
          }
          
          formHtml += `<div class="config-card" style="margin-bottom:0; display:flex; flex-direction:column; justify-content:center; box-shadow:var(--shadow-sm); border-top:3px solid var(--primary-light);">
              <label style="font-weight:bold; color:var(--text-main); margin-bottom:6px; font-size:14px;">${item.label}</label>
              <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px; min-height:36px;">${item.desc}</div>
              ${inputHtml}
            </div>`;
        });
        vContainer.innerHTML = formHtml;
      } else { vContainer.innerHTML = `<div style="color:var(--danger); padding:20px;">拉取失败: ${r.error}</div>`; }
    }

    async function saveEngineConfig() {
      let payload = {};
      if (isRawConfigMode) {
        try { payload = JSON.parse(document.getElementById('engine-config-json-input').value); } catch(e) { return showToast('JSON 格式错误，请检查语法', 'error'); }
      } else {
        try { payload = JSON.parse(document.getElementById('engine-config-json-input').value || '{}'); } catch(e) { payload = {}; }
        aria2ConfigMap.forEach(item => { const el = document.getElementById(`cfg-${item.key}`); if(el) payload[item.key] = el.value; });
      }
      
      const btn = event.currentTarget; const orgText = btn.innerHTML;
      btn.innerHTML = '🔄 应用中...'; btn.disabled = true;
      const r = await api(`/api/engine/aria2/${currentEditEngineId}/config`, {method:'POST', body:JSON.stringify(payload)});
      btn.innerHTML = orgText; btn.disabled = false;
      if(r.success) { showToast('Aria2 参数已应用生效！'); switchTab('settings'); } else showToast('保存失败: ' + r.error, 'error');
    }

    function toggleTaskType(){
      const t = document.querySelector('input[name="task_type"]:checked').value;
      document.getElementById('box-url').style.display = t==='url'?'block':'none';
      document.getElementById('box-torrent').style.display = t==='torrent'?'block':'none';
    }
    
    function showNewTaskModal() {
        if(document.getElementById('url-input')) document.getElementById('url-input').value = '';
        if(document.getElementById('torrent-file')) document.getElementById('torrent-file').value = '';
        if(document.getElementById('t-name')) document.getElementById('t-name').textContent = '未选择文件';
        if(document.querySelector('input[name="task_type"][value="url"]')) document.querySelector('input[name="task_type"][value="url"]').checked = true;
        toggleTaskType(); populateSelects(); showModal('new-task-modal');
    }

    function changeTaskSort() { 
      const val = document.getElementById('task-sort-select').value; localStorage.setItem('dm_task_sort', val); 
      const parts = val.split('_'); taskSortDesc = parts.pop() === 'desc'; taskSortBy = parts.join('_'); renderTasks(); triggerListAnimation(); 
    }

    async function loadConfig(){
      const r = await api('/api/config'); if(r.error) return; sysConfig = r;
      document.getElementById('panel-user').value = r.auth?.username || 'admin';
      if(r.llm) {
          document.getElementById('cfg-llm-enable').checked = r.llm.enabled || false;
          document.getElementById('cfg-llm-global').checked = r.llm.global || false;
          document.getElementById('cfg-llm-provider').value = r.llm.provider || 'openai';
          document.getElementById('cfg-llm-url').value = r.llm.url || '';
          document.getElementById('cfg-llm-key').value = r.llm.key || '';
          document.getElementById('cfg-llm-model').value = r.llm.model || '';
      }
      if(typeof renderVoSettings === 'function') renderVoSettings();
      
      const isMpCustom = r.moviepilot_url && r.moviepilot_url.length > 0 && r.moviepilot_url !== atob('aHR0cDovLzM4Ljc2LjIwNC4xMTQ6MzAwMA==');
      const mpToggle = document.getElementById('mp-mode-toggle');
      if(mpToggle) { mpToggle.checked = !isMpCustom; toggleMpMode(); }
      if(document.getElementById('mp-url')) document.getElementById('mp-url').value = isMpCustom ? r.moviepilot_url : '';
      if(document.getElementById('mp-token')) document.getElementById('mp-token').value = isMpCustom ? r.moviepilot_token : '';

      const isPanCustom = r.pansou_url && r.pansou_url.length > 0 && r.pansou_url !== atob('aHR0cDovLzM4Ljc2LjIwNC4xMTQ6ODA1L2FwaS9zZWFyY2g/a3c9e2t9');
      const psToggle = document.getElementById('ps-mode-toggle');
      if(psToggle) { psToggle.checked = !isPanCustom; togglePansouMode(); }
      if(document.getElementById('pansou-url')) document.getElementById('pansou-url').value = isPanCustom ? r.pansou_url : '';
      
      const a2 = document.getElementById('aria2-nodes-container'); a2.innerHTML = '';
      (r.aria2||[]).forEach((n,i)=>{
        a2.innerHTML += `<div class="config-card">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
            <span style="font-weight:bold; color:var(--text-main);">节点 ${i+1}</span>
            <div><button class="btn btn-default btn-sm" onclick="openEngineConfigView(${i})">⚙️ 参数</button><button onclick="this.parentElement.parentElement.parentElement.remove()" style="border:none;background:none;font-size:16px;cursor:pointer;color:var(--text-muted);margin-left:10px;">✖</button></div>
          </div>
          <input type="text" class="form-control a2-name" value="${n.name}" style="margin-bottom:8px;" placeholder="节点名称">
          <input type="text" class="form-control a2-url" value="${n.url}" style="margin-bottom:8px;" placeholder="http://ip:6800/jsonrpc">
          <input type="password" class="form-control a2-sec" value="${n.secret}" placeholder="RPC 密钥">
        </div>`;
      });
      const ol = document.getElementById('ol-accounts-container'); ol.innerHTML = '';
      (r.openlist||[]).forEach((n,i)=>{
        ol.innerHTML += `<div class="config-card"><button onclick="this.parentElement.remove()" style="position:absolute;top:10px;right:10px;border:none;background:none;font-size:16px;cursor:pointer;color:var(--text-muted);">✖</button>
          <input type="text" class="form-control ol-name" value="${n.name}" style="margin-bottom:8px;" placeholder="云盘名称">
          <input type="text" class="form-control ol-url" value="${n.url}" style="margin-bottom:8px;" placeholder="API 地址">
          <input type="password" class="form-control ol-token" value="${n.token}" placeholder="Token">
        </div>`;
      });
    }

    function addAria2NodeForm(){ document.getElementById('aria2-nodes-container').innerHTML += `<div class="config-card"><button onclick="this.parentElement.remove()" style="position:absolute;top:10px;right:10px;border:none;background:none;font-size:16px;cursor:pointer;">✖</button><input type="text" class="form-control a2-name" value="新Aria2节点" style="margin-bottom:8px;"><input type="text" class="form-control a2-url" placeholder="http://ip:6800/jsonrpc" style="margin-bottom:8px;"><input type="password" class="form-control a2-sec" placeholder="RPC 密钥"></div>`; }
    function addOlAccount(){ document.getElementById('ol-accounts-container').innerHTML += `<div class="config-card"><button onclick="this.parentElement.remove()" style="position:absolute;top:10px;right:10px;border:none;background:none;font-size:16px;cursor:pointer;">✖</button><input type="text" class="form-control ol-name" value="新网盘" style="margin-bottom:8px;"><input type="text" class="form-control ol-url" placeholder="http://..." style="margin-bottom:8px;"><input type="password" class="form-control ol-token" placeholder="Token"></div>`; }

    async function saveSettings(){
      const aria2 = []; document.querySelectorAll('#aria2-nodes-container .config-card').forEach(c=>{ aria2.push({name:c.querySelector('.a2-name').value, url:c.querySelector('.a2-url').value, secret:c.querySelector('.a2-sec').value}); });
      const openlist = []; document.querySelectorAll('#ol-accounts-container .config-card').forEach(c=>{ openlist.push({name:c.querySelector('.ol-name').value, url:c.querySelector('.ol-url').value, token:c.querySelector('.ol-token').value}); });
      const isMpCustom = !document.getElementById('mp-mode-toggle').checked;
      const mpUrl = isMpCustom ? document.getElementById('mp-url').value : '';
      const mpToken = isMpCustom ? document.getElementById('mp-token').value : '';
      const isPsCustom = !document.getElementById('ps-mode-toggle').checked;
      const psUrl = isPsCustom ? document.getElementById('pansou-url').value : '';
      const u = document.getElementById('panel-user').value; const p = document.getElementById('panel-pass').value || sysConfig.auth.password;
      const llm_cfg = { enabled: document.getElementById('cfg-llm-enable').checked, global: document.getElementById('cfg-llm-global').checked, provider: document.getElementById('cfg-llm-provider').value, url: document.getElementById('cfg-llm-url').value, key: document.getElementById('cfg-llm-key').value, model: document.getElementById('cfg-llm-model').value };
      
      await api('/api/config',{method:'POST',body:JSON.stringify({aria2, openlist, moviepilot_url:mpUrl, moviepilot_token:mpToken, pansou_url: psUrl,
        vo_nodes: (function(){
        const names = document.querySelectorAll('.vo-node-name');
        const urls = document.querySelectorAll('.vo-node-url');
        const arr = [];
        if(names && urls) {
            for(let i=0; i<names.length; i++){
                if(names[i].value || urls[i].value) {
                    arr.push({ id: i+1, name: names[i].value.trim(), url: urls[i].value.trim() });
                }
            }
        }
        return arr;
    })(), auth:{username:u, password:p}, llm: llm_cfg})});
      showToast('核心配置保存成功！');
      authToken = sysConfig.newToken || authToken; localStorage.setItem('manager_auth_token', authToken); document.getElementById('panel-pass').value='';
      sysConfig = await api('/api/config'); if(sysConfig.newToken) authToken = sysConfig.newToken; populateSelects(); refreshTasks();
    }

    function populateSelects(){
      const curTask = document.getElementById('task-engine-select') ? document.getElementById('task-engine-select').value : null;
      const curOlEng = document.getElementById('ol-engine-select') ? document.getElementById('ol-engine-select').value : null;
      const curOlAcc = document.getElementById('ol-account-select') ? document.getElementById('ol-account-select').value : null;

      let h = '';
      (sysConfig.aria2||[]).forEach((n,i)=> h+=`<option value="aria2_${i}">🟣 Aria2: ${n.name}</option>`);
      if(!h) h = '<option value="">请先配置下载器</option>';
      if(document.getElementById('task-engine-select')) { document.getElementById('task-engine-select').innerHTML = h; if(curTask) document.getElementById('task-engine-select').value = curTask; }
      if(document.getElementById('ol-engine-select')) { document.getElementById('ol-engine-select').innerHTML = h; if(curOlEng) document.getElementById('ol-engine-select').value = curOlEng; }
      
      let o = ''; (sysConfig.openlist||[]).forEach((n,i)=> o+=`<option value="${i}">☁️ ${n.name}</option>`);
      if(document.getElementById('ol-account-select')) { 
          document.getElementById('ol-account-select').innerHTML = o || '<option value="">请先添加云盘</option>';
          if(curOlAcc && sysConfig.openlist && sysConfig.openlist.length > curOlAcc) document.getElementById('ol-account-select').value = curOlAcc;
      }
    }

    async function refreshTasks(){
      const s = await api('/api/global-stats');
      if(s.error) return;
      window.aria2NodeStatus = s.aria2Nodes || [];
      if (document.getElementById('global-speed')) document.getElementById('global-speed').innerHTML = `⬇️ ${formatSize(s.globalDlSpeed)}/s <span style="color:var(--border-color);margin:0 5px;">|</span> ⬆️ ${formatSize(s.globalUpSpeed)}/s`;
      
      let html = '';
      (s.aria2Nodes||[]).forEach((n,i) => {
        if (n.online) {
           html += `<div style="margin-bottom:16px; background:var(--bg-body); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                      <div style="font-weight:600; color:var(--text-main); font-size:13px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🟣 ${n.name}</span> <span style="color:var(--success); font-size:11px; background:#f6ffed; border:1px solid #b7eb8f; padding:2px 6px; border-radius:10px;">在线</span>
                      </div>
                      <div style="font-size:12px; color:var(--text-muted); line-height:1.8; margin-top:8px; border-top:1px dashed var(--border-color); padding-top:8px;">
                         <div style="display:flex; justify-content:space-between;"><span>下载速度</span><span style="color:var(--primary); font-weight:600;">${formatSize(n.dlSpeed)}/s</span></div>
                         <div style="display:flex; justify-content:space-between;"><span>上传速度</span><span style="color:var(--warning); font-weight:600;">${formatSize(n.upSpeed)}/s</span></div>
                         <div style="display:flex; justify-content:space-between;"><span>总下载量</span><span>${formatSize(n.totalDl)}</span></div>
                         <div style="display:flex; justify-content:space-between;"><span>总上传量</span><span>${formatSize(n.totalUp)}</span></div>
                      </div>
                    </div>`;
        } else {
           html += `<div style="margin-bottom:16px; background:var(--bg-body); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); opacity:0.6;">
                      <div style="font-weight:600; color:var(--text-main); font-size:13px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🟣 ${n.name}</span> <span style="color:var(--danger); font-size:11px; background:#fff2f0; border:1px solid #ffccc7; padding:2px 6px; border-radius:10px;">离线</span>
                      </div>
                    </div>`;
        }
      });
      if (document.getElementById('sidebar-engines-status')) document.getElementById('sidebar-engines-status').innerHTML = html || '<div style="text-align:center; padding:20px; color:var(--warning); border:1px dashed var(--warning); border-radius:var(--radius-sm);">未配置任何引擎节点</div>';
    }

    function filterTasks(f, el){ document.querySelectorAll('.sub-item').forEach(i=>i.classList.remove('active')); el.classList.add('active'); currentTaskFilter = f; selectedTasks.clear(); renderTasks(); triggerListAnimation(); switchTab('downloads', document.querySelector('.sidebar-menu .nav-item')); closeMobileMenu(); }
    function toggleTask(id, c) { if(c) selectedTasks.add(id); else selectedTasks.delete(id); document.getElementById('task-select-all').checked = getFilteredTasks().length>0 && selectedTasks.size===getFilteredTasks().length;}
    function toggleAllTasks(c) { const f = getFilteredTasks(); if(c) f.forEach(t=>selectedTasks.add(t.id)); else selectedTasks.clear(); renderTasks(); }
    
    window.getTaskComputedState = (t) => {
        let st = t.status; let sp = t.speed;
        if(t.engine && t.engine.startsWith('aria2_')) {
            const idx = parseInt(t.engine.split('_')[1]);
            const nStat = window.aria2NodeStatus ? window.aria2NodeStatus[idx] : null;
                    if(!nStat || nStat.online === false) {
                if(st === 'downloading' || st === 'waiting') { st = 'error'; sp = 0; }
            }
        }
        return { ...t, status: st, speed: sp };
    };
function getFilteredTasks() { return tasks.map(window.getTaskComputedState).filter(t => currentTaskFilter==='all' || (currentTaskFilter==='downloading' && t.status==='downloading') || (currentTaskFilter==='waiting' && (t.status==='waiting'||t.status==='paused')) || (currentTaskFilter==='complete' && (t.status==='complete'||t.status==='error'))); }

    
    let globalTaskDeleteQueue = []; let isTaskDeleting = false; let taskDeleteStats = { total: 0, current: 0, success: 0, fail: 0 };

    async function batchTaskAction(act){
      if(selectedTasks.size===0) return showToast('请先选择任务', 'error');
      if(act==='delete' && !confirm(`确定删除选中的 ${selectedTasks.size} 个任务吗？`)) return;
      if(act === 'delete') {
          let added = 0;
          selectedTasks.forEach(id => {
              if (globalTaskDeleteQueue.some(q => q.id === id)) return; // 🛡️ 拦截：已在处决队列中的任务拒绝重复添加
              const parts = id.split('_'); const eIdx = parseInt(parts[0].replace('aria2', ''), 10) || 0; const gid = parts[1];
              const config = sysConfig.aria2[eIdx];
              const t = tasks.find(x => x.id === id); const name = t && t.filename ? t.filename : gid;
              if(config) { globalTaskDeleteQueue.push({ id, gid, url: config.url, secret: config.secret, name }); added++; }
          });
          taskDeleteStats.total += added; // 🧮 修复：分母只增加本次真正新塞进去的数量
          selectedTasks.clear(); processTaskDeleteQueue();
      } else { 
          await api('/api/tasks/batch', {method:'POST', body:JSON.stringify({ids:Array.from(selectedTasks), action:act})}); 
          selectedTasks.clear(); showToast('指令已下发'); refreshTasks();
      }
    }
    
    async function singleAction(id, act, btn){ 
        if(act==='delete' && !confirm('确认彻底删除该任务及其记录吗？')) return; 
        if(btn) { btn.style.opacity='0.5'; btn.disabled=true; }
        if(act === 'delete') {
            if (globalTaskDeleteQueue.some(q => q.id === id)) return; // 🛡️ 防重发
            const parts = id.split('_'); const eIdx = parseInt(parts[0].replace('aria2', ''), 10) || 0; const gid = parts[1];
            const config = sysConfig.aria2[eIdx];
            const t = tasks.find(x => x.id === id); const name = t && t.filename ? t.filename : gid;
            if(config) { 
                globalTaskDeleteQueue.push({ id, gid, url: config.url, secret: config.secret, name }); 
                taskDeleteStats.total += 1; processTaskDeleteQueue(); 
            }
        } else { try { await api(`/api/tasks/${id}/${act}`, {method:'POST'}); } finally { if(btn) { btn.style.opacity='1'; btn.disabled=false; } } }
    }

    async function processTaskDeleteQueue() {
  if (isTaskDeleting) return; isTaskDeleting = true; const qContainer = document.getElementById('push-queue-container');
  if (!document.getElementById('tdel')) {
    qContainer.insertAdjacentHTML('beforeend', `<div id="tdel" class="capsule-wrap" style="position:relative; display:flex; align-items:center; gap:10px; background:var(--hover-bg); padding:5px 16px; border-radius:20px; border:1px solid var(--border-color); animation:fadeIn 0.3s ease; max-width:450px; width:100%; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02); margin-left: 10px;">
         <span style="font-size:13px; font-weight:bold; color:var(--text-main); white-space:nowrap;">🗑️ 删除 <span id="txt-tdel-prog">0/0</span></span>
         <div style="flex:1; height:6px; background:var(--bg-body); border-radius:3px; overflow:hidden; min-width:60px; box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">
            <div id="bar-tdel-prog" style="height:100%; width:0%; background:linear-gradient(90deg, var(--primary), var(--success)); transition:width 0.2s ease;"></div>
         </div>
         <span style="font-size:12px; white-space:nowrap; display:flex; gap:6px; font-weight:600;"><span style="color:var(--success);">✅<span id="suc-tdel-prog">0</span></span><span style="color:var(--danger);">❌<span id="fail-tdel-prog">0</span></span></span>
         <div id="dropdown-tdel" class="queue-dropdown"></div>
      </div>`);
  }

  const updateUI = () => {
      const percent = Math.round((taskDeleteStats.current / taskDeleteStats.total) * 100);
      const bar = document.getElementById('bar-tdel-prog'); if(bar) bar.style.width = percent + '%';
      const txt = document.getElementById('txt-tdel-prog'); if(txt) txt.textContent = taskDeleteStats.current + '/' + taskDeleteStats.total;
      const suc = document.getElementById('suc-tdel-prog'); if(suc) suc.textContent = taskDeleteStats.success;
      const fail = document.getElementById('fail-tdel-prog'); if(fail) fail.textContent = taskDeleteStats.fail;
      
      const dp = document.getElementById('dropdown-tdel');
      if(dp) {
          if(globalTaskDeleteQueue.length === 0) dp.innerHTML = '<div class="queue-item" style="text-align:center;">队列已清空</div>';
          else dp.innerHTML = globalTaskDeleteQueue.slice(0, 50).map(t => `<div class="queue-item">⏳ ${t.name}</div>`).join('') + (globalTaskDeleteQueue.length>50?'<div class="queue-item" style="text-align:center;">... 还有更多</div>':'');
      }
  };

  const workers = [];
  for(let i=0; i<5; i++) {
      workers.push((async () => {
          while (globalTaskDeleteQueue.length > 0) {
              const task = globalTaskDeleteQueue.shift(); taskDeleteStats.current++;
              updateUI();
              try {
                  const r = await api('/api/force_kill_task', {method:'POST', body:JSON.stringify({url: task.url, secret: task.secret, gid: task.gid})});
                  if(r.success) { taskDeleteStats.success++; document.getElementById('t-'+task.id)?.remove(); deadTasks.add(task.id); } else taskDeleteStats.fail++;
              } catch (e) { taskDeleteStats.fail++; }
              updateUI();
          }
      })());
  }
  await Promise.all(workers);

  const barFinal = document.getElementById('bar-tdel-prog'); if(barFinal) barFinal.style.background = 'var(--success)';
  
  setTimeout(() => {
    const el = document.getElementById('tdel');
    if(el && globalTaskDeleteQueue.length === 0) { 
       el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; el.style.transition = 'all 0.4s ease'; 
       setTimeout(() => { if(globalTaskDeleteQueue.length === 0) { el.remove(); taskDeleteStats = { total: 0, current: 0, success: 0, fail: 0 }; } }, 400); 
    }
  }, 4000);
  isTaskDeleting = false;
}
    

    function triggerListAnimation() {
        const list = document.getElementById('task-list');
        if(list) {
            list.style.animation = 'none';
            void list.offsetWidth; // 触发重排，重置动画状态
            list.style.animation = 'slideFadeIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards';
        }
    }
    function renderTasks(){
      
      const getTaskComputedState = (t) => {
          let st = t.status; let sp = t.speed;
          if(t.engine && t.engine.startsWith('aria2_')) {
              const idx = parseInt(t.engine.split('_')[1]);
              if(window.aria2NodeStatus && window.aria2NodeStatus[idx] && window.aria2NodeStatus[idx].online === false) {
                  if(st === 'downloading' || st === 'waiting') { st = 'error'; sp = 0; }
              }
          }
          return { ...t, status: st, speed: sp };
      };
      const computedTasks = tasks.map(window.getTaskComputedState);
      const dl = computedTasks.filter(t => t.status === 'downloading').length; 
      const wt = computedTasks.filter(t => t.status === 'waiting' || t.status === 'paused').length; 
      const cp = computedTasks.filter(t => t.status === 'complete' || t.status === 'error').length;
      const updateTxt = (id, txt) => { const el = document.getElementById(id); if(el && el.textContent !== String(txt)) el.textContent = txt; };
      updateTxt('cnt-all', tasks.length > 0 ? `(${tasks.length})` : ''); updateTxt('cnt-dl', dl > 0 ? `(${dl})` : ''); updateTxt('cnt-wt', wt > 0 ? `(${wt})` : ''); updateTxt('cnt-cp', cp > 0 ? `(${cp})` : '');

      const list = document.getElementById('task-list'); let filtered = getFilteredTasks(); 
      
      filtered.sort((a,b)=>{
        let c=0;
        if(taskSortBy==='created_at') c = (a.created_at ? new Date(a.created_at.replace(' ','T')+'Z').getTime() : 0) - (b.created_at ? new Date(b.created_at.replace(' ','T')+'Z').getTime() : 0);
        else if(taskSortBy==='name') c = (a.filename||'').localeCompare(b.filename||'', undefined, {numeric: true, sensitivity: 'base'});
        else if(taskSortBy==='size') c = a.total_size - b.total_size;
        else if(taskSortBy==='progress') c = a.progress - b.progress;
        return taskSortDesc ? -c : c;
      });

      const cIds = new Set(filtered.map(t=>t.id));
      Array.from(list.children).forEach(c=>{ if(c.id === 'empty-state-view') return; if(!cIds.has(c.id.replace('t-',''))) c.remove(); });
      
      const selectAllCb = document.getElementById('task-select-all');
      if(selectAllCb) selectAllCb.checked = filtered.length > 0 && selectedTasks.size === filtered.length;

      if(filtered.length===0) {
        if(list.dataset.emptyFilter === currentTaskFilter) return; 
        list.dataset.emptyFilter = currentTaskFilter;
        let eIco = '📭', eTxt = '任务列表空空如也', eSub = '您可以前往【云端文件】挑选并推送资源';
        if (currentTaskFilter === 'downloading') { eIco = '🚀'; eTxt = '当前没有正在下载的任务'; eSub = '去新建任务添加几个下载链接吧！'; }
        else if (currentTaskFilter === 'waiting') { eIco = '⏸️'; eTxt = '没有被暂停或等待中的任务'; eSub = '所有任务都在顺利进行中 ~'; }
        else if (currentTaskFilter === 'complete') { eIco = '✅'; eTxt = '还没有已完成的任务'; eSub = '下载完成的任务将会显示在这里'; }
        list.innerHTML = `<div id="empty-state-view" style="text-align:center;padding:120px 20px;color:var(--text-muted);animation: fadeIn 0.15s ease-out;"><div style="font-size:65px;margin-bottom:20px;display:inline-block;animation: float 3s ease-in-out infinite;">${eIco}</div><div style="font-size:17px;font-weight:600;color:var(--text-main);letter-spacing:1px;">${eTxt}</div><div style="font-size:13px;margin-top:12px;opacity:0.7;">${eSub}</div></div>`;
        return;
      }
      list.dataset.emptyFilter = ''; const emptyView = document.getElementById('empty-state-view'); if(emptyView) emptyView.remove();

      filtered.forEach((t, i) => {
        let card = document.getElementById('t-'+t.id);
        // 修复A：严谨截断进度，防止超限与 100.00% 这种诡异小数显示
        let progNum = t.progress ? parseFloat(t.progress) : 0;
        if (progNum > 100) progNum = 100;
        if (progNum < 0) progNum = 0;
        const progStr = (progNum === 0 || progNum === 100) ? progNum.toString() : progNum.toFixed(2);
        
        const eTag = t.engine.startsWith('aria2_') && sysConfig.aria2 ? '🟣 '+sysConfig.aria2[t.engine.split('_')[1]]?.name : t.engine;
        
        // 修复B：拦截极端情况下的负数 ETA (预计时间)
        const eta = t.speed > 0 && t.total_size >= t.downloaded_size ? (t.total_size - t.downloaded_size)/t.speed : 0;
        
        if(!card){
          card = document.createElement('div'); card.id = 't-'+t.id;
          card.innerHTML = `<div class="task-header"><div class="task-title" style="flex:1; display:flex; align-items:flex-start;"><input type="checkbox" style="margin-right:12px; margin-top:4px;" class="cb"> <span class="nm" style="word-break:break-all; font-weight:600;"></span></div><div class="task-actions"></div></div><div class="progress-wrapper"><div class="progress-bar" style="width:0%;"></div><div class="progress-text" style="position:absolute;width:100%;text-align:center;font-size:10px;font-weight:bold;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6);z-index:1;"></div></div><div class="task-meta" style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted);"><div class="meta-left"><span style="background:var(--bg-body);padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid var(--border-color);" class="tg"></span> <span class="st" style="font-weight:600;margin-left:8px;"></span> <span style="color:var(--border-color);margin:0 8px;">|</span> <span class="inf"></span></div><div class="meta-right"></div></div>`;
        }
        
        if (card.className !== `task-card ${t.status}`) card.className = `task-card ${t.status}`;
        const cb = card.querySelector('.cb'); if (cb.checked !== selectedTasks.has(t.id)) cb.checked = selectedTasks.has(t.id); cb.onchange = (e) => toggleTask(t.id, e.target.checked);
        
        const safeTxt = (cls, val) => { const el = card.querySelector(cls); if(el && el.textContent !== String(val)) el.textContent = val; };
        
        // 修复C：当总大小为0（如下载磁力元数据时），显示“未知大小”而不是 0 B
        const totalStr = t.total_size > 0 ? formatSize(t.total_size) : '未知大小';
        safeTxt('.nm', t.filename || '解析中...'); safeTxt('.progress-text', progStr+'%'); safeTxt('.tg', eTag); safeTxt('.inf', `${formatSize(t.downloaded_size)} / ${totalStr}`);
        
        // 修复D：通过 dataset 缓存杜绝浏览器 CSS String 自动转换引发的进度条恶性重绘与闪烁
        const targetWidth = progStr + '%';
        if (card.dataset.prog !== targetWidth) {
            card.querySelector('.progress-bar').style.width = targetWidth;
            card.dataset.prog = targetWidth;
        }

        const rightHtml = t.status==='downloading' ? `<span style="color:var(--primary);">⬇️ ${formatSize(t.speed)}/s</span> <span style="font-weight:normal;color:var(--text-muted); margin-left:10px;">⏳ ${formatTime(eta)}</span>` : '';
        if (card.dataset.lastRight !== rightHtml) { card.querySelector('.meta-right').innerHTML = rightHtml; card.dataset.lastRight = rightHtml; }
        
        if (card.dataset.status !== t.status) {
            card.dataset.status = t.status; let stHtml = '';
            if(t.status==='downloading') stHtml = '<span style="display:inline-block;animation:spin-slow 2.5s linear infinite;margin-right:4px;">⚙️</span><span style="color:var(--primary);">下载中</span>';
            else if(t.status==='waiting') stHtml = '<span style="display:inline-block;animation:float 2s ease-in-out infinite;margin-right:4px;">⏳</span><span style="color:var(--warning);">等待中</span>';
            else if(t.status==='paused') stHtml = '<span style="display:inline-block;animation:blink 1.5s infinite;margin-right:4px;">⏸️</span><span style="color:var(--warning);">已暂停</span>';
            else if(t.status==='complete') stHtml = '<span style="margin-right:4px;">✅</span><span style="color:var(--success);">已完成</span>';
            else {
            const isNodeOff = t.engine && t.engine.startsWith('aria2_') && window.aria2NodeStatus && window.aria2NodeStatus[parseInt(t.engine.split('_')[1])]?.online === false;
            if (isNodeOff) stHtml = '<span style="margin-right:4px;">🔌</span><span style="color:var(--danger);">节点离线</span>';
            else stHtml = '<span style="margin-right:4px;">❌</span><span style="color:var(--danger);">任务异常</span>';
        }
            card.querySelector('.st').innerHTML = stHtml;
            
            let opHtml = `<button class="btn btn-info btn-sm" onclick="showTaskDetails('${t.id}')">详情</button>`;
            if(t.status==='downloading' || t.status==='waiting') opHtml += `<button class="btn btn-warning btn-sm" onclick="singleAction('${t.id}','pause',this)">暂停</button>`;
            if(t.status==='paused' || t.status==='error') opHtml += `<button class="btn btn-success btn-sm" onclick="singleAction('${t.id}','resume',this)">继续</button>`;
            opHtml += `<button class="btn btn-default btn-sm" onclick="singleAction('${t.id}','delete',this)"><span style="color:var(--danger);">删除</span></button>`;
            card.querySelector('.task-actions').innerHTML = opHtml;
        }
        if(list.children[i] !== card) list.insertBefore(card, list.children[i]);
      });
    }

    
    function parseBitfield(hex, total) {
        if (!hex || !total) return '';
        let bin = '';
        for (let i = 0; i < hex.length; i++) {
            bin += parseInt(hex[i], 16).toString(2).padStart(4, '0');
        }
        let tiles = '';
        for (let i = 0; i < total; i++) {
            tiles += `<div class="p-tile ${bin[i] === '1' ? 'done' : ''}"></div>`;
        }
        return tiles;
    }

async function showTaskDetails(id){
  document.getElementById('task-detail-content').innerHTML = '<div style="text-align:center; padding: 40px; color: var(--primary);"><span style="display:inline-block;animation:spin-slow 2s linear infinite;font-size:24px;">⚙️</span><br><br>正在抓取底层全量数据...</div>';
  showModal('task-detail-modal');
  const r = await api(`/api/tasks/${id}/details`); const c = document.getElementById('task-detail-content');
  if(r.success && r.data){
    
    // 核心算法：将 Aria2 的 Hex 字符串转换为二进制区块图
    let piecesHtml = '';
    if (r.data.bitfield && r.data.numPieces > 0) {
        let binaryStr = '';
        for(let i=0; i<r.data.bitfield.length; i++) {
            binaryStr += parseInt(r.data.bitfield[i], 16).toString(2).padStart(4, '0');
        }
        for(let i=0; i<r.data.numPieces; i++) {
            piecesHtml += `<div class="piece ${binaryStr[i] === '1' ? 'done' : ''}"></div>`;
        }
    } else if (r.data.numPieces > 0) {
        piecesHtml = '<div style="color:var(--text-muted); grid-column: 1 / -1; font-size: 12px;">(图谱生成中或尚未获得区块数据)</div>';
    } else {
        piecesHtml = '<div style="color:var(--text-muted); grid-column: 1 / -1; font-size: 12px;">该类型任务不支持区块图谱</div>';
    }

    // 渲染 Peers 节点表
    let peersHtml = '';
    if (r.peers && r.peers.length > 0) {
        peersHtml += `<div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-sm);"><table class="peer-table">
            <tr><th>IP 地址</th><th>⬇️ 下载速度</th><th>⬆️ 上传速度</th></tr>`;
        r.peers.forEach(p => {
            peersHtml += `<tr>
                <td style="font-family:monospace;">${p.ip}:${p.port}</td>
                <td style="color:var(--primary); font-weight:bold;">${formatSize(p.downloadSpeed)}/s</td>
                <td style="color:var(--warning);">${formatSize(p.uploadSpeed)}/s</td>
            </tr>`;
        });
        peersHtml += '</table></div>';
    } else {
        peersHtml = '<div style="color:var(--text-muted); padding: 10px; text-align: center; border: 1px dashed var(--border-color); border-radius: 6px;">暂未连接到任何 Peer 节点</div>';
    }

    let filesHtml = `<div style="max-height:150px; overflow-y:auto; background:var(--bg-body); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">`;
    (r.files||[]).forEach(f => {
        let progress = f.size > 0 ? ((f.completed/f.size)*100).toFixed(1) : 0;
        filesHtml += `<div style="display:flex; flex-direction:column; border-bottom:1px dashed var(--border-color); padding:6px 0;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="word-break:break-all; font-weight:600;">${f.name}</span>
                <span style="color:var(--primary); font-size:11px;">${progress}%</span>
            </div>
            <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:11px;">
                <span>${formatSize(f.completed)} / ${formatSize(f.size)}</span>
            </div>
        </div>`;
    });
    filesHtml += '</div>';

    c.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div style="background:var(--hover-bg); padding:12px; border-radius:8px;">
              <div style="color:var(--text-muted); font-size:12px; margin-bottom:4px;">切片总数 / 碎片大小</div>
              <div style="font-size:16px; font-weight:bold;">${r.data.numPieces} 块 / ${formatSize(r.data.pieceLength)}</div>
          </div>
          <div style="background:var(--hover-bg); padding:12px; border-radius:8px;">
              <div style="color:var(--text-muted); font-size:12px; margin-bottom:4px;">当前连接数</div>
              <div style="font-size:16px; font-weight:bold; color:var(--success);">${r.data.connections} 线程</div>
          </div>
      </div>
      
      <div style="margin-bottom: 20px;">
          <strong style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">🧩 实时区块图谱 (Piece Map)</strong>
          <div class="piece-map-container"><div class="piece-grid">${piecesHtml}</div></div>
      </div>

      <div style="margin-bottom: 20px;">
          <strong style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">🌐 连通节点分布 (Peers)</strong>
          ${peersHtml}
      </div>

      <div>
          <strong style="display:flex; align-items:center; gap:6px; margin-bottom:10px;">📁 文件列表详情</strong>
          ${filesHtml}
      </div>
    `;
  } else { c.innerHTML = `<div style="color:var(--danger);text-align:center;padding:20px;">无法获取详情: ${r.error||'任务已被彻底抹除'}</div>`; }
}

async function addDownload(){
      const eng = document.getElementById('task-engine-select').value; const type = document.querySelector('input[name="task_type"]:checked').value;
      const btn = event.currentTarget; btn.disabled = true; btn.textContent = '投递中...';
      if(type==='url'){
        const url = document.getElementById('url-input').value; const r = await api('/api/download', {method:'POST', body:JSON.stringify({url, engine:eng})});
        if(r.success) { hideModal('new-task-modal'); showToast(r.message); refreshTasks(); } else showToast(r.error||'添加任务失败', 'error');
      } else {
        const file = document.getElementById('torrent-file').files[0];
        if(!file) { showToast('请先选择种子文件', 'warning'); btn.disabled=false; btn.textContent='🚀 开始投递'; return; }
        const reader = new FileReader();
        reader.onload = async(e)=>{
          const r = await api('/api/upload', {method:'POST', body:JSON.stringify({engine:eng, filename:file.name, fileBase64:e.target.result.split(',')[1]})});
          if(r.success) { hideModal('new-task-modal'); showToast(r.message); refreshTasks(); } else showToast(r.error||'种子解析失败', 'error');
        };
        reader.readAsDataURL(file);
      }
      setTimeout(()=>{ btn.disabled=false; btn.textContent='🚀 开始投递'; }, 1000);
    }

    async function loadOpenList(path=currentOpenListPath){
      const idx = document.getElementById('ol-account-select').value; if(idx==="") return;
      const c = document.getElementById('openlist-content');
      let skeletonRows = '';
      for(let i=0; i<6; i++) {
          const w = 30 + Math.random() * 40; // 随机文件名宽度，看起来更真实
          const delay = i * 0.1; // 产生阶梯式的流水闪烁效果
          skeletonRows += `<tr style="border-bottom:1px solid var(--border-color); pointer-events:none;">
            <td><div style="width:16px;height:16px;border-radius:4px;background:var(--border-color);opacity:0.2;animation:blink 1.5s infinite ${delay}s;"></div></td>
            <td><div style="display:flex;align-items:center;gap:10px;"><div style="width:20px;height:20px;border-radius:4px;background:var(--border-color);opacity:0.2;animation:blink 1.5s infinite ${delay}s;"></div><div style="height:16px;width:${w}%;border-radius:4px;background:var(--border-color);opacity:0.2;animation:blink 1.5s infinite ${delay}s;"></div></div></td>
            <td><div style="height:16px;width:40px;border-radius:4px;background:var(--border-color);opacity:0.2;animation:blink 1.5s infinite ${delay}s;"></div></td>
            <td><div style="height:16px;width:120px;border-radius:4px;background:var(--border-color);opacity:0.2;animation:blink 1.5s infinite ${delay}s;"></div></td>
          </tr>`;
      }
      c.innerHTML = `<div style="width:100%; overflow-x:auto; background:var(--card-bg);">
          <table class="ol-table" style="width:100%; min-width:500px;">
              <thead><tr><th style="width:40px;"></th><th>文件名称</th><th style="width:120px;">大小</th><th style="width:180px;">修改时间</th></tr></thead>
              <tbody>${skeletonRows}</tbody>
          </table>
      </div>`;
      
      // 🌟 瞬间更新面包屑 UI，告别等待空白
      const pEl = document.getElementById('openlist-path');
      if (pEl) {
          let pts = path.split('/').filter(x => x);
          let h = '<span class="bc-item bc-parent" onclick="loadOpenList(\'/\')">☁️ 云端根目录</span>';
          let cp = '';
          pts.forEach(x => { cp += '/' + x; h += '<span class="bc-slash">/</span><span class="bc-item" onclick="loadOpenList(\''+cp+'\')">'+x+'</span>'; });
          pEl.innerHTML = h;
      }
      
      const r = await api('/api/openlist/list', {method:'POST', body:JSON.stringify({olIdx:parseInt(idx), path})});

      if(r.code===200){
        currentOpenListPath = path; 
        const pEl = document.getElementById('openlist-path'); 
        if (pEl.tagName === 'INPUT') { 
            pEl.value = path; 
        } else { 
            let pts = path.split('/').filter(x => x); 
            let h = '<span class="bc-item bc-parent" onclick="loadOpenList(\'/\')">☁️ 云端根目录</span>'; 
            let cp = ''; 
            pts.forEach(x => { 
                cp += '/' + x; 
                h += '<span class="bc-slash">/</span><span class="bc-item" onclick="loadOpenList(\''+cp+'\')">'+x+'</span>'; 
            }); 
            pEl.innerHTML = h; 
        } olFiles = r.data.content||[]; olSelected.clear();
        const ss = localStorage.getItem('dm_ol_sort_'+path); if(ss){ const p=ss.split('_'); olSortBy=p[0]; olSortDesc=p[1]==='true'; } else { olSortBy='name'; olSortDesc=false; }
        renderOpenList();
      } else { c.innerHTML = `<div style="text-align:center;padding:60px;color:var(--danger);">拉取失败: ${r.error || r.message || '网络异常'}</div>`; }
    }
    function openListGoUp(){ if(currentOpenListPath==='/') return; const p=currentOpenListPath.split('/'); p.pop(); loadOpenList(p.join('/')||'/'); }
    
    function sortOpenList(f){ if(olSortBy===f) olSortDesc=!olSortDesc; else {olSortBy=f; olSortDesc=false;} localStorage.setItem('dm_ol_sort_'+currentOpenListPath, `${olSortBy}_${olSortDesc}`); renderOpenList(); }

    
    function updateOlUI() {
      const allC = document.getElementById('cb-ol-all');
      if(allC) allC.checked = olFiles.length > 0 && olSelected.size === olFiles.length;
      
      const cntSpan = document.getElementById('ol-selected-count'); 
      if (cntSpan) { 
          cntSpan.style.display = olSelected.size > 0 ? 'inline-block' : 'none'; 
          cntSpan.textContent = `已选择 ${olSelected.size} 项`; 
      }
      
      const displayState = olSelected.size > 0 ? 'inline-block' : 'none';
      document.getElementById('btn-ol-download').style.display = displayState; 
      document.getElementById('btn-ol-rename').style.display = displayState; 
      document.getElementById('btn-ol-delete').style.display = displayState;
    }

    function toggleOlItem(name, cbId, e) {
      if(e) e.stopPropagation(); // 阻止事件冒泡，防止点击复选框时触发行的点击
      
      if(olSelected.has(name)) olSelected.delete(name); 
      else olSelected.add(name);
      
      const cb = document.getElementById(cbId);
      if(cb) cb.checked = olSelected.has(name);
      
      updateOlUI(); // 只更新按钮状态，不重绘表格！
    }

    function toggleOlAll(checked) {
      olFiles.forEach(f => olSelected[checked ? 'add' : 'delete'](f.name));
      document.querySelectorAll('.ol-row-cb').forEach(cb => cb.checked = checked);
      updateOlUI();
    }

    function renderOpenList(){
      olFiles.sort((a,b)=>{
        if(a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        let c=0; 
        if(olSortBy==='name') c=a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}); 
        else if(olSortBy==='size') c=a.size-b.size; 
        else c=new Date(a.modified)-new Date(b.modified); 
        return olSortDesc?-c:c;
      });
      
      const getIco = (f) => f===olSortBy ? (olSortDesc?'▼':'▲') : ''; 
      const allC = olFiles.length>0 && olSelected.size===olFiles.length ? 'checked' : '';
      
      let html = `<table class="ol-table"><tr><th style="width:40px;"><input type="checkbox" id="cb-ol-all" class="custom-checkbox" ${allC} onclick="toggleOlAll(this.checked)"></th><th onclick="sortOpenList('name')">文件名称 <span style="font-size:10px;">${getIco('name')}</span></th><th onclick="sortOpenList('size')" style="width:120px;">大小 <span style="font-size:10px;">${getIco('size')}</span></th><th onclick="sortOpenList('time')" style="width:180px;">修改时间 <span style="font-size:10px;">${getIco('time')}</span></th></tr>`;
      
      olFiles.forEach((f, i)=>{
        const chk = olSelected.has(f.name) ? 'checked' : ''; 
        const cbId = 'cb-ol-row-' + i; // 给每个复选框分配唯一 ID
        const safeName = escapeHtml(f.name).replace(/'/g, "\\'");
        
        const act = f.is_dir ? `loadOpenList('${currentOpenListPath==='/'?'':currentOpenListPath}/${safeName}')` : `toggleOlItem('${safeName}', '${cbId}', event)`;
        const renameBtn = f.is_dir ? "" : `<span onclick="event.stopPropagation(); pushSingleFile('${safeName}')" style="margin-left:12px; cursor:pointer; opacity:0.5; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5" title="推送到下载器">🚀</span><span onclick="event.stopPropagation(); renameFile('${safeName}')" style="margin-left:12px; cursor:pointer; opacity:0.5; transition:0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5" title="重命名">✏️</span>`;
        
        html += `<tr style="animation: slideFadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; animation-delay: ${Math.min(i * 0.025, 0.5)}s; opacity: 0;">
        <td><input type="checkbox" id="${cbId}" class="custom-checkbox ol-row-cb" ${chk} onclick="toggleOlItem('${safeName}', '${cbId}', event)"></td>
        <td style="cursor:pointer; color:var(--text-main);" onclick="${act}"><span style="font-size:16px; margin-right:8px;">${f.is_dir?'📁':'📄'}</span> <span style="word-break:break-all;">${escapeHtml(f.name)}</span>${renameBtn}</td>
        <td style="color:var(--text-muted);">${f.is_dir?'-':formatSize(f.size)}</td><td style="color:var(--text-muted);">${new Date(f.modified).toLocaleString()}</td></tr>`;
      });
      
      document.getElementById('openlist-content').innerHTML = html+'</table>';
      updateOlUI(); // 初次渲染完毕后，同步一次顶部按钮状态
    }

    
    // 🌟 单文件快捷推送入口
    window.pushSingleFile = function(name) {
        if(typeof olSelected === 'undefined') return;
        olSelected.clear();      // 清空之前可能遗留的选中项
        olSelected.add(name);    // 把当前文件加入待处理队列
        updateOlUI();            // 同步一下 UI (自动勾选前面的框)
        showEngineSelectModalForOL(); // 呼出选择引擎弹窗
    }

    function showEngineSelectModalForOL() { if (olSelected.size === 0) return; populateSelects(); showModal('engine-select-modal'); }

    let globalPushQueue = []; let isPushing = false; let pushStats = { total: 0, current: 0, success: 0, fail: 0 };
    async function executeOlDownload() {
      const eng = document.getElementById('ol-engine-select').value; const idx = document.getElementById('ol-account-select').value; const tasksToProcess = Array.from(olSelected); const parentPath = currentOpenListPath;
      if(tasksToProcess.length === 0) return;
      hideModal('engine-select-modal');
      let added = 0;
      tasksToProcess.forEach(n => { 
          const fp = parentPath === '/' ? `/${n}` : `${parentPath}/${n}`;
          // 🛡️ 拦截重复推送
          if (!globalPushQueue.some(q => q.name === n && q.fullPath === fp && q.eng === eng)) {
              globalPushQueue.push({ name: n, fullPath: fp, idx: idx, eng: eng }); 
              added++;
          }
      });
      if(added === 0) return showToast('选中任务已在推送队列中，请勿重复点击', 'warning');
      pushStats.total += added; olSelected.clear(); renderOpenList(); processPushQueue();
    }

    async function processPushQueue() {
  if (isPushing) return; isPushing = true; const qContainer = document.getElementById('push-queue-container');
  if (!document.getElementById('push')) {
    qContainer.insertAdjacentHTML('beforeend', `<div id="push" class="capsule-wrap" style="position:relative; display:flex; align-items:center; gap:10px; background:var(--hover-bg); padding:5px 16px; border-radius:20px; border:1px solid var(--border-color); animation:fadeIn 0.3s ease; max-width:450px; width:100%; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02); margin-left: 10px;">
         <span style="font-size:13px; font-weight:bold; color:var(--text-main); white-space:nowrap;">🚀 推送 <span id="txt-push-prog">0/0</span></span>
         <div style="flex:1; height:6px; background:var(--bg-body); border-radius:3px; overflow:hidden; min-width:60px; box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">
            <div id="bar-push-prog" style="height:100%; width:0%; background:linear-gradient(90deg, var(--primary), var(--success)); transition:width 0.2s ease;"></div>
         </div>
         <span style="font-size:12px; white-space:nowrap; display:flex; gap:6px; font-weight:600;"><span style="color:var(--success);">✅<span id="suc-push-prog">0</span></span><span style="color:var(--danger);">❌<span id="fail-push-prog">0</span></span></span>
         <div id="dropdown-push" class="queue-dropdown"></div>
      </div>`);
  }

  const updateUI = () => {
      const percent = Math.round((pushStats.current / pushStats.total) * 100);
      const bar = document.getElementById('bar-push-prog'); if(bar) bar.style.width = percent + '%';
      const txt = document.getElementById('txt-push-prog'); if(txt) txt.textContent = pushStats.current + '/' + pushStats.total;
      const suc = document.getElementById('suc-push-prog'); if(suc) suc.textContent = pushStats.success;
      const fail = document.getElementById('fail-push-prog'); if(fail) fail.textContent = pushStats.fail;
      
      const dp = document.getElementById('dropdown-push');
      if(dp) {
          if(globalPushQueue.length === 0) dp.innerHTML = '<div class="queue-item" style="text-align:center;">队列已清空</div>';
          else dp.innerHTML = globalPushQueue.slice(0, 50).map(t => `<div class="queue-item">⏳ ${t.name}</div>`).join('') + (globalPushQueue.length>50?'<div class="queue-item" style="text-align:center;">... 还有更多</div>':'');
      }
  };

  const workers = [];
  for(let i=0; i<5; i++) {
      workers.push((async () => {
          while (globalPushQueue.length > 0) {
              const task = globalPushQueue.shift(); pushStats.current++;
              updateUI();
              try {
                  const r = await api('/api/openlist/get', {method:'POST', body:JSON.stringify({olIdx:parseInt(task.idx), path:task.fullPath})});
if(r.code === 200 && r.data){
   let target = r.data.raw_url;
   if(!r.data.header && r.data.sign) { target = sysConfig.openlist[task.idx].url.replace(/\/$/, '') + '/d' + task.fullPath.split('/').map(encodeURIComponent).join('/') + '?sign=' + r.data.sign; }
   const dr = await api('/api/download', {method:'POST', body:JSON.stringify({url:target, engine:task.eng, headers:r.data.header})});
   if(dr.success) pushStats.success++; else pushStats.fail++;
} else { pushStats.fail++; }
                  
              } catch (e) { pushStats.fail++; }
              updateUI();
          }
      })());
  }
  await Promise.all(workers);

  const barFinal = document.getElementById('bar-push-prog'); if(barFinal) barFinal.style.background = 'var(--success)';
  
  setTimeout(() => {
    const el = document.getElementById('push');
    if(el && globalPushQueue.length === 0) { 
       el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; el.style.transition = 'all 0.4s ease'; 
       setTimeout(() => { if(globalPushQueue.length === 0) { el.remove(); pushStats = { total: 0, current: 0, success: 0, fail: 0 }; } }, 400); 
    }
  }, 4000);
  isPushing = false;
}
    
    // 🌟 单/多文件重命名统一入口
    function renameFile(name){
        if(typeof olSelected === 'undefined') return;
        olSelected.clear(); olSelected.add(name);
        const replaceRadio = document.getElementById('rn-type-replace');
        if(replaceRadio) { replaceRadio.checked = true; document.getElementById('rn-replace-box').style.display='block'; document.getElementById('rn-seq-box').style.display='none'; }
        showRenameModal();
    }

    function showRenameModal() { 
      if(olSelected.size===0) return; 
      const isSingle = olSelected.size === 1;
      document.getElementById('rename-title').innerHTML = isSingle ? '✏️ 单文件重命名' : `✏️ 批量重命名 (${olSelected.size}项)`;
      
      const radios = document.querySelectorAll('input[name="rn_type"]');
      radios.forEach(r => r.parentElement.style.display = isSingle ? 'none' : '');
      
      document.getElementById('rn-search').style.display = isSingle ? 'none' : 'block';
      document.getElementById('rn-search').value = isSingle ? Array.from(olSelected)[0] : '';
          document.getElementById('rn-replace').value = isSingle ? Array.from(olSelected)[0] : '';
          document.getElementById('rn-replace').placeholder = isSingle ? '请输入新文件名' : '替换为 (留空则删除)';
          
          // 🧹 彻底清空序列化残留与还原初始默认模式
          if(document.getElementById('rn-format')) document.getElementById('rn-format').value = '';
          if(document.getElementById('rn-start')) document.getElementById('rn-start').value = '1';
          const rplRadio = document.getElementById('rn-type-replace');
          if(rplRadio) { 
              rplRadio.checked = true; 
              document.getElementById('rn-replace-box').style.display='block'; 
              document.getElementById('rn-seq-box').style.display='none'; 
          }
      
      showModal('rename-modal'); updateRenamePreview();
    }

    
    // --- 性能优化：输入框防抖机制 ---
    let renamePreviewTimer;
    function updateRenamePreviewDebounced() {
        clearTimeout(renamePreviewTimer);
        renamePreviewTimer = setTimeout(updateRenamePreview, 250); // 延迟 250ms 执行
    }

    function updateRenamePreview() {
      const mode = document.querySelector('input[name="rn_type"]:checked').value;
      const search = document.getElementById('rn-search').value; const replace = document.getElementById('rn-replace').value; const fmt = document.getElementById('rn-format').value; let startNum = parseInt(document.getElementById('rn-start').value)||1;
      const box = document.getElementById('rn-preview-box'); if(!box) return;
      if (olSelected.size <= 1) { box.style.display = 'none'; return; } box.style.display = 'block';
      
      let pHtml = '<div style="font-weight:bold; margin-bottom:8px; color:var(--text-muted);">👀 变更预览 (滑动查看)：</div>';
      const sortedNames = Array.from(olSelected).sort((a,b)=>a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
      sortedNames.forEach(n => {
        let newName = n;
        if(mode==='replace' && search) newName = n.split(search).join(replace); else if(mode==='seq' && fmt) { 
            const ext = n.includes('.') ? n.substring(n.lastIndexOf('.')) : ''; 
            let ep = null;
            // 清洗掉年份和分辨率，防止误伤
            let cleanFn = n.replace(/(19|20)\d{2}/g, '').replace(/1080p|720p|2160p|4k/gi, '');
            // 暴力正则：匹配 S01E01, E01, 第1集, [01], - 01 等各种奇葩命名
            let epMatch = cleanFn.match(/[Ee][Pp]?\s*(\d{1,4})/) || cleanFn.match(/[Ss]\d+[Ee](\d{1,4})/) || cleanFn.match(/第\s*(\d{1,4})\s*[集话]/) || cleanFn.match(/\[\s*(\d{1,3})\s*\]/) || cleanFn.match(/【\s*(\d{1,3})\s*】/) || cleanFn.match(/\s-\s*(\d{1,3})\b/);
            
            if(epMatch) ep = parseInt(epMatch[1], 10);
            else { let fb = cleanFn.match(/\b(\d{2,3})\b/); if(fb) ep = parseInt(fb[1], 10); }
            
            // 核心修复：如果提取到了真实集数，就用真实的；如果真没提取到，再退化回计数器。且强制两位数补零 (01, 02)
            let numStr = String(ep !== null ? ep : startNum++).padStart(2, '0');
            newName = fmt.replace('{ext}', ext).replace('{n}', numStr); 
        }
        if (newName !== n) pHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed var(--border-color); padding-bottom:4px; gap: 10px;"><span style="color:var(--danger); text-decoration:line-through; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%;" title="${n}">${n}</span> <span style="color:var(--text-muted);">➜</span> <span style="color:var(--success); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%; font-weight:bold;" title="${newName}">${newName}</span></div>`;
        else pHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px dashed var(--border-color); padding-bottom:4px; gap: 10px;"><span style="color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%;">${n}</span> <span style="color:var(--text-muted);">➜</span> <span style="color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45%;">(无变化)</span></div>`;
      });
      box.innerHTML = pHtml;
    }

    let globalRenameQueue = []; let isRenaming = false; let renameStats = { total: 0, current: 0, success: 0, fail: 0 };
    async function submitRename() {
      const idx = document.getElementById('ol-account-select').value; const mode = document.querySelector('input[name="rn_type"]:checked').value;
      const search = document.getElementById('rn-search').value; const replace = document.getElementById('rn-replace').value; const fmt = document.getElementById('rn-format').value; let startNum = parseInt(document.getElementById('rn-start').value)||1;
      hideModal('rename-modal');
      const sortedNames = Array.from(olSelected).sort((a,b)=>a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
      const parentPath = currentOpenListPath;
      let added = 0;
      for (const n of sortedNames) {
        let newName = n;
        if(olSelected.size===1) newName = replace || search;
        else if(mode==='replace' && search) newName = n.split(search).join(replace);
        else if(mode==='seq' && fmt) { 
            const ext = n.includes('.') ? n.substring(n.lastIndexOf('.')) : ''; 
            let ep = null;
            let cleanFn = n.replace(/(19|20)\d{2}/g, '').replace(/1080p|720p|2160p|4k/gi, '');
            let epMatch = cleanFn.match(/[Ee][Pp]?\s*(\d{1,4})/) || cleanFn.match(/[Ss]\d+[Ee](\d{1,4})/) || cleanFn.match(/第\s*(\d{1,4})\s*[集话]/) || cleanFn.match(/\[\s*(\d{1,3})\s*\]/) || cleanFn.match(/【\s*(\d{1,3})\s*】/) || cleanFn.match(/\s-\s*(\d{1,3})\b/);
            if(epMatch) ep = parseInt(epMatch[1], 10);
            else { let fb = cleanFn.match(/\b(\d{2,3})\b/); if(fb) ep = parseInt(fb[1], 10); }
            let numStr = String(ep !== null ? ep : startNum++).padStart(2, '0');
            newName = fmt.replace('{ext}', ext).replace('{n}', numStr); 
        }
        if(newName !== n) {
            const fp = parentPath==='/'?`/${n}`:`${parentPath}/${n}`;
            // 🛡️ 拦截：相同路径和改名方案，禁止重复进入队列
            if (!globalRenameQueue.some(q => q.oldName === n && q.path === fp)) {
                globalRenameQueue.push({ oldName: n, newName: newName, path: fp, idx: idx });
                added++;
            }
        }
      }
      if(added === 0) return showToast('没有发生变化或任务已在处理队列中');
      renameStats.total += added; // 🧮 修复分母膨胀
      olSelected.clear(); renderOpenList(); processRenameQueue();
    }

    async function processRenameQueue() {
  if (isRenaming) return; isRenaming = true; const qContainer = document.getElementById('push-queue-container');
  if (!document.getElementById('rn')) {
    qContainer.insertAdjacentHTML('beforeend', `<div id="rn" class="capsule-wrap" style="position:relative; display:flex; align-items:center; gap:10px; background:var(--hover-bg); padding:5px 16px; border-radius:20px; border:1px solid var(--border-color); animation:fadeIn 0.3s ease; max-width:450px; width:100%; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02); margin-left: 10px;">
         <span style="font-size:13px; font-weight:bold; color:var(--text-main); white-space:nowrap;">✏️ 改名 <span id="txt-rn-prog">0/0</span></span>
         <div style="flex:1; height:6px; background:var(--bg-body); border-radius:3px; overflow:hidden; min-width:60px; box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">
            <div id="bar-rn-prog" style="height:100%; width:0%; background:linear-gradient(90deg, var(--primary), var(--success)); transition:width 0.2s ease;"></div>
         </div>
         <span style="font-size:12px; white-space:nowrap; display:flex; gap:6px; font-weight:600;"><span style="color:var(--success);">✅<span id="suc-rn-prog">0</span></span><span style="color:var(--danger);">❌<span id="fail-rn-prog">0</span></span></span>
         <div id="dropdown-rn" class="queue-dropdown"></div>
      </div>`);
  }

  const updateUI = () => {
      const percent = Math.round((renameStats.current / renameStats.total) * 100);
      const bar = document.getElementById('bar-rn-prog'); if(bar) bar.style.width = percent + '%';
      const txt = document.getElementById('txt-rn-prog'); if(txt) txt.textContent = renameStats.current + '/' + renameStats.total;
      const suc = document.getElementById('suc-rn-prog'); if(suc) suc.textContent = renameStats.success;
      const fail = document.getElementById('fail-rn-prog'); if(fail) fail.textContent = renameStats.fail;
      
      const dp = document.getElementById('dropdown-rn');
      if(dp) {
          if(globalRenameQueue.length === 0) dp.innerHTML = '<div class="queue-item" style="text-align:center;">队列已清空</div>';
          else dp.innerHTML = globalRenameQueue.slice(0, 50).map(t => `<div class="queue-item">⏳ ${t.newName}</div>`).join('') + (globalRenameQueue.length>50?'<div class="queue-item" style="text-align:center;">... 还有更多</div>':'');
      }
  };

  const workers = [];
  for(let i=0; i<5; i++) {
      workers.push((async () => {
          while (globalRenameQueue.length > 0) {
              const task = globalRenameQueue.shift(); renameStats.current++;
              updateUI();
              try {
                  const r = await api('/api/openlist/rename', {method:'POST', body:JSON.stringify({olIdx:parseInt(task.idx), path:task.path, name:task.newName})});
                  if(r.code===200) renameStats.success++; else renameStats.fail++;
              } catch (e) { renameStats.fail++; }
              updateUI();
          }
      })());
  }
  await Promise.all(workers);

  const barFinal = document.getElementById('bar-rn-prog'); if(barFinal) barFinal.style.background = 'var(--success)';
  
  setTimeout(() => {
    const el = document.getElementById('rn');
    if(el && globalRenameQueue.length === 0) { 
       el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; el.style.transition = 'all 0.4s ease'; 
       setTimeout(() => { if(globalRenameQueue.length === 0) { el.remove(); renameStats = { total: 0, current: 0, success: 0, fail: 0 }; } }, 400); 
    }
  }, 4000);
  isRenaming = false;
}

    let globalDeleteQueue = []; let isDeleting = false; let deleteStats = { total: 0, current: 0, success: 0, fail: 0 };
    async function deleteSelectedFiles(){
      const tasksToProcess = Array.from(olSelected); if(tasksToProcess.length === 0) return;
      if(!confirm(`危险操作：确定要彻底删除云端的 ${tasksToProcess.length} 个文件吗？此操作不可逆！`)) return;
      const idx = document.getElementById('ol-account-select').value; const parentPath = currentOpenListPath;
      let added = 0;
      tasksToProcess.forEach(n => { 
          // 🛡️ 拦截重复删除
          if (!globalDeleteQueue.some(q => q.name === n && q.fullPath === parentPath)) {
              globalDeleteQueue.push({ name: n, fullPath: parentPath, idx: idx }); 
              added++;
          }
      });
      if(added === 0) return;
      deleteStats.total += added; olSelected.clear(); renderOpenList(); processDeleteQueue();
    }

    async function processDeleteQueue() {
  if (isDeleting) return; isDeleting = true; const qContainer = document.getElementById('push-queue-container');
  if (!document.getElementById('del')) {
    qContainer.insertAdjacentHTML('beforeend', `<div id="del" class="capsule-wrap" style="position:relative; display:flex; align-items:center; gap:10px; background:var(--hover-bg); padding:5px 16px; border-radius:20px; border:1px solid var(--border-color); animation:fadeIn 0.3s ease; max-width:450px; width:100%; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02); margin-left: 10px;">
         <span style="font-size:13px; font-weight:bold; color:var(--text-main); white-space:nowrap;">🗑️ 删除 <span id="txt-del-prog">0/0</span></span>
         <div style="flex:1; height:6px; background:var(--bg-body); border-radius:3px; overflow:hidden; min-width:60px; box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">
            <div id="bar-del-prog" style="height:100%; width:0%; background:linear-gradient(90deg, var(--primary), var(--success)); transition:width 0.2s ease;"></div>
         </div>
         <span style="font-size:12px; white-space:nowrap; display:flex; gap:6px; font-weight:600;"><span style="color:var(--success);">✅<span id="suc-del-prog">0</span></span><span style="color:var(--danger);">❌<span id="fail-del-prog">0</span></span></span>
         <div id="dropdown-del" class="queue-dropdown"></div>
      </div>`);
  }

  const updateUI = () => {
      const percent = Math.round((deleteStats.current / deleteStats.total) * 100);
      const bar = document.getElementById('bar-del-prog'); if(bar) bar.style.width = percent + '%';
      const txt = document.getElementById('txt-del-prog'); if(txt) txt.textContent = deleteStats.current + '/' + deleteStats.total;
      const suc = document.getElementById('suc-del-prog'); if(suc) suc.textContent = deleteStats.success;
      const fail = document.getElementById('fail-del-prog'); if(fail) fail.textContent = deleteStats.fail;
      
      const dp = document.getElementById('dropdown-del');
      if(dp) {
          if(globalDeleteQueue.length === 0) dp.innerHTML = '<div class="queue-item" style="text-align:center;">队列已清空</div>';
          else dp.innerHTML = globalDeleteQueue.slice(0, 50).map(t => `<div class="queue-item">⏳ ${t.name}</div>`).join('') + (globalDeleteQueue.length>50?'<div class="queue-item" style="text-align:center;">... 还有更多</div>':'');
      }
  };

  const workers = [];
  for(let i=0; i<5; i++) {
      workers.push((async () => {
          while (globalDeleteQueue.length > 0) {
              const task = globalDeleteQueue.shift(); deleteStats.current++;
              updateUI();
              try {
                  const r = await api('/api/openlist/remove', {method:'POST', body:JSON.stringify({olIdx:parseInt(task.idx), dir:task.fullPath, names:[task.name]})});
                  if(r.code === 200) deleteStats.success++; else deleteStats.fail++;
              } catch (e) { deleteStats.fail++; }
              updateUI();
          }
      })());
  }
  await Promise.all(workers);

  const barFinal = document.getElementById('bar-del-prog'); if(barFinal) barFinal.style.background = 'var(--success)';
  
  setTimeout(() => {
    const el = document.getElementById('del');
    if(el && globalDeleteQueue.length === 0) { 
       el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; el.style.transition = 'all 0.4s ease'; 
       setTimeout(() => { if(globalDeleteQueue.length === 0) { el.remove(); deleteStats = { total: 0, current: 0, success: 0, fail: 0 }; } }, 400); 
    }
  }, 4000);
  isDeleting = false;
}

    function connectWS(){
  if(ws) ws.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let wsUrl = `${protocol}//${location.host}/ws/tasks?token=${authToken}`;
  
  // 🛡️ Nginx 穿透机制：如果 Nginx 没配 WebSocket 代理导致秒断，第二次尝试直接走 1111 端口直连后门！
  window.wsFailCount = window.wsFailCount || 0;
  if (window.wsFailCount > 0 && location.port === '') {
      wsUrl = `${protocol}//${location.hostname}:1111/ws/tasks?token=${authToken}`;
  }

  ws = new WebSocket(wsUrl);
  const st = document.getElementById('ws-status');
  ws.onopen = () => { window.wsFailCount = 0; st.textContent = '🟢 引擎通讯中'; st.style.color = 'var(--success)'; };
  ws.onmessage = (e) => {
      try {
          const raw = JSON.parse(e.data);
          
          // 1. 优先更新全局状态和面板速度
          if (raw.stats) {
              window.aria2NodeStatus = raw.stats.aria2Nodes || [];
              if (document.getElementById('global-speed')) document.getElementById('global-speed').innerHTML = `⬇️ ${formatSize(raw.stats.globalDlSpeed)}/s <span style="color:var(--border-color);margin:0 5px;">|</span> ⬆️ ${formatSize(raw.stats.globalUpSpeed)}/s`;

              let htmlStr = '';
              (raw.stats.aria2Nodes||[]).forEach((n,i) => {
                  htmlStr += n.online 
                      ? `<div style="margin-bottom:16px; background:var(--bg-body); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color);"><div style="font-weight:600; color:var(--text-main); font-size:13px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span>🟣 ${n.name}</span> <span style="color:var(--success); font-size:11px; background:#f6ffed; border:1px solid #b7eb8f; padding:2px 6px; border-radius:10px;">在线</span></div><div style="font-size:12px; color:var(--text-muted); line-height:1.8; margin-top:8px; border-top:1px dashed var(--border-color); padding-top:8px;"><div style="display:flex; justify-content:space-between;"><span>下载速度</span><span style="color:var(--primary); font-weight:600;">${formatSize(n.dlSpeed)}/s</span></div><div style="display:flex; justify-content:space-between;"><span>上传速度</span><span style="color:var(--warning); font-weight:600;">${formatSize(n.upSpeed)}/s</span></div><div style="display:flex; justify-content:space-between;"><span>总下载量</span><span>${formatSize(n.totalDl)}</span></div><div style="display:flex; justify-content:space-between;"><span>总上传量</span><span>${formatSize(n.totalUp)}</span></div></div></div>`
                      : `<div style="margin-bottom:16px; background:var(--bg-body); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); opacity:0.6;"><div style="font-weight:600; color:var(--text-main); font-size:13px; display:flex; justify-content:space-between; align-items:center;"><span>🟣 ${n.name}</span> <span style="color:var(--danger); font-size:11px; background:#fff2f0; border:1px solid #ffccc7; padding:2px 6px; border-radius:10px;">离线</span></div></div>`;
              });
              if (document.getElementById('sidebar-engines-status')) document.getElementById('sidebar-engines-status').innerHTML = htmlStr || '<div style="text-align:center; padding:20px; color:var(--warning); border:1px dashed var(--warning); border-radius:var(--radius-sm);">未配置任何引擎节点</div>';
          }

          // 2. 全量覆盖 (通常仅在第一次连接时触发)
          if (raw.type === 'full' || (!raw.type && raw.tasks)) {
              tasks = (raw.tasks || []).filter(t => !deadTasks.has(t.id));
              renderTasks();
          } 
          // 3. 极速增量更新 (局部刷新)
          else if (raw.type === 'diff' && raw.changes) {
              const { added, updated, removed } = raw.changes;
              let hasChanges = false;
              
              removed.forEach(id => {
                  const idx = tasks.findIndex(t => t.id === id);
                  if (idx !== -1) { tasks.splice(idx, 1); hasChanges = true; }
              });
              
              updated.forEach(ut => {
                  if (deadTasks.has(ut.id)) return;
                  const idx = tasks.findIndex(t => t.id === ut.id);
                  if (idx !== -1) { tasks[idx] = ut; hasChanges = true; }
              });
              
              added.forEach(nt => {
                  if (deadTasks.has(nt.id)) return;
                  if (!tasks.find(t => t.id === nt.id)) { tasks.push(nt); hasChanges = true; }
              });
              
              if (hasChanges) renderTasks();
          }
      } catch(err) {}
  };
  ws.onclose = () => { window.wsFailCount++; st.textContent = '🔴 引擎失联'; st.style.color = 'var(--danger)'; setTimeout(connectWS, 3000); };
}

async function localFastRecognize() {
        const btn = document.getElementById('btn-local-recognize'); const oldText = btn.textContent;
        const selected = Array.from(olSelected); if (selected.length === 0) return;
        
        btn.disabled = true; btn.textContent = '⚡ 提取中...';
        try {
            const r = await api('/api/local/recognize', { method: 'POST', body: JSON.stringify({ filename: selected[0] }) });
            if (r.success) {
                const mode = document.querySelector('input[name="rn_type"]:checked').value;
                let ext = selected[0].includes('.') ? selected[0].substring(selected[0].lastIndexOf('.')) : '';
                if (mode === 'replace') document.getElementById('rn-replace').value = r.cleanName + ext;
                else if (mode === 'seq') { let seqBase = r.cleanName.replace(/\.?E\d+$/, ''); document.getElementById('rn-format').value = seqBase + '.E{n}{ext}'; }
                showToast('⚡ 本地正则提取成功！'); updateRenamePreview();
            } else {
                showToast('本地提取失败，建议使用 AI 识别', 'warning');
            }
        } catch (e) { showToast('请求异常', 'error'); } finally { btn.disabled = false; btn.textContent = oldText; }
    }

    async function aiSmartRecognize() {
        const btn = document.getElementById('btn-ai-recognize'); const oldText = btn.textContent;
        const selected = Array.from(olSelected); if (selected.length === 0) return;
        
        btn.disabled = true; btn.textContent = '🕵️ 识别中...';
        const previewBox = document.getElementById('rn-preview-box');
        previewBox.style.display = 'block';
        previewBox.innerHTML = '<div style="color:var(--primary); text-align:center; padding:10px;"><span style="display:inline-block;animation:spin-slow 2s linear infinite;">⚙️</span> 正在调用 MoviePilot 刮削引擎...</div>';
        
        try {
            let r = await api('/api/moviepilot/recognize', { method: 'POST', body: JSON.stringify({ filename: selected[0], tmdbid: document.getElementById('tmdb-assist')?.value ? parseInt(document.getElementById('tmdb-assist').value) : undefined }) });
            
            if (!r.success && sysConfig.llm && sysConfig.llm.enabled) {
                if (confirm('MoviePilot 识别失败，是否尝试调用 LLM 大模型进行深度解析？\n\n(提示：包含深度思考过程)')) {
                    btn.textContent = '🧠 LLM 推理中...';
                    previewBox.innerHTML = '<div style="color:#a78bfa; margin-bottom:8px; display:flex; align-items:center; gap:6px;"><span style="display:inline-block;animation:blink 1.5s infinite;">🧠</span> <b>大模型思考过程：</b></div><div id="llm-think-content" style="color:#888; font-size:12px; white-space:pre-wrap; margin-bottom:10px; border-left:2px solid #a78bfa; padding-left:10px; font-family:monospace; line-height:1.6;">正在连接神经元...</div><div id="llm-result" style="color:var(--success); font-weight:bold; font-size:14px; margin-top:10px;"></div>';
                    
                    const response = await fetch('/api/llm/recognize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                        body: JSON.stringify({ filename: selected[0] })
                    });
                    
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let finalResult = ''; let thinkResult = ''; let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, {stream: true});
                        let lines = buffer.split('\n');
                        buffer = lines.pop(); 
                        
                        for (let line of lines) {
                            line = line.trim();
                            if (line.startsWith('data: ')) {
                                if (line === 'data: [DONE]') continue;
                                try {
                                    const data = JSON.parse(line.substring(6));
                                    if (data.error) throw new Error(data.error);
                                    if (data.choices && data.choices.length > 0 && data.choices[0].delta) {
                                        const delta = data.choices[0].delta;
                                        if (delta.reasoning_content) {
                                            if (!thinkResult) document.getElementById('llm-think-content').innerHTML = '';
                                            thinkResult += delta.reasoning_content;
                                            document.getElementById('llm-think-content').innerText = thinkResult;
                                        } else if (delta.content) {
                                            finalResult += delta.content;
                                            document.getElementById('llm-result').innerText = '✨ 解析结果: ' + finalResult;
                                        }
                                        previewBox.scrollTop = previewBox.scrollHeight;
                                    }
                                } catch(e) {
                                    if (e.message && !e.message.includes('Unexpected end of JSON')) {
                                        document.getElementById('llm-result').innerHTML = '<span style="color:var(--danger)">❌ ' + e.message + '</span>';
                                    }
                                }
                            }
                        }
                    }
                    r = { success: true, cleanName: finalResult.trim().replace(/^['"]|['"]$/g, '') };
                    if(!r.cleanName) r = { success: false, error: 'LLM 未返回有效内容' };
                }
            }

            if (r.success) {
                const mode = document.querySelector('input[name="rn_type"]:checked').value;
                let ext = selected[0].includes('.') ? selected[0].substring(selected[0].lastIndexOf('.')) : '';
                if (mode === 'replace') document.getElementById('rn-replace').value = r.cleanName + ext;
                else if (mode === 'seq') { let seqBase = r.cleanName.replace(/\.?E\d+$/, ''); document.getElementById('rn-format').value = seqBase + '.E{n}{ext}'; }
                showToast('识别完成！'); 
                if (document.getElementById('llm-result')) {
                    document.getElementById('llm-result').innerHTML += '<div style="font-size:12px; color:var(--text-muted); margin-top:6px;">(✅ 已自动填入表单，请查看上方效果并保存)</div>';
                } else { updateRenamePreview(); }
            } else { showToast(r.error, 'error'); updateRenamePreview(); }
        } catch (e) { showToast('识别引擎异常', 'error'); updateRenamePreview(); } finally { btn.disabled = false; btn.textContent = oldText; }
    }

    async function initApp(){ 
      document.getElementById('task-sort-select').value = savedSort;
      if(!authToken) { document.getElementById('login-screen').style.display='flex'; return; } 
      try {
          const cfgRes = await api('/api/config'); 
          if (cfgRes.error) return; // 💡 致命错误拦截：防止 token 过期导致静默崩溃
          sysConfig = cfgRes; 
          populateSelects();
          refreshTasks();
          renderTasks(); // 首次主动渲染
          connectWS(); 
          // 轮询已交由统一下发的 WebSocket 接管 
      } catch(e) {
          showToast('无法连接: ' + (e.message || e), 'error');
          document.getElementById('ws-status').textContent = '🔴 服务宕机';
          document.getElementById('ws-status').style.color = 'var(--danger)';
      }
    }
    
    let isDebugOpen = false;
    function toggleDebugPanel() {
      isDebugOpen = !isDebugOpen;
      document.getElementById('debug-panel').style.display = isDebugOpen ? 'flex' : 'none';
      if(isDebugOpen) addDebugLog('SYS', 'Debug 面板已激活，通信拦截正常运行中...');
    }
    window.isDebugPaused = false;
    function addDebugLog(type, msg, isErr=false) {
      if(window.isDebugPaused) return; 
      if(document.getElementById('ignore-stats')?.checked && typeof msg === 'string' && msg.includes('global-stats')) return; 

      const c = document.getElementById('debug-content'); if(!c) return;
      const t = new Date().toLocaleTimeString('en-US', {hour12:false}) + '.' + new Date().getMilliseconds().toString().padStart(3,'0');
      const color = isErr ? '#f14c4c' : (type==='REQ' ? '#c586c0' : (type==='RES' ? '#4ec9b0' : '#dcdcaa'));
      const div = document.createElement('div');
      div.style.borderBottom = '1px dashed #333'; div.style.paddingBottom = '4px'; div.style.marginBottom = '4px'; div.style.wordBreak = 'break-all';
      let msgStr = typeof msg === 'object' ? JSON.stringify(msg) : msg;
      // 密码脱敏防泄露
      if (msgStr && msgStr.includes('"password":')) {
          msgStr = msgStr.replace(/"(password|token)":"[^"]+"/g, '"$1":"[已隐藏]"');
      }
      if(msgStr && msgStr.length > 600) msgStr = msgStr.substring(0, 600) + ' ... [已截断]';
      div.innerHTML = `<span style="color:#858585">[${t}]</span> <span style="color:${color};font-weight:bold;width:50px;display:inline-block;">[${type}]</span> ${msgStr}`;
      c.appendChild(div); c.scrollTop = c.scrollHeight;
    }
    
    const _originalApi = api;
    api = async function(u, o={}) {
      addDebugLog('REQ', `${o.method||'GET'} ${u} ${o.body ? '| '+o.body : ''}`);
      try {
        const res = await _originalApi(u, o);
        addDebugLog('RES', `${u} | ${JSON.stringify(res)}`, res.error || (res.code !== undefined && res.code !== 200));
        return res;
      } catch(e) {
        addDebugLog('ERR', `${u} | ${e.message}`, true);
        throw e;
      }
    };
    window.addEventListener('error', function(e) { addDebugLog('BUG', `${e.message}`, true); });
    window.addEventListener('unhandledrejection', function(e) { addDebugLog('BUG', `Promise: ${e.reason}`, true); });

    
    // 强制挂载到 window，确保哪怕在任何角落都能被点击事件找到
    window.toggleMpMode = function() {
        const isCustom = !document.getElementById('mp-mode-toggle').checked;
        const box = document.getElementById('mp-custom-box');
        if(box) box.style.display = isCustom ? 'grid' : 'none';
    };
    window.togglePansouMode = function() {
        const isCustom = !document.getElementById('ps-mode-toggle').checked;
        const box = document.getElementById('pansou-custom-box');
        if(box) box.style.display = isCustom ? 'block' : 'none';
    };
    
    
    // --- UX 优化：点击遮罩层外部自动关闭弹窗 ---
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('mousedown', function(e) {
                // 确保点击的正是 overlay 本身，而不是它内部的 .modal 子元素
                if (e.target === this) this.classList.remove('show');
            });
        });
    });

    
    // --- 极客交互：全局拖拽种子文件自动解析 ---
    window.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const file = e.dataTransfer?.files[0];
        if(file && file.name.toLowerCase().endsWith('.torrent')) {
            showNewTaskModal(); // 唤起新建弹窗
            const radio = document.querySelector('input[name="task_type"][value="torrent"]');
            if(radio) { radio.checked = true; toggleTaskType(); }
            
            // 劫持文件流并挂载到隐藏的 input 里
            const dt = new DataTransfer(); 
            dt.items.add(file);
            document.getElementById('torrent-file').files = dt.files;
            document.getElementById('t-name').innerText = file.name;
            
            showToast('✅ 种子已就绪，请选择引擎后投递！');
        } else if (file) {
            showToast('❌ 只支持拖拽 .torrent 种子文件哦', 'error');
        }
    });

    
    let dragCounter = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; document.getElementById('drop-zone-overlay').style.display='flex'; });
    window.addEventListener('dragleave', e => { dragCounter--; if(dragCounter===0) document.getElementById('drop-zone-overlay').style.display='none'; });
    window.addEventListener('drop', e => { dragCounter=0; document.getElementById('drop-zone-overlay').style.display='none'; });

    
    const _orgLoadConfig = loadConfig;
    loadConfig = async function() {
        await _orgLoadConfig();
        const input = document.getElementById('upload-status-url');
        if (input) input.value = sysConfig.video_organizer_url || '';
    };

    let voPollTimer = null;
    const _orgSwitchTab = switchTab;
    switchTab = function(id, el) {
        _orgSwitchTab(id, el);
        if (voPollTimer) clearInterval(voPollTimer);
        if (id === 'upload_status') {
            window.fetchVoData();
            voPollTimer = setInterval(window.fetchVoData, 2000);
        }
    };

    window.fetchVoData = async function() {
        if (!document.getElementById('section-upload_status').classList.contains('active')) return;
        try {
            const sRes = await api('/api/vo/status');
            const badge = document.getElementById('vo-status-badge');
            
            if (sRes && sRes.success === false) {
                badge.style.background = '#d63031'; badge.style.color = '#fff'; badge.innerText = '⚠️ 连接失败';
                document.getElementById('vo-term').innerHTML = `<div style="color:#f14c4c; text-align:center; padding-top:100px;">⚠️ ${sRes.error} <br><br> ${sRes.details || ''}</div>`;
                return;
            }

            if (sRes.running) {
                badge.style.background = '#00b894'; badge.style.color = '#fff'; badge.innerText = '● 运行中';
                document.getElementById('vo-pid').innerText = sRes.pid || '-';
                document.getElementById('vo-uptime').innerText = sRes.uptime || '-';
                document.getElementById('vo-mem').innerText = sRes.memory || '-';
            } else {
                badge.style.background = '#d63031'; badge.style.color = '#fff'; badge.innerText = '○ 已停止';
                document.getElementById('vo-pid').innerText = '-';
                document.getElementById('vo-uptime').innerText = '-';
                document.getElementById('vo-mem').innerText = '-';
            }

            const lRes = await api('/api/vo/logs?n=150');
            if (lRes && lRes.logs) {
                const term = document.getElementById('vo-term');
                const isBottom = term.scrollHeight - term.clientHeight <= term.scrollTop + 30;
                
                let logHtml = '';
                lRes.logs.forEach(l => {
                    let cl = l.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    cl = cl.replace(/(\d{4}[\/\-]\d{2}[\/\-]\d{2}[\sT]\d{2}:\d{2}:\d{2})/g, '<span style="color:#569cd6">$1</span>');
                    cl = cl.replace(/\[(INFO)\]/g, '<span style="color:#4ec9b0; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(WARN|WARNING)\]/g, '<span style="color:#ce9178; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(ERROR|ERR)\]/g, '<span style="color:#f14c4c; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(START|STOP|RESTART|CLEAN)\]/g, '<span style="color:#c586c0; font-weight:bold;">[$1]</span>');
                    logHtml += `<div style="border-bottom:1px solid #2a2a2a; padding:2px 0;">${cl}</div>`;
                });
                
                term.innerHTML = logHtml || '<div style="color:#888; text-align:center; padding-top:100px;">暂无日志输出</div>';
                if (isBottom) term.scrollTop = term.scrollHeight;
            }
        } catch (e) {}
    };

    window.voAction = async function(act) {
        const r = await api('/api/vo/' + act, {method: 'POST'});
        if (r.success) {
            showToast('✅ 指令已下发');
            setTimeout(window.fetchVoData, 500);
        } else {
            showToast(r.error || '操作失败', 'error');
        }
    };

    
    // === 终极集群逻辑注入 ===
    window.fetchVoData = function(){}; // 强制瘫痪旧的单点轮询，防止后台报错
    
    let voDashTimer = null;
    let voTermTimer = null;
    window.currentTermNodeId = null;

    const _clusterSwitchTab = switchTab;
    switchTab = function(id, el) {
        _clusterSwitchTab(id, el);
        if (voDashTimer) clearInterval(voDashTimer);
        if (voTermTimer) clearInterval(voTermTimer);
        if (typeof voPollTimer !== 'undefined' && voPollTimer) clearInterval(voPollTimer);
        
        if (id === 'upload_status') {
            renderVoDashboard(true);
            voDashTimer = setInterval(renderVoDashboard, 4000);
        }
    };

    
    window.renderVoSettings = function() {
        const container = document.getElementById('vo-nodes-container');
        if (!container) return;
        container.innerHTML = '';
        const nodes = sysConfig.vo_nodes || [];
        if (nodes.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px; background:var(--bg-body); border-radius:8px; border:1px solid var(--border-color);">暂无节点，请点击下方按钮添加</div>';
        }
        nodes.forEach((node, idx) => {
            const div = document.createElement('div');
            div.className = 'vo-node-row';
            div.style = 'display:flex; gap:15px; align-items:flex-end; background:var(--bg-body); padding:15px; border-radius:8px; border:1px solid var(--border-color);';
            div.innerHTML = `
                <div style="flex:1;">
                    <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">节点名称</label>
                    <input type="text" class="form-control vo-node-name" placeholder="例如: 香港一号机" value="${node.name || ''}">
                </div>
                <div style="flex:2;">
                    <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Web控制台地址 (带端口)</label>
                    <input type="text" class="form-control vo-node-url" placeholder="例如: http://38.45.71.123:10086" value="${node.url || ''}">
                </div>
                <div style="flex: 0 0 auto; padding-bottom:1px;">
                    <button class="btn btn-danger" onclick="removeVoNode(${idx})" style="padding:8px 12px;">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });
    };

    window.addVoNode = function() {
        if (!sysConfig.vo_nodes) sysConfig.vo_nodes = [];
        sysConfig.vo_nodes.push({ id: Date.now(), name: '', url: '' });
        renderVoSettings();
    };

    window.removeVoNode = function(idx) {
        sysConfig.vo_nodes.splice(idx, 1);
        renderVoSettings();
    };

    window.formatLog = function(l) {
        let cl = l.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        cl = cl.replace(/(\d{4}[\/\-]\d{2}[\/\-]\d{2}[\sT]\d{2}:\d{2}:\d{2})/g, '<span style="color:#569cd6">$1</span>');
        cl = cl.replace(/\[(INFO)\]/g, '<span style="color:#4ec9b0; font-weight:bold;">[$1]</span>');
        cl = cl.replace(/\[(WARN|WARNING)\]/g, '<span style="color:#ce9178; font-weight:bold;">[$1]</span>');
        cl = cl.replace(/\[(ERROR|ERR)\]/g, '<span style="color:#f14c4c; font-weight:bold;">[$1]</span>');
        cl = cl.replace(/\[(START|STOP|RESTART|CLEAN)\]/g, '<span style="color:#c586c0; font-weight:bold;">[$1]</span>');
        return `<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cl}</div>`;
    };

    window.renderVoDashboard = async function(force = false) {
        if (!document.getElementById('section-upload_status').classList.contains('active')) return;
        if (!sysConfig.vo_nodes || sysConfig.vo_nodes.length === 0) {
            document.getElementById('vo-cluster-grid').innerHTML = '<div style="color:var(--text-muted); grid-column: 1 / -1; text-align:center; padding:50px 0;">请先在【全局设置】中添加集群节点</div>';
            return;
        }
        
        const grid = document.getElementById('vo-cluster-grid');
        if (force || grid.innerHTML.includes('请先在')) grid.innerHTML = '';

        await Promise.all(sysConfig.vo_nodes.map(async (node) => {
            let card = document.getElementById('vo-card-' + node.id);
            if (!card) {
                card = document.createElement('div');
                card.id = 'vo-card-' + node.id;
                card.style = 'background:var(--bg-body); border-radius:var(--radius-sm); border:1px solid var(--border-color); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.05);';
                card.innerHTML = `
                    <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span id="card-badge-${node.id}" style="width:12px; height:12px; border-radius:50%; background:#ccc; display:inline-block;"></span>
                            <span style="font-weight:bold; font-size:15px; color:var(--text-color);">${node.name}</span>
                        </div>
                        <button class="btn btn-sm btn-primary" onclick="openVoTerminal(${node.id}, '${node.name}')" style="padding:4px 10px; font-size:12px; border-radius:4px;">🖥️ 终端</button>
                    </div>
                    <div style="padding:10px 15px; display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); background:var(--hover-bg);">
                        <span>PID: <b id="card-pid-${node.id}" style="color:var(--text-color)">-</b></span>
                        <span>MEM: <b id="card-mem-${node.id}" style="color:var(--text-color)">-</b></span>
                        <span>UP: <b id="card-up-${node.id}" style="color:var(--text-color)">-</b></span>
                    </div>
                    <div id="card-log-${node.id}" style="background:#1e1e1e; padding:10px 15px; font-family:monospace; font-size:12px; line-height:1.6; color:#aaa; flex:1;">加载中...</div>
                `;
                grid.appendChild(card);
            }

            try {
                const [sRes, lRes] = await Promise.all([
                    api('/api/vo/' + node.id + '/status'),
                    api('/api/vo/' + node.id + '/logs?n=20')
                ]);

                if (sRes && sRes.running) {
                    document.getElementById('card-badge-' + node.id).style.background = '#00b894';
                    document.getElementById('card-pid-' + node.id).innerText = sRes.pid || '-';
                    document.getElementById('card-mem-' + node.id).innerText = sRes.memory || '-';
                    document.getElementById('card-up-' + node.id).innerText = sRes.uptime || '-';
                } else {
                    document.getElementById('card-badge-' + node.id).style.background = '#d63031';
                    document.getElementById('card-pid-' + node.id).innerText = '-';
                    document.getElementById('card-mem-' + node.id).innerText = '-';
                    document.getElementById('card-up-' + node.id).innerText = '-';
                }

                const logBox = document.getElementById('card-log-' + node.id);
                if (lRes && lRes.logs && lRes.logs.length > 0) {
                    logBox.innerHTML = lRes.logs.map(l => formatLog(l)).join('');
                } else if (sRes.success === false) {
                    logBox.innerHTML = `<span style="color:#f14c4c;">⚠️ ${sRes.error}</span>`;
                } else {
                    logBox.innerHTML = '暂无日志输出';
                }
            } catch (e) {
                document.getElementById('card-badge-' + node.id).style.background = '#636e72';
                document.getElementById('card-log-' + node.id).innerHTML = '<span style="color:#f14c4c;">网络故障/失联</span>';
            }
        }));
    };

    window.openVoTerminal = function(id, name) {
        window.currentTermNodeId = id;
        document.getElementById('term-node-name').innerText = name + ' 终端';
        document.getElementById('vo-terminal-modal').style.display = 'flex';
        document.getElementById('term-log-box').innerHTML = '<div style="color:#888; text-align:center; margin-top:100px;">正在建立加密通道...</div>';
        
        if (voDashTimer) clearInterval(voDashTimer);
        pollVoTerminal();
        voTermTimer = setInterval(pollVoTerminal, 2000);
    };

    window.closeVoTerminal = function() {
        document.getElementById('vo-terminal-modal').style.display = 'none';
        window.currentTermNodeId = null;
        if (voTermTimer) clearInterval(voTermTimer);
        
        renderVoDashboard(true);
        voDashTimer = setInterval(renderVoDashboard, 4000);
    };

    window.pollVoTerminal = async function() {
        if (!window.currentTermNodeId) return;
        try {
            const [sRes, lRes] = await Promise.all([
                api('/api/vo/' + window.currentTermNodeId + '/status'),
                api('/api/vo/' + window.currentTermNodeId + '/logs?n=150')
            ]);
            
            const badge = document.getElementById('term-badge');
            if (sRes && sRes.running) {
                badge.style.background = '#00b894'; badge.innerText = '● RUNNING';
                document.getElementById('term-stats').innerText = `PID: ${sRes.pid || '-'} | Mem: ${sRes.memory || '-'} | UP: ${sRes.uptime || '-'}`;
            } else {
                badge.style.background = '#d63031'; badge.innerText = '○ STOPPED';
                document.getElementById('term-stats').innerText = `PID: - | Mem: - | UP: -`;
            }

            if (lRes && lRes.logs) {
                const term = document.getElementById('term-log-box');
                const isBottom = term.scrollHeight - term.clientHeight <= term.scrollTop + 30;
                
                term.innerHTML = lRes.logs.map(l => {
                    let cl = l.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    cl = cl.replace(/(\d{4}[\/\-]\d{2}[\/\-]\d{2}[\sT]\d{2}:\d{2}:\d{2})/g, '<span style="color:#569cd6">$1</span>');
                    cl = cl.replace(/\[(INFO)\]/g, '<span style="color:#4ec9b0; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(WARN|WARNING)\]/g, '<span style="color:#ce9178; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(ERROR|ERR)\]/g, '<span style="color:#f14c4c; font-weight:bold;">[$1]</span>');
                    cl = cl.replace(/\[(START|STOP|RESTART|CLEAN)\]/g, '<span style="color:#c586c0; font-weight:bold;">[$1]</span>');
                    return `<div style="border-bottom:1px solid #2a2a2a; padding:2px 0;">${cl}</div>`;
                }).join('') || '<div style="color:#888; text-align:center; padding-top:100px;">暂无日志输出</div>';
                if (isBottom) term.scrollTop = term.scrollHeight;
            }
        } catch (e) {
            document.getElementById('term-badge').style.background = '#636e72';
            document.getElementById('term-badge').innerText = 'OFFLINE';
        }
    };

    window.voAction = async function(nodeId, act, payload) {
        if (!nodeId) return;
        const opts = { method: 'POST' };
        if (payload) {
            opts.body = JSON.stringify(payload);
        }
        const r = await api('/api/vo/' + nodeId + '/' + act, opts);
        if (r.success) {
            showToast('✅ 指令已下发');
            setTimeout(window.currentTermNodeId ? pollVoTerminal : renderVoDashboard, 500);
        } else {
            showToast(r.error || '节点操作失败', 'error');
        }
    };

    window.startVoWithDir = function() {
        const dir = document.getElementById('vo-custom-dir').value.trim();
        if (!dir) return showToast('请输入要指定的目录路径', 'warning');
        if (confirm('确定要在节点上针对目录 [ ' + dir + ' ] 启动处理吗？')) {
            voAction(window.currentTermNodeId, 'start', { path: dir });
        }
    };

    initApp();


/* =========================================================
 * 🛡️ OOBE_AUTO_REFRESH_INTERCEPTOR: 全局网络防脱节探针
 * ========================================================= */
(function() {
    const isTargetApi = (url) => url && (url.includes('/api/openlist/rename') || url.includes('/api/openlist/remove'));

    function triggerUIRefresh() {
        // 延迟 500ms 等待后端 Alist 状态彻底落盘
        setTimeout(() => {
            // 方案 A：尝试寻找全局刷新函数
            const possibleFuncs = ['loadOpenList', 'fetchOpenList', 'getOpenList', 'refreshList', 'loadDir'];
            let called = false;
            for (let fn of possibleFuncs) {
                if (typeof window[fn] === 'function') {
                    window[fn]();
                    called = true; break;
                }
            }
            
            // 方案 B：如果没找到函数，暴力寻找页面上的【刷新】按钮并模拟点击
            if (!called) {
                const btns = Array.from(document.querySelectorAll('button, div, a, i')).filter(el => 
                    (el.innerText && el.innerText.includes('刷新')) || 
                    (el.title && el.title.includes('刷新')) ||
                    (el.className && (typeof el.className === 'string') && (el.className.includes('refresh') || el.className.includes('sync')))
                );
                for (let btn of btns) {
                    if (btn.offsetParent !== null) { // 确保按钮在屏幕上是可见的
                        btn.click();
                        break;
                    }
                }
            }
        }, 500); 
    }

    // 1. 劫持原生 Fetch 请求
    if (window.fetch) {
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const res = await origFetch.apply(this, args);
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
            if (isTargetApi(url)) {
                res.clone().json().then(data => {
                    if (data && data.success !== false) triggerUIRefresh();
                }).catch(()=>{});
            }
            return res;
        };
    }

    // 2. 劫持 XMLHttpRequest (兼容 Axios 与旧版 Ajax)
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._reqUrl = typeof url === 'string' ? url : url.href;
        origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (isTargetApi(this._reqUrl) && this.status >= 200 && this.status < 300) {
                try {
                    const data = JSON.parse(this.responseText);
                    if (data && data.success !== false) triggerUIRefresh();
                } catch(e) {}
            }
        });
        origSend.apply(this, arguments);
    };
})();
