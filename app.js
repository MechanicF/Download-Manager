const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { Client } = require('ssh2'); 

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Download Manager</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  
  <style>
    :root {
      --primary: #3c8dbc; --primary-hover: #367fa9;
      --success: #00a65a; --warning: #f39c12; --danger: #dd4b39;
      --bg-dark: #222d32; --bg-light: #ecf0f5; --text-main: #333; --text-muted: #777;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    body { background-color: var(--bg-light); color: var(--text-main); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    
    .navbar { background-color: var(--primary); color: white; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 1001; flex-shrink: 0; }
    .navbar .logo { font-size: 18px; font-weight: bold; letter-spacing: 1px; display: flex; align-items: center; }
    .menu-toggle { display: none; cursor: pointer; margin-right: 15px; font-size: 22px; line-height: 1; }
    .navbar .global-stats { display: flex; gap: 15px; font-size: 13px; font-weight: 500; align-items: center; }
    .navbar .stat-item { background: rgba(0,0,0,0.1); padding: 4px 8px; border-radius: 4px; white-space: nowrap; }

    .main-wrapper { display: flex; flex: 1; overflow: hidden; position: relative; }
    .sidebar { width: 230px; background-color: var(--bg-dark); color: #b8c7ce; display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; transition: left 0.3s ease; z-index: 1000; }
    .sidebar-menu { list-style: none; padding-top: 10px; margin: 0; }
    .sidebar-menu .nav-item { padding: 15px 20px; cursor: pointer; border-left: 3px solid transparent; transition: 0.2s; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    .sidebar-menu .nav-item:hover { background: #1e282c; color: #fff; }
    .sidebar-menu .nav-item.active { border-left-color: var(--primary); background: #1e282c; color: #fff; }
    
    .sub-menu { list-style: none; background: #1a2226; display: none; }
    .sub-menu.open { display: block; }
    .sub-item { padding: 10px 20px 10px 40px; cursor: pointer; font-size: 13px; color: #8aa4af; transition: 0.2s; border-left: 3px solid transparent; }
    .sub-item:hover { color: #fff; }
    .sub-item.active { color: #fff; font-weight: bold; border-left-color: var(--primary); padding-left: 37px; }

    .content { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; width: 100%; }
    .section { display: none; flex: 1; flex-direction: column; }
    .section.active { display: flex; }
    
    .toolbar { background: white; padding: 10px 15px; border-radius: 3px; border-top: 3px solid #d2d6de; box-shadow: 0 1px 1px rgba(0,0,0,0.1); margin-bottom: 15px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
    
    .btn { border: none; padding: 6px 12px; border-radius: 3px; cursor: pointer; font-size: 13px; color: white; display: inline-flex; align-items: center; gap: 5px; transition: 0.2s; justify-content: center; }
    .btn-primary { background: var(--primary); } .btn-primary:hover { background: var(--primary-hover); }
    .btn-default { background: #f4f4f4; color: #444; border: 1px solid #ddd; } .btn-default:hover { background: #e7e7e7; }
    .btn-info { background: #00c0ef; }
    .btn-success { background: var(--success); }
    .btn-warning { background: var(--warning); }
    .btn-danger { background: var(--danger); }
    .btn-sm { padding: 4px 8px; font-size: 12px; }

    .task-card { background: white; border-radius: 3px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); margin-bottom: 10px; display: flex; flex-direction: column; border-left: 3px solid #d2d6de; transition: all 0.2s; flex-shrink: 0; }
    .task-card:hover { box-shadow: 0 3px 6px rgba(0,0,0,0.15); }
    .task-card.downloading { border-left-color: var(--primary); }
    .task-card.complete { border-left-color: var(--success); }
    .task-card.paused { border-left-color: var(--warning); }
    .task-card.error { border-left-color: var(--danger); }
    
    .task-header { padding: 10px 15px 5px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    .task-title { font-size: 14px; font-weight: bold; color: var(--primary); word-break: break-all; cursor: pointer; display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 200px; }
    .task-title:hover span.t-name { text-decoration: underline; }
    .task-actions { display: flex; gap: 5px; opacity: 0; transition: opacity 0.2s; flex-wrap: wrap; }
    .task-card:hover .task-actions { opacity: 1; }
    
    .task-body { padding: 0 15px 10px; padding-left: 35px; }
    .progress-wrapper { background: #e9ecef; height: 12px; border-radius: 2px; margin: 8px 0; overflow: hidden; position: relative; }
    .progress-bar { height: 100%; background: var(--primary); transition: width 0.3s linear; }
    .task-card.complete .progress-bar { background: var(--success); }
    .progress-text { position: absolute; width: 100%; text-align: center; top: 0; left: 0; line-height: 12px; font-size: 10px; color: #333; text-shadow: 0 0 2px rgba(255,255,255,0.8); font-weight: bold; }
    
    .task-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 10px; }
    .meta-left { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .meta-right { font-weight: bold; color: #555; }
    
    .tag { padding: 2px 6px; border-radius: 3px; font-size: 11px; color: white; white-space: nowrap; }
    .tag.aria2 { background: #605ca8; }
    .tag.qbit { background: #39cccc; }

    .form-control { padding: 8px 12px; border: 1px solid #ccc; border-radius: 3px; font-size: 13px; outline: none; transition: 0.2s; background: white; max-width: 100%; }
    .form-control:focus { border-color: var(--primary); }
    
    #terminal-container { flex: 1; background: #000; padding: 10px; border-radius: 3px; overflow: hidden; position: relative; min-height: 300px; }
    .xterm { position: absolute; top: 10px; bottom: 10px; left: 10px; right: 10px; }
    .xterm * { font-family: Consolas, "Courier New", "Liberation Mono", monospace !important; letter-spacing: normal !important; }
    .xterm-viewport { overflow-y: auto !important; }

    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; align-items: center; justify-content: center; padding: 10px; }
    .modal-overlay.show { display: flex; }
    .modal { background: white; width: 500px; max-width: 100%; border-radius: 3px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
    .modal-header { background: var(--primary); color: white; padding: 15px; font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .modal-header button.close-btn { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
    .modal-body { padding: 20px; overflow-y: auto; }
    .modal-footer { padding: 15px; border-top: 1px solid #eee; text-align: right; background: #f9f9f9; flex-shrink: 0; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; font-size: 13px; font-weight: bold; color: #555; }

    .toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .toast { background: #333; color: white; padding: 12px 20px; border-radius: 3px; font-size: 13px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); opacity: 0; transform: translateY(20px); transition: all 0.3s; pointer-events: auto; }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.success { border-left: 4px solid var(--success); }
    .toast.error { border-left: 4px solid var(--danger); }
    .toast.warning { border-left: 4px solid var(--warning); }

    .ol-table-wrapper { width: 100%; overflow-x: auto; background: white; border-radius: 3px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); flex: 1; }
    .ol-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 400px; }
    .ol-table th { padding: 12px; border-bottom: 2px solid #ddd; text-align: left; color: #555; font-weight: bold; cursor: pointer; user-select: none; white-space: nowrap; }
    .ol-table th:hover { background: #f9f9f9; }
    .ol-table td { padding: 10px 12px; border-bottom: 1px solid #eee; vertical-align: middle; }
    .ol-table tr:hover td { background: #f0f7fd; }
    .custom-checkbox { margin-right: 10px; cursor: pointer; width: 16px; height: 16px; accent-color: var(--primary); flex-shrink: 0; }
    .ol-filename-cell { display: flex; align-items: center; cursor: pointer; color: var(--primary); font-weight: 500; word-break: break-all; }
    .ol-filename-cell:hover { text-decoration: underline; }
    .sort-icon { font-size: 10px; color: #999; margin-left: 5px; }

    .preview-box { max-height: 180px; overflow-y: auto; background: #222d32; color: #eee; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-top: 10px; }
    .preview-item { margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dashed #444; }
    .preview-item del { color: #ff6b6b; }
    .preview-item span { color: #6bcb77; font-weight: bold; }
    
    .config-card { border: 1px solid #ddd; padding: 15px; border-radius: 4px; margin-bottom: 15px; position: relative; background: #fafafa; }
    .config-card .remove-btn { position: absolute; top: 10px; right: 10px; color: #dd4b39; cursor: pointer; font-weight: bold; border: none; background: none; font-size: 16px; }

    #login-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #1a1a2e; z-index: 999999; display: none; align-items: center; justify-content: center; padding: 20px; }
    .login-box { background: #16213e; padding: 40px 30px; border-radius: 8px; width: 100%; max-width: 400px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .login-box h2 { color: #00d9ff; margin-bottom: 25px; letter-spacing: 1px; font-size: 20px; }
    .login-box input { background: #0f3460; border: 1px solid #1a1a2e; color: #fff; width: 100%; padding: 12px; border-radius: 4px; margin-bottom: 15px; outline: none; transition: 0.3s; font-size: 14px; }
    .login-box input:focus { border-color: #00d9ff; box-shadow: 0 0 5px rgba(0,217,255,0.3); }
    .login-box button { background: #00d9ff; color: #1a1a2e; border: none; padding: 12px; width: 100%; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 15px; transition: 0.3s; }
    .login-box button:hover { background: #00b8d4; }

    /* 📱 移动端响应式核心代码 */
    .mobile-overlay { display: none; position: fixed; top: 50px; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 999; }
    
    @media (max-width: 768px) {
      .menu-toggle { display: inline-block; }
      .navbar { padding: 0 15px; }
      .navbar .logo { font-size: 16px; }
      .navbar .global-stats { gap: 8px; }
      .navbar .stat-item { display: none; } /* 手机端隐藏顶部速度，保持简洁 */
      #ws-status { display: inline-block !important; padding: 4px 6px; }
      
      .sidebar { position: fixed; left: -250px; top: 50px; height: calc(100vh - 50px); box-shadow: 2px 0 5px rgba(0,0,0,0.2); }
      .sidebar.open { left: 0; }
      .mobile-overlay.show { display: block; }
      
      .content { padding: 15px; }
      .toolbar { padding: 10px; gap: 8px; }
      .toolbar > div { width: 100%; flex-wrap: wrap; }
      .toolbar .btn { flex: 1; min-width: 80px; padding: 8px; }
      .toolbar input[type="text"], .toolbar select { width: 100% !important; flex: 1 1 100%; margin-bottom: 5px; }
      
      /* 任务卡片手机端优化 */
      .task-actions { opacity: 1; margin-top: 10px; width: 100%; justify-content: flex-end; }
      .task-actions .btn { flex: 1; }
      .task-meta .meta-left, .task-meta .meta-right { width: 100%; justify-content: space-between; }
      .task-body { padding-left: 15px; }
      .task-title { width: 100%; }

      /* 弹窗手机端优化 */
      .modal-body { padding: 15px; }
      #settings-modal .modal-body { flex-direction: column !important; }
      #settings-modal .modal-body > div { width: 100% !important; border-right: none !important; padding-right: 0 !important; margin-bottom: 20px; }
      
      /* 表格手机端优化 */
      .ol-table th:nth-child(4), .ol-table td:nth-child(4) { display: none; } /* 隐藏修改时间 */
      .ol-table th:nth-child(3), .ol-table td:nth-child(3) { width: 80px; font-size: 12px; } /* 缩小文件大小列 */
      
      .toast-container { bottom: 10px; left: 10px; right: 10px; align-items: center; }
      .toast { width: 100%; text-align: center; }
    }
  </style>
</head>
<body>

  <div id="login-screen">
    <div class="login-box">
      <h2>Download Manager 安全登录</h2>
      <input type="text" id="login-user" placeholder="管理员账号 (默认: admin)">
      <input type="password" id="login-pass" placeholder="管理员密码 (默认: password)" onkeyup="if(event.key==='Enter') doLogin()">
      <button onclick="doLogin()">登 录 系 统</button>
    </div>
  </div>

  <header class="navbar">
    <div class="logo">
      <span class="menu-toggle" onclick="toggleMobileMenu()">☰</span>
      🚀 Manager Pro
    </div>
    <div class="global-stats">
      <div class="stat-item" id="global-speed">⬇️ 0 B/s | ⬆️ 0 B/s</div>
      <div class="stat-item" id="ws-status">🟡 连接中...</div>
      <button class="btn btn-danger btn-sm" onclick="doLogout()">登出</button>
    </div>
  </header>

  <div class="main-wrapper">
    <div class="mobile-overlay" id="mobile-overlay" onclick="closeMobileMenu()"></div>

    <aside class="sidebar">
      <ul class="sidebar-menu">
        <li class="nav-item active" onclick="toggleSubMenu('downloads-submenu', this)">
          <div>📥 我的下载</div><div style="font-size: 10px;" id="dl-arrow">▼</div>
        </li>
        <ul class="sub-menu open" id="downloads-submenu">
          <li class="sub-item active" onclick="filterTasks('all', this)">🟣 全部任务</li>
          <li class="sub-item" onclick="filterTasks('downloading', this)">▶️ 正在下载</li>
          <li class="sub-item" onclick="filterTasks('waiting', this)">⏳ 等待/暂停</li>
          <li class="sub-item" onclick="filterTasks('complete', this)">✅ 已完成/错误</li>
        </ul>

        <li class="nav-item" onclick="switchTab('openlist', this)">📁 云端文件</li>
        <li class="nav-item" onclick="switchTab('ssh', this)">💻 SSH 终端</li>
        
        <li class="nav-item" style="margin-top: 20px; border-top: 1px solid #1a2226;" onclick="openSettingsModal()">⚙️ 全局设置</li>
        
        <li>
          <div style="padding: 10px 20px; font-size: 12px; line-height: 2.0;" id="sidebar-engines-status">
            </div>
        </li>
      </ul>
    </aside>

    <main class="content">
      <div id="section-downloads" class="section active">
        <div class="toolbar" style="justify-content: space-between;">
          <div style="display: flex; gap: 10px; flex: 1;">
            <button class="btn btn-primary" onclick="showNewTaskModal()">➕ 新建任务</button>
            <button class="btn btn-default" onclick="refreshTasks()">🔄 刷新列表</button>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; font-size: 13px; flex: 1;">
            <select id="task-sort-select" class="form-control" style="padding: 6px 8px; font-size: 12px;" onchange="changeTaskSort()">
              <option value="created_at_desc">按时间倒序</option>
              <option value="created_at_asc">按时间正序</option>
              <option value="name_asc">按名称 (A-Z)</option>
              <option value="size_desc">按文件大小</option>
              <option value="progress_desc">按下载进度</option>
            </select>
          </div>
        </div>

        <div class="toolbar" style="background: #f9f9f9; padding: 8px 15px; display: flex; gap: 10px; border-top: none;">
          <label style="cursor: pointer; display: flex; align-items: center; font-weight: bold; color: var(--primary); white-space: nowrap;">
            <input type="checkbox" class="custom-checkbox" id="task-select-all" onclick="toggleAllTasks(this.checked)"> 全选
          </label>
          <div style="border-left: 1px solid #ddd; height: 16px; margin: 0 5px;"></div>
          <button class="btn btn-warning btn-sm" onclick="batchTaskAction('pause')">⏸️ 暂停</button>
          <button class="btn btn-success btn-sm" onclick="batchTaskAction('resume')">▶️ 继续</button>
          <button class="btn btn-danger btn-sm" onclick="batchTaskAction('delete')">🗑️ 删除</button>
          <span id="task-selected-count" style="font-size: 12px; color: #666; margin-left: auto;">已选 0</span>
        </div>

        <div id="task-list" style="overflow-y: auto; flex: 1; padding-bottom: 20px;"></div>
      </div>

      <div id="section-openlist" class="section">
        <div class="toolbar" style="gap: 10px; align-items: center; display: flex;">
          <button class="btn btn-default" onclick="openListGoUp()">⬆️ 上级</button>
          <input type="text" id="openlist-path" class="form-control" style="flex: 1; min-width: 150px;" value="/" readonly>
          <button class="btn btn-primary" onclick="loadOpenList()">🔄 刷新</button>
          
          <button class="btn btn-success" id="btn-ol-download" style="display:none;" onclick="showEngineSelectModalForOL()">📥 下载</button>
          <button class="btn btn-warning" id="btn-ol-rename" style="display:none;" onclick="showRenameModal()">✏️ 重命名</button>
          <button class="btn btn-danger" id="btn-ol-delete" style="display:none;" onclick="deleteSelectedFiles()">🗑️ 删除</button>
        </div>
        <div class="ol-table-wrapper">
          <div id="openlist-content">
            <div style="padding: 40px; text-align: center; color: #888;">请在全局设置中配置 OpenList API 地址</div>
          </div>
        </div>
      </div>

      <div id="section-ssh" class="section">
        <div class="toolbar" style="gap: 10px; align-items: center; flex-wrap: wrap;">
          <select id="ssh-history" class="form-control" onchange="loadHistory(this.value)">
            <option value="">-- 历史记录 --</option>
          </select>
          <input type="text" id="ssh-host" placeholder="服务器 IP" class="form-control">
          <input type="text" id="ssh-port" placeholder="端口 (22)" value="22" class="form-control">
          <input type="text" id="ssh-user" placeholder="用户名 (root)" class="form-control">
          <select id="ssh-auth-type" class="form-control" onchange="toggleAuthType()">
            <option value="password">密码登录</option><option value="key">私钥登录</option>
          </select>
          <input type="password" id="ssh-pass" placeholder="服务器密码" class="form-control">
          <input type="file" id="ssh-key-file" class="form-control" style="display:none;" accept=".pem,.id_rsa,*" onchange="onKeySelect(event)">
          <button class="btn btn-primary" onclick="connectSSH()" id="btn-ssh-conn">🔌 连接</button>
          <button class="btn btn-danger" onclick="disconnectSSH()" id="btn-ssh-disc" style="display:none;">❌ 断开</button>
        </div>
        <div id="terminal-container"></div>
      </div>
    </main>
  </div>

  <div class="modal-overlay" id="new-task-modal">
    <div class="modal">
      <div class="modal-header">新建下载任务 <button class="close-btn" onclick="hideModal('new-task-modal')">✖</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label>下载节点指派</label>
          <select id="task-engine-select" class="form-control" style="width:100%;"></select>
        </div>
        <div class="form-group">
          <label>下载链接 (支持多行)</label>
          <textarea id="url-input" class="form-control" style="resize:vertical;min-height:120px;width:100%;"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('new-task-modal')">取消</button>
        <button class="btn btn-primary" onclick="addDownload()">立即下载</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="engine-select-modal">
    <div class="modal" style="width: 400px;">
      <div class="modal-header">选择下载节点 <button class="close-btn" onclick="hideModal('engine-select-modal')">✖</button></div>
      <div class="modal-body">
        <p style="margin-bottom: 10px; font-size: 13px; color: #666;">请选择将选中的网盘文件推送至哪个本地下载节点：</p>
        <select id="ol-engine-select" class="form-control" style="width:100%; margin-bottom: 20px;"></select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('engine-select-modal')">取消</button>
        <button class="btn btn-success" onclick="executeOlDownload()">🚀 确认推送</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="settings-modal">
    <div class="modal" style="width: 900px; max-width: 95vw;">
      <div class="modal-header">RPC / API 核心设置 <button class="close-btn" onclick="hideModal('settings-modal')">✖</button></div>
      <div class="modal-body" style="display: flex; gap: 20px; align-items: flex-start;">
        <div style="flex: 1.5; border-right: 1px solid #eee; padding-right: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="color: var(--primary); margin:0;">Aria2 节点集群</h4>
            <button class="btn btn-success btn-sm" onclick="addAria2NodeForm()">➕ 新增节点</button>
          </div>
          <div id="aria2-nodes-container" style="max-height: 50vh; overflow-y: auto; padding-right: 5px;"></div>
        </div>
        <div style="flex: 1;">
          <h4 style="margin-bottom: 10px; color: var(--danger);">🔒 面板安全设置</h4>
          <div class="config-card" style="padding-bottom: 5px;">
            <div class="form-group"><label>面板登录账号</label><input type="text" id="panel-user" class="form-control"></div>
            <div class="form-group"><label>面板登录密码</label><input type="password" id="panel-pass" class="form-control" placeholder="留空则不修改密码"></div>
          </div>
          <h4 style="margin-bottom: 10px; color: var(--primary);">qBittorrent 配置</h4>
          <div class="config-card" style="padding-bottom: 5px;">
            <div class="form-group"><label>WebUI API URL</label><input type="text" id="qbit-url" class="form-control" placeholder="例如 http://IP:8080"></div>
            <div class="form-group"><label>用户名</label><input type="text" id="qbit-user" class="form-control"></div>
            <div class="form-group"><label>密码</label><input type="password" id="qbit-pass" class="form-control"></div>
          </div>
          <h4 style="margin-bottom: 10px; color: var(--primary); margin-top: 20px;">OpenList 配置</h4>
          <div class="config-card" style="padding-bottom: 5px;">
            <div class="form-group"><label>API 地址 (例: http://IP:5244)</label><input type="text" id="openlist-url" class="form-control"></div>
            <div class="form-group"><label>API Token (必须)</label><input type="password" id="openlist-token" class="form-control"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('settings-modal')">取消</button>
        <button class="btn btn-primary" onclick="saveSettings()">保存配置</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="rename-modal">
    <div class="modal" style="width: 550px;">
      <div class="modal-header"><span id="rename-title">重命名文件</span> <button class="close-btn" onclick="hideModal('rename-modal')">✖</button></div>
      <div class="modal-body" id="rename-body-batch">
        <div style="margin-bottom: 15px; display: flex; gap: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;" id="rename-mode-selector">
          <label style="cursor: pointer; font-weight: bold; color: var(--primary);"><input type="radio" name="batch-rename-mode" value="replace" checked onchange="toggleBatchMode()"> 🔍 查找替换</label>
          <label style="cursor: pointer; font-weight: bold; color: var(--primary);"><input type="radio" name="batch-rename-mode" value="sequence" onchange="toggleBatchMode()"> 🔢 顺序命名</label>
        </div>
        <div id="batch-mode-replace">
          <div class="form-group"><label>查找 (原文本)</label><input type="text" id="rename-batch-search" class="form-control" oninput="generateRenamePreview()"></div>
          <div class="form-group"><label>替换为 (新文本)</label><input type="text" id="rename-batch-replace" class="form-control" oninput="generateRenamePreview()" placeholder="可留空以删除"></div>
        </div>
        <div id="batch-mode-sequence" style="display:none;">
          <div style="background: #f0f7fd; padding: 10px; border-radius: 4px; margin-bottom: 10px; font-size: 12px; color: #555;">占位符：<code>{number}</code> (自增数字) | <code>{ext}</code> (原文件扩展名)</div>
          <div class="form-group"><label>新文件名格式</label><input type="text" id="rename-batch-format" class="form-control" oninput="generateRenamePreview()" placeholder="例如: 第{number}集{ext}"></div>
          <div class="form-group"><label>起始数值</label><input type="number" id="rename-batch-start" class="form-control" value="1" oninput="generateRenamePreview()"></div>
        </div>
        <label style="display:block; margin-top: 15px; font-size: 13px; font-weight: bold; color: #555;">修改预览:</label>
        <div class="preview-box" id="rename-preview-box">请输入规则以查看预览...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('rename-modal')">取消</button>
        <button class="btn btn-primary" id="btn-submit-rename" onclick="submitRename()">确认修改</button>
      </div>
    </div>
  </div>

  <div class="toast-container" id="toast-container"></div>

  <script>
    let ws = null; let tasks = []; let refreshInterval = null;
    let term = null, fitAddon = null, sshWs = null;
    let currentKeyContent = ""; 
    let sysConfig = {};
    let aria2Nodes = []; 
    
    // 移动端菜单控制
    function toggleMobileMenu() {
      document.querySelector('.sidebar').classList.toggle('open');
      document.getElementById('mobile-overlay').classList.toggle('show');
    }
    function closeMobileMenu() {
      document.querySelector('.sidebar').classList.remove('open');
      document.getElementById('mobile-overlay').classList.remove('show');
    }

    let authToken = localStorage.getItem('manager_auth_token') || '';
    if (!authToken) document.getElementById('login-screen').style.display = 'flex';

    let currentTaskFilter = 'all'; 
    let taskSortBy = 'created_at'; 
    let taskSortDesc = true;
    let selectedTasks = new Set();
    
    let currentOpenListPath = '/';
    let olFiles = [];
    let olSelected = new Set();
    let olSortBy = 'name'; 
    let olSortDesc = false;

    async function api(url, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
      const res = await fetch(url, { headers, ...options });
      
      if (res.status === 401) {
        document.getElementById('login-screen').style.display = 'flex';
        if (ws) { ws.onclose = null; ws.close(); }
        if (refreshInterval) clearInterval(refreshInterval);
        return { error: 'Unauthorized' };
      }
      try { return await res.json(); } catch { return {}; }
    }

    async function doLogin() {
      const u = document.getElementById('login-user').value || 'admin';
      const p = document.getElementById('login-pass').value || 'password';
      const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({username: u, password: p})
      });
      const data = await res.json();
      if (data.success) {
        authToken = data.token;
        localStorage.setItem('manager_auth_token', authToken);
        document.getElementById('login-screen').style.display = 'none';
        showToast('登录成功！', 'success');
        initApp();
      } else {
        showToast('账号或密码错误', 'error');
      }
    }

    function doLogout() {
      authToken = '';
      localStorage.removeItem('manager_auth_token');
      location.reload();
    }
    
    function showModal(id) { document.getElementById(id).classList.add('show'); }
    function hideModal(id) { document.getElementById(id).classList.remove('show'); }
    
    async function openSettingsModal() {
      try { 
        closeMobileMenu();
        await loadConfig(); 
        showModal('settings-modal'); 
      } catch (e) { showToast('加载设置界面失败', 'error'); }
    }

    function showNewTaskModal() { 
      document.getElementById('url-input').value = ''; 
      populateEngineSelector('task-engine-select');
      showModal('new-task-modal'); 
    }
    function showEngineSelectModalForOL() {
      if (olSelected.size === 0) return;
      populateEngineSelector('ol-engine-select');
      showModal('engine-select-modal');
    }
    
    function populateEngineSelector(elementId) {
      const sel = document.getElementById(elementId);
      sel.innerHTML = '<option value="auto">✨ 自动分配 (Aria2/qBit)</option>';
      sel.innerHTML += '<option value="qbit">🟠 qBittorrent</option>';
      if (sysConfig.aria2 && Array.isArray(sysConfig.aria2)) {
        sysConfig.aria2.forEach((node, idx) => {
          sel.innerHTML += \`<option value="aria2_\${idx}">🟣 Aria2: \${node.name}</option>\`;
        });
      }
    }

    function showToast(msg, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = \`toast \${type}\`;
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 10);
      setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }
    function formatTime(seconds) {
      if (!seconds || seconds === Infinity || seconds <= 0) return '--:--:--';
      const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
      return \`\${h > 0 ? h + 'h ' : ''}\${m}m \${s}s\`;
    }

    function toggleSubMenu(menuId, el) {
      const menu = document.getElementById(menuId);
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.sub-menu').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.sidebar-menu .nav-item').forEach(li => li.classList.remove('active'));
      el.classList.add('active');
      
      if (!isOpen) { menu.classList.add('open'); document.getElementById('dl-arrow').textContent = '▲'; } 
      else { document.getElementById('dl-arrow').textContent = '▼'; }
      
      document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
      document.getElementById('section-downloads').classList.add('active');
    }

    function filterTasks(filterType, el) {
      document.querySelectorAll('.sub-item').forEach(li => li.classList.remove('active'));
      el.classList.add('active');
      currentTaskFilter = filterType;
      selectedTasks.clear(); 
      renderTasks();
      closeMobileMenu();
    }

    function switchTab(tabId, el) {
      document.querySelectorAll('.sidebar-menu .nav-item').forEach(li => li.classList.remove('active'));
      document.querySelectorAll('.sub-menu').forEach(m => m.classList.remove('open'));
      document.getElementById('dl-arrow').textContent = '▼';
      
      el.classList.add('active');
      document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
      document.getElementById('section-' + tabId).classList.add('active');
      
      if (tabId === 'ssh') {
        if (!term) {
          term = new Terminal({ theme: { background: '#000' }, cursorBlink: true, fontSize: 14, fontFamily: 'Consolas, "Courier New", "Liberation Mono", monospace' });
          fitAddon = new FitAddon.FitAddon();
          term.loadAddon(fitAddon);
          term.open(document.getElementById('terminal-container'));
          term.writeln('Welcome to Web SSH Terminal');
          term.onData(data => { if (sshWs && sshWs.readyState === WebSocket.OPEN) sshWs.send(JSON.stringify({ type: 'data', data })); });
          renderHistoryList();
        }
        setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 200);
        window.addEventListener('resize', () => { if (fitAddon) fitAddon.fit(); });
      } else if (tabId === 'openlist') {
        if (olFiles.length === 0) loadOpenList(currentOpenListPath);
      }
      closeMobileMenu();
    }

    function changeTaskSort() {
      const val = document.getElementById('task-sort-select').value;
      const parts = val.split('_');
      taskSortDesc = parts.pop() === 'desc';
      taskSortBy = parts.join('_');
      renderTasks();
    }

    function toggleTask(taskId, isChecked) {
      if (isChecked) selectedTasks.add(taskId); else selectedTasks.delete(taskId);
      updateTaskToolbar();
    }

    function toggleAllTasks(isChecked) {
      const visibleTasks = getFilteredTasks();
      if (isChecked) visibleTasks.forEach(t => selectedTasks.add(t.id)); else selectedTasks.clear();
      renderTasks();
    }

    function updateTaskToolbar() {
      document.getElementById('task-selected-count').textContent = \`已选 \${selectedTasks.size}\`;
      const visibleTasks = getFilteredTasks();
      document.getElementById('task-select-all').checked = visibleTasks.length > 0 && selectedTasks.size === visibleTasks.length;
    }

    async function batchTaskAction(action) {
      if (selectedTasks.size === 0) return showToast('请先选择任务', 'warning');
      const actionName = action === 'pause' ? '暂停' : (action === 'resume' ? '继续' : '删除');
      if (action === 'delete' && !confirm(\`确定要彻底删除选中的 \${selectedTasks.size} 个任务吗？\`)) return;
      
      showToast(\`正在批量执行\${actionName}...\`, 'success');
      const ids = Array.from(selectedTasks);
      
      const res = await api('/api/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, action }) });
      if (res.success) {
        showToast(\`批量\${actionName}成功\`, 'success');
        selectedTasks.clear();
        refreshTasks();
      } else { showToast('部分或全部任务执行失败', 'error'); }
    }

    function getFilteredTasks() {
      if (!tasks) return [];
      return tasks.filter(t => {
        if (currentTaskFilter === 'all') return true;
        if (currentTaskFilter === 'downloading') return t.status === 'downloading';
        if (currentTaskFilter === 'waiting') return t.status === 'waiting' || t.status === 'paused';
        if (currentTaskFilter === 'complete') return t.status === 'complete' || t.status === 'error';
        return true;
      });
    }

    function renderTasks() {
      const list = document.getElementById('task-list');
      let filteredTasks = getFilteredTasks();
      
      filteredTasks.sort((a, b) => {
        let cmp = 0;
        if (taskSortBy === 'created_at') cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0);
        else if (taskSortBy === 'name') cmp = (a.filename || '').localeCompare(b.filename || '', undefined, {numeric: true, sensitivity: 'base'});
        else if (taskSortBy === 'size') cmp = a.total_size - b.total_size;
        else if (taskSortBy === 'progress') cmp = a.progress - b.progress;
        return taskSortDesc ? -cmp : cmp;
      });

      updateTaskToolbar();

      if (filteredTasks.length === 0) { 
        list.innerHTML = '<div style="text-align: center; padding: 60px; color: #999;"><i>📭</i><p>当前分类没有任务</p></div>'; 
        return; 
      }
      
      const statusText = { 'downloading': '下载中', 'waiting': '等待中', 'paused': '已暂停', 'complete': '已完成', 'error': '错误' };
      list.innerHTML = filteredTasks.map(t => {
        let eta = t.speed > 0 ? (t.total_size - t.downloaded_size) / t.speed : 0;
        let progress = t.progress ? parseFloat(t.progress).toFixed(2) : 0;
        if(t.status === 'complete') progress = 100;
        
        let engineTag = t.engine;
        let engineClass = 'aria2';
        if(t.engine === 'qbit') { engineTag = 'QBIT'; engineClass = 'qbit'; }
        else if(t.engine.startsWith('aria2_')) {
          const idx = parseInt(t.engine.split('_')[1]);
          if(sysConfig.aria2 && sysConfig.aria2[idx]) engineTag = 'A2: ' + sysConfig.aria2[idx].name;
        }

        const isChecked = selectedTasks.has(t.id) ? 'checked' : '';

        return \`
        <div class="task-card \${t.status}">
          <div class="task-header">
            <div class="task-title" title="\${t.filename}">
              <input type="checkbox" class="custom-checkbox" value="\${t.id}" \${isChecked} onclick="toggleTask('\${t.id}', this.checked)">
              <span class="t-name">\${t.filename || '获取信息中...'}</span>
            </div>
            <div class="task-actions">
              \${t.status !== 'paused' && t.status !== 'complete' && t.status !== 'error' ? \`<button class="btn btn-warning btn-sm" onclick="singleAction('\${t.id}', 'pause')">⏸️ 暂停</button>\` : ''}
              \${t.status === 'paused' || t.status === 'error' ? \`<button class="btn btn-success btn-sm" onclick="singleAction('\${t.id}', 'resume')">▶️ 继续</button>\` : ''}
              <button class="btn btn-danger btn-sm" onclick="singleAction('\${t.id}', 'delete')">🗑️ 移除</button>
            </div>
          </div>
          <div class="task-body">
            <div class="progress-wrapper">
              <div class="progress-bar" style="width: \${progress}%"></div>
              <div class="progress-text">\${progress}%</div>
            </div>
            <div class="task-meta">
              <div class="meta-left">
                <span><span class="tag \${engineClass}" title="\${t.engine}">\${engineTag}</span></span>
                <span>状态: \${statusText[t.status] || t.status}</span>
                <span>\${formatSize(t.downloaded_size)} / \${formatSize(t.total_size)}</span>
              </div>
              <div class="meta-right">
                \${['downloading'].includes(t.status) ? \`⬇️ \${formatSize(t.speed)}/s &nbsp;&nbsp; ⏳ \${formatTime(eta)}\` : ''}
              </div>
            </div>
          </div>
        </div>
      \`}).join('');
    }

    async function singleAction(id, type) {
      if (type === 'delete' && !confirm('确定要删除此任务吗？')) return;
      const btn = event.currentTarget; btn.textContent = '执行中...'; btn.disabled = true;
      await api(\`/api/tasks/\${id}/\${type}\`, { method: 'POST' }); refreshTasks();
    }

    async function loadOpenList(path = currentOpenListPath) {
      const container = document.getElementById('openlist-content');
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary);">正在加载数据...</div>';
      olSelected.clear(); updateOlToolbar();
      
      const res = await api('/api/openlist/list', { method: 'POST', body: JSON.stringify({ path }) });
      if (res.error || res.code !== 200) {
        container.innerHTML = \`<div style="color:red; padding: 20px; text-align:center;">请求失败: \${res.error || res.message}</div>\`; return;
      }

      currentOpenListPath = path;
      document.getElementById('openlist-path').value = path;
      olFiles = res.data.content || [];
      renderOpenList();
    }

    function sortOpenList(field) {
      if (olSortBy === field) { olSortDesc = !olSortDesc; }
      else { olSortBy = field; olSortDesc = false; }
      renderOpenList();
    }

    function renderOpenList() {
      const container = document.getElementById('openlist-content');
      if (olFiles.length === 0) { container.innerHTML = '<div style="padding: 40px; text-align: center; color: #888;">文件夹为空</div>'; return; }

      olFiles.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; 
        let cmp = 0;
        if (olSortBy === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        else if (olSortBy === 'size') cmp = a.size - b.size;
        else if (olSortBy === 'time') cmp = new Date(a.modified) - new Date(b.modified);
        return olSortDesc ? -cmp : cmp;
      });

      const getIcon = (f) => f === olSortBy ? (olSortDesc ? '▼' : '▲') : '';
      const allChecked = olFiles.length > 0 && olSelected.size === olFiles.length ? 'checked' : '';

      let html = \`<table class="ol-table"><thead><tr><th style="width: 40px; text-align:center;"><input type="checkbox" class="custom-checkbox" \${allChecked} onclick="toggleAllOlFiles(this.checked)"></th><th onclick="sortOpenList('name')">名称 <span class="sort-icon">\${getIcon('name')}</span></th><th style="width: 120px;" onclick="sortOpenList('size')">大小 <span class="sort-icon">\${getIcon('size')}</span></th><th style="width: 180px;" onclick="sortOpenList('time')">修改时间 <span class="sort-icon">\${getIcon('time')}</span></th></tr></thead><tbody>\`;

      olFiles.forEach(f => {
        const isChecked = olSelected.has(f.name) ? 'checked' : '';
        const icon = f.is_dir ? '📁' : '📄';
        const size = f.is_dir ? '-' : formatSize(f.size);
        const time = new Date(f.modified).toLocaleString();
        const action = f.is_dir ? \`loadOpenList('\${currentOpenListPath === '/' ? '' : currentOpenListPath}/\${f.name}')\` : \`toggleOlFile('\${f.name}', !\${isChecked})\`;

        html += \`<tr><td style="text-align:center;"><input type="checkbox" class="custom-checkbox" value="\${f.name}" \${isChecked} onclick="toggleOlFile('\${f.name}', this.checked)"></td><td><div class="ol-filename-cell" onclick="\${action}"><span style="font-size: 16px; margin-right: 10px;">\${icon}</span><span title="\${f.name}">\${f.name}</span></div></td><td style="color: #666;">\${size}</td><td style="color: #999;">\${time}</td></tr>\`;
      });
      html += \`</tbody></table>\`;
      container.innerHTML = html;
      updateOlToolbar();
    }

    function toggleOlFile(name, isChecked) {
      if (isChecked) olSelected.add(name); else olSelected.delete(name);
      renderOpenList();
    }
    function toggleAllOlFiles(isChecked) {
      if (isChecked) { olSelected = new Set(olFiles.map(f => f.name)); } else { olSelected.clear(); }
      renderOpenList();
    }
    function updateOlToolbar() {
      const show = olSelected.size > 0;
      document.getElementById('btn-ol-download').style.display = show ? 'inline-block' : 'none';
      document.getElementById('btn-ol-rename').style.display = show ? 'inline-block' : 'none';
      document.getElementById('btn-ol-delete').style.display = show ? 'inline-block' : 'none';
    }
    function openListGoUp() {
      if (currentOpenListPath === '/') return;
      const parts = currentOpenListPath.split('/'); parts.pop();
      loadOpenList(parts.join('/') || '/');
    }

    async function executeOlDownload() {
      const engine = document.getElementById('ol-engine-select').value;
      hideModal('engine-select-modal');
      
      const filesToDownload = Array.from(olSelected);
      if(filesToDownload.length === 0) return;
      
      showToast(\`开始提取 \${filesToDownload.length} 个直链...\`, 'success');
      
      let successCount = 0;
      for(const name of filesToDownload) {
        const path = currentOpenListPath === '/' ? \`/\${name}\` : \`\${currentOpenListPath}/\${name}\`;
        const res = await api('/api/openlist/get', { method: 'POST', body: JSON.stringify({ path }) });
        
        if (res.code === 200 && res.data && res.data.raw_url) {
          const dlRes = await api('/api/download', { method: 'POST', body: JSON.stringify({ url: res.data.raw_url, engine }) });
          if(dlRes.success) successCount++;
        }
      }
      showToast(\`推送完毕: 成功 \${successCount} 个任务\`, 'success');
      refreshTasks();
    }

    function toggleBatchMode() {
      const mode = document.querySelector('input[name="batch-rename-mode"]:checked').value;
      document.getElementById('batch-mode-replace').style.display = mode === 'replace' ? 'block' : 'none';
      document.getElementById('batch-mode-sequence').style.display = mode === 'sequence' ? 'block' : 'none';
      generateRenamePreview();
    }

    function calculateNewName(oldName, mode) {
      if (mode === 'replace') {
        const searchStr = document.getElementById('rename-batch-search').value;
        const replaceStr = document.getElementById('rename-batch-replace').value;
        if (!searchStr) return oldName;
        return oldName.split(searchStr).join(replaceStr);
      } else if (mode === 'sequence') {
        const formatStr = document.getElementById('rename-batch-format').value;
        let num = window._seqCurrentNum++; 
        if (!formatStr) return oldName;
        const dotIdx = oldName.lastIndexOf('.');
        const ext = dotIdx > -1 ? oldName.substring(dotIdx) : '';
        let newName = formatStr.replace(/\\{ext\\}/g, ext);
        if (newName.includes('{number}')) { newName = newName.replace(/\\{number\\}/g, num); } 
        else { newName = newName + num; }
        return newName;
      }
      return oldName;
    }

    function generateRenamePreview() {
      const box = document.getElementById('rename-preview-box');
      if (olSelected.size === 0) { box.innerHTML = ''; return; }
      
      const mode = document.querySelector('input[name="batch-rename-mode"]:checked').value;
      const selectedNames = Array.from(olSelected).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      
      window._seqCurrentNum = parseInt(document.getElementById('rename-batch-start').value) || 1;
      let html = '';
      
      selectedNames.forEach(oldName => {
        let newName = calculateNewName(oldName, mode);
        if (oldName !== newName) {
          html += \`<div class="preview-item"><del>\${oldName}</del><br>➜ <span>\${newName}</span></div>\`;
        } else {
          html += \`<div class="preview-item" style="opacity:0.5;">\${oldName} (无变化)</div>\`;
        }
      });
      box.innerHTML = html || '没有规则匹配，文件名将保持不变。';
    }

    function showRenameModal() {
      if (olSelected.size === 0) return;
      const isSingle = olSelected.size === 1;
      document.getElementById('rename-title').textContent = isSingle ? '重命名文件' : \`批量重命名 (\${olSelected.size} 个文件)\`;
      
      document.querySelector('input[name="batch-rename-mode"][value="replace"]').checked = true;
      if(isSingle) {
        document.getElementById('rename-batch-search').value = Array.from(olSelected)[0];
        document.getElementById('rename-mode-selector').style.display = 'none';
      } else {
        document.getElementById('rename-batch-search').value = '';
        document.getElementById('rename-mode-selector').style.display = 'flex';
      }
      document.getElementById('rename-batch-replace').value = '';
      document.getElementById('rename-batch-format').value = '{number}{ext}';
      document.getElementById('rename-batch-start').value = '1';
      
      toggleBatchMode();
      showModal('rename-modal');
      generateRenamePreview();
    }

    async function submitRename() {
      const btn = document.getElementById('btn-submit-rename');
      btn.textContent = '处理中...'; btn.disabled = true;

      const mode = document.querySelector('input[name="batch-rename-mode"]:checked').value;
      const selectedNames = Array.from(olSelected).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      
      window._seqCurrentNum = parseInt(document.getElementById('rename-batch-start').value) || 1;
      let successCount = 0;

      for (const oldName of selectedNames) {
        const newName = calculateNewName(oldName, mode);
        if (newName !== oldName) {
          const path = currentOpenListPath === '/' ? \`/\${oldName}\` : \`\${currentOpenListPath}/\${oldName}\`;
          const res = await api('/api/openlist/rename', { method: 'POST', body: JSON.stringify({ name: newName, path }) });
          if(res.code === 200) successCount++;
        }
      }

      btn.textContent = '确认修改'; btn.disabled = false;
      hideModal('rename-modal');
      showToast(\`重命名完成，成功处理 \${successCount} 个文件\`);
      loadOpenList(currentOpenListPath);
    }

    async function deleteSelectedFiles() {
      if (!confirm(\`确定要彻底删除选中的 \${olSelected.size} 个文件/文件夹吗？\`)) return;
      showToast('正在删除...', 'warning');
      const names = Array.from(olSelected);
      const res = await api('/api/openlist/remove', { method: 'POST', body: JSON.stringify({ dir: currentOpenListPath, names }) });
      if (res.code === 200) { showToast('删除成功', 'success'); loadOpenList(currentOpenListPath); } 
      else { showToast('删除失败: ' + res.message, 'error'); }
    }

    async function loadConfig() {
      const config = await api('/api/config');
      if (config.error) throw new Error(config.error); 
      sysConfig = config; 
      
      aria2Nodes = config.aria2 || [];
      renderAria2Nodes();
      
      document.getElementById('panel-user').value = config.auth?.username || 'admin';
      document.getElementById('panel-pass').value = ''; 
      
      document.getElementById('qbit-url').value = config.qbit?.baseUrl || '';
      document.getElementById('qbit-user').value = config.qbit?.username || '';
      document.getElementById('qbit-pass').value = config.qbit?.password || '';
      document.getElementById('openlist-url').value = config.openlist?.url || '';
      document.getElementById('openlist-token').value = config.openlist?.token || '';
    }

    function renderAria2Nodes() {
      const container = document.getElementById('aria2-nodes-container');
      container.innerHTML = '';
      aria2Nodes.forEach((node, idx) => {
        container.innerHTML += \`
          <div class="config-card">
            <button class="remove-btn" onclick="removeAria2Node(\${idx})" title="删除节点">✖</button>
            <div class="form-group"><label>节点名称</label><input type="text" id="a2-name-\${idx}" class="form-control" value="\${node.name}"></div>
            <div class="form-group"><label>JSON-RPC URL</label><input type="text" id="a2-url-\${idx}" class="form-control" value="\${node.url}" placeholder="例如 http://127.0.0.1:6800/jsonrpc"></div>
            <div class="form-group"><label>RPC 密钥 (Secret)</label><input type="password" id="a2-sec-\${idx}" class="form-control" value="\${node.secret}"></div>
          </div>
        \`;
      });
      if(aria2Nodes.length === 0) container.innerHTML = '<div style="color:#999; text-align:center; padding: 20px;">暂无 Aria2 节点</div>';
    }

    function addAria2NodeForm() {
      aria2Nodes.push({ name: '新 Aria2 节点', url: '', secret: '' });
      renderAria2Nodes();
    }
    function removeAria2Node(idx) {
      if(confirm('确定删除此节点配置吗？')) { aria2Nodes.splice(idx, 1); renderAria2Nodes(); }
    }

    async function saveSettings() {
      for(let i=0; i<aria2Nodes.length; i++) {
        aria2Nodes[i].name = document.getElementById(\`a2-name-\${i}\`).value;
        aria2Nodes[i].url = document.getElementById(\`a2-url-\${i}\`).value;
        aria2Nodes[i].secret = document.getElementById(\`a2-sec-\${i}\`).value;
      }
      const pUser = document.getElementById('panel-user').value;
      const pPass = document.getElementById('panel-pass').value || sysConfig.auth.password;
      
      const config = {
        auth: { username: pUser, password: pPass },
        aria2: aria2Nodes,
        qbit: { baseUrl: document.getElementById('qbit-url').value, username: document.getElementById('qbit-user').value, password: document.getElementById('qbit-pass').value },
        openlist: { url: document.getElementById('openlist-url').value, token: document.getElementById('openlist-token').value }
      };
      
      const res = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
      if (res.success) { 
        hideModal('settings-modal'); 
        showToast('设置已保存', 'success'); 
        
        authToken = btoa(pUser + ':' + pPass);
        localStorage.setItem('manager_auth_token', authToken);
        
        sysConfig = config; 
        document.getElementById('panel-pass').value = '';
        refreshTasks(); 
        
        if(ws) { ws.onclose = null; ws.close(); }
        connectWS(); 
      }
    }

    async function addDownload() {
      const url = document.getElementById('url-input').value.trim();
      const engine = document.getElementById('task-engine-select').value;
      if (!url) return showToast('链接不能为空', 'error');
      const res = await api('/api/download', { method: 'POST', body: JSON.stringify({ url, engine }) });
      if (res.success) { hideModal('new-task-modal'); showToast(res.message); refreshTasks(); } else showToast('添加失败', 'error');
    }

    async function refreshTasks() {
      tasks = await api('/api/tasks'); 
      if (tasks.error) return; 
      renderTasks();
      const stats = await api('/api/global-stats');
      
      document.getElementById('global-speed').textContent = \`⬇️ \${formatSize((stats.aria2Speed || 0) + (stats.qbitSpeed || 0))}/s\`;
      
      let sbHtml = \`QBit: <span style="color: \${stats.qbit ? '#00a65a' : '#dd4b39'}">\${stats.qbit ? '已连接' : '离线'}</span><br>\`;
      if(sysConfig.aria2 && Array.isArray(sysConfig.aria2)) {
        sysConfig.aria2.forEach((node, i) => {
          const isOnline = stats.aria2Nodes && stats.aria2Nodes[i];
          sbHtml += \`\${node.name}: <span style="color: \${isOnline ? '#00a65a' : '#dd4b39'}">\${isOnline ? '已连接' : '离线'}</span><br>\`;
        });
      }
      document.getElementById('sidebar-engines-status').innerHTML = sbHtml;
    }

    function toggleAuthType() { const type = document.getElementById('ssh-auth-type').value; document.getElementById('ssh-pass').style.display = type === 'password' ? 'inline-block' : 'none'; document.getElementById('ssh-key-file').style.display = type === 'key' ? 'inline-block' : 'none'; }
    function onKeySelect(e) { const file = e.target.files[0]; if(!file) { currentKeyContent = ""; return; } const reader = new FileReader(); reader.onload = ev => { currentKeyContent = ev.target.result; showToast('私钥已读取'); }; reader.readAsText(file); }
    function renderHistoryList() { const sel = document.getElementById('ssh-history'); sel.innerHTML = '<option value="">-- 历史记录 --</option>'; JSON.parse(localStorage.getItem('ssh_history') || '[]').forEach((h, i) => sel.innerHTML += \`<option value="\${i}">\${h.username}@\${h.host}</option>\`); }
    function loadHistory(idx) { if(idx === "") return; const h = JSON.parse(localStorage.getItem('ssh_history') || '[]')[idx]; if(h) { document.getElementById('ssh-host').value = h.host; document.getElementById('ssh-port').value = h.port; document.getElementById('ssh-user').value = h.username; } }
    function saveHistory(host, port, username) { let history = JSON.parse(localStorage.getItem('ssh_history') || '[]').filter(h => !(h.host === host && h.username === username)); history.unshift({ host, port, username }); localStorage.setItem('ssh_history', JSON.stringify(history.slice(0, 15))); renderHistoryList(); }
    
    function connectSSH() {
      const host = document.getElementById('ssh-host').value, port = parseInt(document.getElementById('ssh-port').value) || 22, username = document.getElementById('ssh-user').value, authType = document.getElementById('ssh-auth-type').value, password = document.getElementById('ssh-pass').value;
      if(!host || !username) return showToast('请输入 IP 和 用户名', 'error');
      if (sshWs) { sshWs.onclose = null; sshWs.close(); } 
      term.clear(); term.writeln('\\x1b[33mConnecting to server...\\x1b[0m');
      sshWs = new WebSocket(\`ws://\${location.hostname}:28080/ssh?token=\${authToken}\`);
      sshWs.onopen = () => {
        const config = { host, port, username }; if (authType === 'key') config.privateKey = currentKeyContent; else config.password = password;
        sshWs.send(JSON.stringify({ type: 'connect', config })); term.onResize(size => { if (sshWs.readyState === WebSocket.OPEN) sshWs.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows })); });
      };
      sshWs.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'data') term.write(msg.data);
        else if (msg.type === 'status') { term.write(msg.msg); if (msg.msg.includes('Connected')) { document.getElementById('btn-ssh-conn').style.display = 'none'; document.getElementById('btn-ssh-disc').style.display = 'inline-flex'; saveHistory(host, port, username); setTimeout(() => { if (fitAddon) fitAddon.fit(); }, 150); } }
      };
      sshWs.onclose = () => { term.writeln('\\r\\n\\x1b[31m[Disconnected]\\x1b[0m'); document.getElementById('btn-ssh-conn').style.display = 'inline-flex'; document.getElementById('btn-ssh-disc').style.display = 'none'; };
    }
    function disconnectSSH() { if(sshWs) sshWs.close(); }

    function connectWS() {
      if (ws) { ws.onclose = null; ws.close(); } 
      ws = new WebSocket(\`ws://\${location.hostname}:28080/tasks?token=\${authToken}\`);
      const wsStatus = document.getElementById('ws-status');
      ws.onopen = () => { wsStatus.textContent = '🟢 实时推送已连接'; wsStatus.style.color = '#fff'; };
      ws.onclose = () => { wsStatus.textContent = '🔴 推送断开，重连中...'; wsStatus.style.color = '#ff9800'; setTimeout(connectWS, 3000); };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const idx = tasks.findIndex(t => t.id === data.id);
          if (idx > -1) { tasks[idx] = { ...tasks[idx], ...data }; renderTasks(); }
        } catch {}
      };
    }

    async function initApp() {
      if (!authToken) { document.getElementById('login-screen').style.display = 'flex'; return; }
      const cfg = await api('/api/config');
      if (cfg.error) return; 
      
      document.getElementById('login-screen').style.display = 'none';
      sysConfig = cfg;
      refreshTasks(); 
      connectWS(); 
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(refreshTasks, 5000);
    }

    initApp();
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// ================= 后端核心逻辑 =================
const app = express();
const PORT = 1111;
const WS_PORT = 28080;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const CONFIG_FILE = path.join(__dirname, 'config.json');
const COOKIE_FILE = path.join(__dirname, 'qbit_cookie.txt');

function loadConfig() {
  let cfg = { 
    auth: { username: 'admin', password: 'password' },
    aria2: [], 
    qbit: { baseUrl: '', username: '', password: '' }, 
    openlist: { url: '', token: '' } 
  };
  try { 
    if (fs.existsSync(CONFIG_FILE)) {
      const diskCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      cfg = { ...cfg, ...diskCfg };
      if (!cfg.auth || !cfg.auth.username) cfg.auth = { username: 'admin', password: 'password' };
    } else {
      saveConfig(cfg); 
    }
  } catch (e) {}
  return cfg;
}
function saveConfig(config) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
function loadCookie() { try { return fs.existsSync(COOKIE_FILE) ? fs.readFileSync(COOKIE_FILE, 'utf8').trim() : null; } catch (e) { return null; } }
function saveCookie(cookie) { fs.writeFileSync(COOKIE_FILE, cookie); }

let config = loadConfig();

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.originalUrl === '/api/login') return next();
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    if (u === config.auth.username && p === config.auth.password) {
      return next();
    }
  } catch(e) {}
  res.status(401).json({ error: 'Unauthorized' });
}

app.use('/api', authMiddleware);

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.auth.username && password === config.auth.password) {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Auth failed' });
  }
});


function detectEngine(url) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('magnet:') || lowerUrl.includes('.torrent') || lowerUrl.includes('btih:')) return 'qbit';
  return 'aria2_0';
}

let qbitCookies = loadCookie();

const db = new Database('downloads.db');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, filename TEXT DEFAULT '未知文件', total_size INTEGER DEFAULT 0,
  downloaded_size INTEGER DEFAULT 0, speed INTEGER DEFAULT 0, progress REAL DEFAULT 0,
  status TEXT DEFAULT 'waiting', engine TEXT DEFAULT 'aria2_0', hash TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

app.post('/api/openlist/list', async (req, res) => {
  const { path } = req.body;
  if (!config.openlist || !config.openlist.url) return res.status(400).json({ error: '未配置 OpenList API 地址' });
  try { const response = await axios.post(`${config.openlist.url}/api/fs/list`, { path: path || "/", password: "", page: 1, per_page: 0, refresh: false }, { headers: { 'Authorization': config.openlist.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/get', async (req, res) => {
  const { path } = req.body;
  if (!config.openlist || !config.openlist.url) return res.status(400).json({ error: '未配置 OpenList API 地址' });
  try { const response = await axios.post(`${config.openlist.url}/api/fs/get`, { path, password: "" }, { headers: { 'Authorization': config.openlist.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/rename', async (req, res) => {
  const { name, path } = req.body;
  try { const response = await axios.post(`${config.openlist.url}/api/fs/rename`, { name, path }, { headers: { 'Authorization': config.openlist.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/remove', async (req, res) => {
  const { dir, names } = req.body;
  try { const response = await axios.post(`${config.openlist.url}/api/fs/remove`, { dir, names }, { headers: { 'Authorization': config.openlist.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});

const aria2 = {
  async call(idx, method, params = []) {
    const srv = config.aria2[idx];
    if(!srv) throw new Error('Aria2 节点不存在');
    try {
      const payload = { jsonrpc: '2.0', id: Date.now(), method: `aria2.${method}`, params: [`token:${srv.secret}`, ...params] };
      const res = await axios.post(srv.url, payload, { timeout: 10000 });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.result;
    } catch (err) { throw err; }
  },
  async getAllTasks() {
    if (!config.aria2 || config.aria2.length === 0) return { tasks: [], onlineMap: {} };
    let allTasks = [];
    let onlineMap = {};
    for(let i=0; i<config.aria2.length; i++) {
      try {
        const [active, waiting, stopped] = await Promise.all([ this.call(i, 'tellActive'), this.call(i, 'tellWaiting', [0, 1000]), this.call(i, 'tellStopped', [0, 1000]) ]);
        const combined = [...active, ...waiting, ...stopped].map(t => ({ ...t, _engineId: `aria2_${i}` }));
        allTasks = allTasks.concat(combined);
        onlineMap[`aria2_${i}`] = true;
      } catch(e) {
        onlineMap[`aria2_${i}`] = false;
      }
    }
    return { tasks: allTasks, onlineMap };
  }
};

const qbit = {
  async request(endpoint, method = 'GET', data = null) {
    if (!config.qbit || !config.qbit.baseUrl) return [];
    const configReq = { method, url: `${config.qbit.baseUrl}${endpoint}`, timeout: 10000 };
    if (data) {
      if (data instanceof FormData) { configReq.data = data; configReq.headers = data.getHeaders(); }
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
      const res = await axios.post(`${config.qbit.baseUrl}/auth/login`, `username=${encodeURIComponent(config.qbit.username)}&password=${encodeURIComponent(config.qbit.password)}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
      if (res.data === 'Ok.') { const setCookie = res.headers['set-cookie']; if (setCookie?.length > 0) { qbitCookies = setCookie[0].split(';')[0]; saveCookie(qbitCookies); return true; } }
      return false;
    } catch (err) { return false; }
  }
};

app.get('/api/config', (req, res) => res.json(config));
app.post('/api/config', (req, res) => { config = { ...config, ...req.body }; saveConfig(config); qbitCookies = null; res.json({ success: true }); });

app.get('/api/global-stats', async (req, res) => {
  let aria2Speed = 0, qbitSpeed = 0, aria2NodesOnline = [];
  if (config.aria2 && config.aria2.length > 0) {
    for(let i=0; i<config.aria2.length; i++) {
      try { const gs = await aria2.call(i, 'getGlobalStat'); aria2Speed += parseInt(gs.downloadSpeed) || 0; aria2NodesOnline.push(true); } catch (e) { aria2NodesOnline.push(false); }
    }
  }
  let qbitOk = false;
  try { const torrents = await qbit.request('/torrents/info'); qbitOk = true; qbitSpeed = torrents.reduce((s, t) => s + (t.dlspeed || 0), 0); } catch (e) {}
  res.json({ aria2Nodes: aria2NodesOnline, qbit: qbitOk, aria2Speed, qbitSpeed });
});

app.post('/api/download', async (req, res) => {
  const { url, engine } = req.body; 
  const urls = url.split(/[\n,]/).map(u => u.trim()).filter(u => u);
  if (urls.length === 0) return res.status(400).json({ success: false });
  
  const results = [];
  for (const dlUrl of urls) {
    let targetEngine = engine;
    if (!targetEngine || targetEngine === 'auto') targetEngine = detectEngine(dlUrl);
    
    try {
      if (targetEngine.startsWith('aria2_')) {
        const idx = parseInt(targetEngine.split('_')[1]);
        const gid = await aria2.call(idx, 'addUri', [[dlUrl], {}]);
        db.prepare(`INSERT OR REPLACE INTO tasks (id, url, status, engine) VALUES (?, ?, 'waiting', ?)`).run(gid, dlUrl, targetEngine);
        results.push({ success: true });
      } else {
        let beforeTorrents = [];
        try { beforeTorrents = await qbit.request('/torrents/info'); } catch(e) { await qbit.login(); beforeTorrents = await qbit.request('/torrents/info'); }
        const beforeHashes = new Set(beforeTorrents.map(t => t.hash));
        
        const form = new FormData(); form.append('urls', dlUrl);
        await qbit.request('/torrents/add', 'POST', form);
        await new Promise(r => setTimeout(r, 2000)); 
        
        const afterTorrents = await qbit.request('/torrents/info');
        const newTorrent = afterTorrents.find(t => !beforeHashes.has(t.hash)) || afterTorrents[0];
        
        if (newTorrent) {
          db.prepare(`INSERT OR REPLACE INTO tasks (id, url, filename, status, engine, hash) VALUES (?, ?, ?, 'downloading', 'qbit', ?)`).run(`qbit_${newTorrent.hash}`, dlUrl, newTorrent.name, newTorrent.hash);
          results.push({ success: true });
        } else {
          results.push({ success: false });
        }
      }
    } catch (e) { results.push({ success: false, error: e.message }); }
  }
  res.json({ success: results.some(r => r.success), message: `成功处理 ${results.filter(r => r.success).length} 个任务` });
});

async function syncDatabase() {
  const tasks = db.prepare(`SELECT * FROM tasks WHERE status NOT IN ('complete', 'error')`).all();
  if (tasks.length === 0) return tasks;

  const { tasks: aria2Tasks, onlineMap: aria2Online } = await aria2.getAllTasks();
  let qbitTorrents = null;
  try { qbitTorrents = await qbit.request('/torrents/info'); } catch(e){}

  const stmt = db.prepare(`UPDATE tasks SET progress=?, speed=?, total_size=?, downloaded_size=?, status=?, filename=? WHERE id=?`);
  
  for (const t of tasks) {
    if (t.engine.startsWith('aria2_')) {
      if (!aria2Online[t.engine]) continue; 
      
      const aTask = aria2Tasks.find(x => x.gid === t.id);
      if (aTask) {
        const total = parseInt(aTask.totalLength) || 0;
        const completed = parseInt(aTask.completedLength) || 0;
        const progress = total > 0 ? (completed / total * 100) : (aTask.status === 'complete' ? 100 : 0);
        let filename = t.filename;
        if (aTask.files && aTask.files[0] && aTask.files[0].path) filename = aTask.files[0].path.split(/[\\/]/).pop();
        
        let status = aTask.status; 
        if (status === 'active') status = 'downloading'; 
        if (status === 'error') status = 'error';
        stmt.run(progress, parseInt(aTask.downloadSpeed)||0, total, completed, status, filename, t.id);
      } else { stmt.run(100, 0, t.total_size, t.total_size, 'complete', t.filename, t.id); }
    } else if (t.engine === 'qbit' && t.hash) {
      if (qbitTorrents === null || qbitTorrents.length === 0) continue;
      
      const qTask = qbitTorrents.find(x => x.hash === t.hash);
      if (qTask) {
        const statusMap = { 'downloading': 'downloading', 'stalledDL': 'downloading', 'pausedDL': 'paused', 'uploading': 'complete', 'stalledUP': 'complete' };
        const st = statusMap[qTask.state] || 'downloading';
        stmt.run(qTask.progress * 100, qTask.dlspeed || 0, qTask.size, qTask.downloaded, st, qTask.name, t.id);
      } else { stmt.run(100, 0, t.total_size, t.total_size, 'complete', t.filename, t.id); }
    }
  }
}

app.get('/api/tasks', async (req, res) => {
  await syncDatabase();
  res.json(db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all());
});

app.post('/api/tasks/batch', async (req, res) => {
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No tasks selected' });
  
  for (const id of ids) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) continue;
    
    try {
      if (task.engine.startsWith('aria2_')) {
        const idx = parseInt(task.engine.split('_')[1]);
        try {
          if (action === 'pause') await aria2.call(idx, 'pause', [id]);
          if (action === 'resume') await aria2.call(idx, 'unpause', [id]);
          if (action === 'delete') await aria2.call(idx, 'remove', [id]);
        } catch(e) {}
      } else {
        try {
          if (action === 'pause') await qbit.request('/torrents/pause', 'POST', `hashes=${task.hash}`);
          if (action === 'resume') await qbit.request('/torrents/resume', 'POST', `hashes=${task.hash}`);
          if (action === 'delete') await qbit.request('/torrents/delete', 'POST', `hashes=${task.hash}&deleteFiles=false`);
        } catch(e) {}
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
      try {
        if (action === 'pause') await aria2.call(idx, 'pause', [id]);
        if (action === 'resume') await aria2.call(idx, 'unpause', [id]);
        if (action === 'delete') await aria2.call(idx, 'remove', [id]);
      } catch(e) {}
    } else {
      try {
        if (action === 'pause') await qbit.request('/torrents/pause', 'POST', `hashes=${task.hash}`);
        if (action === 'resume') await qbit.request('/torrents/resume', 'POST', `hashes=${task.hash}`);
        if (action === 'delete') await qbit.request('/torrents/delete', 'POST', `hashes=${task.hash}&deleteFiles=false`);
      } catch(e) {}
    }

    if (action === 'pause') db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(id);
    if (action === 'resume') db.prepare(`UPDATE tasks SET status = 'downloading' WHERE id = ?`).run(id);
    if (action === 'delete') db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

const wss = new WebSocket.Server({ port: WS_PORT });

function checkWsAuth(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = url.searchParams.get('token');
  if(!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    return u === config.auth.username && p === config.auth.password;
  } catch(e) { return false; }
}

wss.on('connection', (ws, req) => {
  if (!checkWsAuth(req)) {
    ws.close(1008, 'Unauthorized'); return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/ssh') {
    let sshConn = null, sshStream = null;
    ws.on('message', async (msg) => {
      const data = JSON.parse(msg);
      if (data.type === 'connect') {
        sshConn = new Client();
        sshConn.on('ready', () => {
          ws.send(JSON.stringify({ type: 'status', msg: '\x1b[32m[Connected]\x1b[0m\r\n' }));
          sshConn.shell((err, stream) => {
            if (err) return ws.send(JSON.stringify({ type: 'status', msg: 'Shell error\r\n' }));
            sshStream = stream;
            stream.on('data', d => ws.send(JSON.stringify({ type: 'data', data: d.toString('utf8') })));
            stream.on('close', () => ws.send(JSON.stringify({ type: 'status', msg: '\r\nConnection closed.' })));
          });
        }).on('error', (err) => {
          ws.send(JSON.stringify({ type: 'status', msg: '\r\n\x1b[31mSSH Error: ' + err.message + '\x1b[0m' }));
        }).connect(data.config);
      } else if (data.type === 'data' && sshStream) {
        sshStream.write(data.data);
      } else if (data.type === 'resize' && sshStream) {
        sshStream.setWindow(data.rows, data.cols, 480, 640);
      }
    });
    ws.on('close', () => { if (sshConn) sshConn.end(); });
  } else {
    const interval = setInterval(async () => {
      await syncDatabase();
      const tasks = db.prepare(`SELECT * FROM tasks WHERE status NOT IN ('complete', 'error')`).all();
      tasks.forEach(t => ws.send(JSON.stringify(t)));
    }, 1500);
    ws.on('close', () => clearInterval(interval));
  }
});

app.listen(PORT, () => console.log(`🚀 Download Manager Pro 启动成功: http://localhost:${PORT}`));
