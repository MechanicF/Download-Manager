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
  <title>Download Manager Pro</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  
  <script>
    function initTheme() {
      const savedTheme = localStorage.getItem('dm_theme') || 'light';
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    initTheme();
  </script>

  <style>
    :root {
      --primary: #1890ff; 
      --primary-hover: #40a9ff;
      --primary-light: #e6f7ff;
      --success: #52c41a; 
      --warning: #faad14; 
      --danger: #ff4d4f;
      
      --bg-dark: #001529; 
      --bg-menu: #000c17;
      --bg-light: #f0f2f5; 
      --card-bg: #ffffff;
      --text-main: #262626; 
      --text-muted: #8c8c8c;
      --border-color: #f0f0f0;
      --input-bg: #ffffff;
      --input-border: #d9d9d9;
      --table-th-bg: #fafafa;
      --table-hover: rgba(24,144,255,0.08);
      
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow-sm: 0 2px 6px rgba(0,0,0,0.04);
      --shadow-md: 0 6px 16px rgba(0,0,0,0.08);
      --shadow-float: 0 12px 24px rgba(0,0,0,0.12);
    }

    [data-theme="dark"] {
      --primary-light: rgba(24,144,255,0.15);
      --bg-light: #141414; 
      --card-bg: #1f1f1f;
      --text-main: #e0e0e0; 
      --text-muted: #8b8b8b;
      --border-color: #303030;
      --input-bg: #141414;
      --input-border: #434343;
      --table-th-bg: #1d1d1d;
      --table-hover: rgba(255,255,255,0.08);
      
      --shadow-sm: 0 2px 6px rgba(0,0,0,0.4);
      --shadow-md: 0 6px 16px rgba(0,0,0,0.6);
      --shadow-float: 0 12px 24px rgba(0,0,0,0.8);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    
    html, body { background-color: var(--bg-light); color: var(--text-main); height: 100vh; overflow: hidden; }
    body { display: flex; flex-direction: column; transition: background-color 0.4s ease, color 0.4s ease; }
    
    .navbar { background: linear-gradient(135deg, #001529 0%, #00284d 100%); color: white; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; box-shadow: var(--shadow-sm); z-index: 1001; flex-shrink: 0; }
    .navbar .logo { font-size: 18px; font-weight: 600; letter-spacing: 0.5px; display: flex; align-items: center; }
    .menu-toggle { display: none; cursor: pointer; margin-right: 15px; font-size: 22px; line-height: 1; }
    .navbar .global-stats { display: flex; gap: 15px; font-size: 13px; font-weight: 500; align-items: center; }
    .navbar .stat-item { background: rgba(255,255,255,0.1); padding: 5px 12px; border-radius: 20px; white-space: nowrap; backdrop-filter: blur(4px); }

    .main-wrapper { display: flex; flex: 1; overflow: hidden; position: relative; }
    .sidebar { width: 240px; background-color: var(--bg-dark); color: rgba(255,255,255,0.65); display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.4s ease; z-index: 1000; box-shadow: 2px 0 8px rgba(0,0,0,0.15); }
    .sidebar-menu { list-style: none; padding: 16px 8px; margin: 0; }
    .sidebar-menu .nav-item { padding: 12px 16px; margin-bottom: 4px; cursor: pointer; border-radius: var(--radius-sm); transition: all 0.2s; font-size: 14px; display: flex; justify-content: space-between; align-items: center; }
    .sidebar-menu .nav-item:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .sidebar-menu .nav-item.active { background: var(--primary); color: #fff; font-weight: 500; box-shadow: 0 2px 8px rgba(24,144,255,0.35); }
    
    .sub-menu { list-style: none; background: transparent; display: none; margin-bottom: 8px; }
    .sub-menu.open { display: block; }
    .sub-item { padding: 10px 16px 10px 42px; cursor: pointer; font-size: 13px; color: rgba(255,255,255,0.55); transition: 0.2s; border-radius: var(--radius-sm); margin-bottom: 2px; }
    .sub-item:hover { color: #fff; background: rgba(255,255,255,0.04); }
    .sub-item.active { color: var(--primary); font-weight: 600; background: rgba(24,144,255,0.1); }

    .content { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; width: 100%; background: var(--bg-light); transition: background-color 0.4s ease; }
    .section { display: none; flex: 1; flex-direction: column; animation: fadeIn 0.3s ease; }
    .section.active { display: flex; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    .toolbar { background: var(--card-bg); padding: 16px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; flex-shrink: 0; transition: background-color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease; border: 1px solid transparent; }
    
    .btn { border: none; padding: 8px 16px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; color: white; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; justify-content: center; box-shadow: 0 2px 0 rgba(0,0,0,0.045); }
    .btn:active { transform: translateY(1px); }
    .btn-primary { background: var(--primary); } .btn-primary:hover { background: var(--primary-hover); box-shadow: 0 2px 8px rgba(24,144,255,0.3); }
    .btn-default { background: var(--card-bg); color: var(--text-main); border: 1px solid var(--input-border); box-shadow: 0 2px 0 rgba(0,0,0,0.015); transition: background-color 0.4s, color 0.4s, border-color 0.4s; } 
    .btn-default:hover { color: var(--primary); border-color: var(--primary); background: var(--bg-light); }
    .btn-success { background: var(--success); } .btn-success:hover { background: #73d13d; }
    .btn-warning { background: var(--warning); } .btn-warning:hover { background: #ffc53d; }
    .btn-danger { background: var(--danger); } .btn-danger:hover { background: #ff7875; }
    .btn-sm { padding: 4px 12px; font-size: 12px; }

    #theme-toggle-btn { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.4s; }

    .task-card { background: var(--card-bg); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); margin-bottom: 12px; display: flex; flex-direction: column; transition: background-color 0.4s ease, transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s, border-color 0.4s; flex-shrink: 0; border: 1px solid transparent; overflow: hidden; }
    .task-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: var(--primary-light); }
    .task-card.downloading { border-left: 4px solid var(--primary); }
    .task-card.complete { border-left: 4px solid var(--success); }
    .task-card.paused { border-left: 4px solid var(--warning); opacity: 0.85; }
    .task-card.error { border-left: 4px solid var(--danger); }
    
    .task-header { padding: 16px 20px 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    .task-title { font-size: 15px; font-weight: 600; color: var(--text-main); word-break: break-all; cursor: pointer; display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 200px; transition: color 0.4s; }
    .task-title:hover span.t-name { color: var(--primary); }
    .task-actions { display: flex; gap: 8px; opacity: 0; transition: opacity 0.2s; flex-wrap: wrap; }
    .task-card:hover .task-actions { opacity: 1; }
    
    .task-body { padding: 0 20px 16px; padding-left: 42px; }
    .progress-wrapper { background: var(--bg-light); height: 10px; border-radius: 5px; margin: 12px 0; overflow: hidden; position: relative; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); transition: background-color 0.4s ease; }
    .progress-bar { height: 100%; background: linear-gradient(90deg, #1890ff, #69c0ff); transition: width 0.3s ease; border-radius: 5px; position: relative; overflow: hidden; }
    .progress-bar::after { content: ""; position: absolute; top: 0; left: 0; bottom: 0; right: 0; background: linear-gradient( -45deg, rgba(255, 255, 255, 0.2) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.2) 50%, rgba(255, 255, 255, 0.2) 75%, transparent 75%, transparent ); background-size: 20px 20px; animation: progressStripes 2s linear infinite; }
    @keyframes progressStripes { 0% { background-position: 0 0; } 100% { background-position: 20px 0; } }
    .task-card.complete .progress-bar { background: var(--success); animation: none; }
    .task-card.complete .progress-bar::after { display: none; }
    .task-card.paused .progress-bar { background: var(--warning); animation: none; }
    
    .task-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 10px; transition: color 0.4s; }
    .meta-left { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .meta-right { font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 15px; }
    
    .tag { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; color: white; white-space: nowrap; }
    .tag.aria2 { background: #722ed1; }
    .tag.qbit { background: #13c2c2; }

    .form-control { padding: 8px 12px; border: 1px solid var(--input-border); border-radius: var(--radius-sm); font-size: 13px; outline: none; transition: background-color 0.4s, color 0.4s, border-color 0.4s, box-shadow 0.3s; background: var(--input-bg); max-width: 100%; color: var(--text-main); }
    .form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
    
    #terminal-container { flex: 1; background: #000; padding: 12px; border-radius: var(--radius-md); overflow: hidden; position: relative; min-height: 350px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5); }
    .xterm { position: absolute; top: 12px; bottom: 12px; left: 12px; right: 12px; }
    .xterm * { font-family: 'JetBrains Mono', Consolas, "Courier New", monospace !important; letter-spacing: normal !important; }
    .xterm-viewport { overflow-y: auto !important; }

    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px; opacity: 0; transition: opacity 0.3s; }
    .modal-overlay.show { display: flex; opacity: 1; }
    .modal { background: var(--card-bg); width: 520px; max-width: 100%; border-radius: var(--radius-lg); box-shadow: var(--shadow-float); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.4s ease; }
    .modal-overlay.show .modal { transform: scale(1); }
    .modal-header { padding: 16px 24px; border-bottom: 1px solid var(--border-color); font-size: 16px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; color: var(--text-main); transition: border-color 0.4s, color 0.4s; }
    .modal-header button.close-btn { background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; transition: 0.2s; }
    .modal-header button.close-btn:hover { color: var(--danger); transform: rotate(90deg); }
    .modal-body { padding: 24px; overflow-y: auto; background: var(--bg-light); transition: background-color 0.4s ease; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); text-align: right; background: var(--card-bg); flex-shrink: 0; transition: border-color 0.4s, background-color 0.4s; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 500; color: var(--text-main); transition: color 0.4s; }

    .toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
    .toast { background: rgba(0,0,0,0.85); color: white; padding: 12px 24px; border-radius: var(--radius-md); font-size: 14px; box-shadow: var(--shadow-md); opacity: 0; transform: translateX(50px); transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); pointer-events: auto; backdrop-filter: blur(8px); display: flex; align-items: center; gap: 8px; }
    .toast.show { opacity: 1; transform: translateX(0); }
    .toast.success { border-left: 4px solid var(--success); }
    .toast.error { border-left: 4px solid var(--danger); }
    .toast.warning { border-left: 4px solid var(--warning); }

    .ol-table-wrapper { width: 100%; overflow-x: auto; background: var(--card-bg); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); flex: 1; transition: background-color 0.4s ease; }
    .ol-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 500px; }
    .ol-table th { padding: 14px 16px; background: var(--table-th-bg); border-bottom: 1px solid var(--border-color); text-align: left; color: var(--text-muted); font-weight: 600; cursor: pointer; user-select: none; white-space: nowrap; transition: background-color 0.4s, border-color 0.4s, color 0.4s; }
    .ol-table th:hover { background: var(--border-color); color: var(--text-main); }
    .ol-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-color); vertical-align: middle; transition: background-color 0.2s, border-color 0.4s; color: var(--text-main); }
    .ol-table tr:hover td { background: var(--table-hover); }
    .custom-checkbox { margin-right: 12px; cursor: pointer; width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--input-border); accent-color: var(--primary); flex-shrink: 0; transition: background-color 0.4s, border-color 0.4s; background: var(--input-bg); }
    .ol-filename-cell { display: flex; align-items: center; cursor: pointer; color: var(--text-main); font-weight: 500; word-break: break-all; transition: color 0.2s; }
    .ol-filename-cell:hover { color: var(--primary); }
    .sort-icon { font-size: 10px; color: var(--text-muted); margin-left: 6px; }

    .preview-box { max-height: 200px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: var(--radius-sm); font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-top: 12px; border: 1px solid #333; }
    .preview-item { margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed #333; line-height: 1.5; }
    .preview-item del { color: #f14c4c; text-decoration-color: rgba(241,76,76,0.5); }
    .preview-item span { color: #89d185; font-weight: bold; }
    
    .config-card { border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md); margin-bottom: 16px; position: relative; background: var(--card-bg); box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: background-color 0.4s, border-color 0.4s, box-shadow 0.3s; }
    .config-card:hover { border-color: var(--primary-light); box-shadow: var(--shadow-sm); }
    .config-card .remove-btn { position: absolute; top: 12px; right: 12px; color: var(--text-muted); cursor: pointer; border: none; background: none; font-size: 16px; transition: color 0.2s, transform 0.2s; }
    .config-card .remove-btn:hover { color: var(--danger); transform: scale(1.1); }

    #login-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop') center/cover; z-index: 999999; display: none; align-items: center; justify-content: center; padding: 20px; }
    #login-screen::before { content: ''; position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,21,41,0.7); backdrop-filter: blur(10px); }
    .login-box { background: rgba(255,255,255,0.9); padding: 40px 32px; border-radius: var(--radius-lg); width: 100%; max-width: 420px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2); position: relative; z-index: 1; backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.2); transition: background-color 0.4s, border-color 0.4s; }
    
    [data-theme="dark"] .login-box { background: rgba(30,30,30,0.85); border: 1px solid rgba(255,255,255,0.1); }
    [data-theme="dark"] .login-box input { background: #141414; color: #e0e0e0; border-color: #434343; }

    .login-box h2 { color: var(--text-main); margin-bottom: 30px; letter-spacing: 0.5px; font-size: 24px; font-weight: 600; transition: color 0.4s; }
    .login-box input { background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-main); width: 100%; padding: 14px 16px; border-radius: var(--radius-sm); margin-bottom: 20px; outline: none; transition: background-color 0.4s, border-color 0.4s, color 0.4s, box-shadow 0.3s; font-size: 15px; }
    .login-box input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(24,144,255,0.15); }
    .login-box button { background: var(--primary); color: #fff; border: none; padding: 14px; width: 100%; border-radius: var(--radius-sm); cursor: pointer; font-weight: 600; font-size: 16px; transition: background-color 0.3s, transform 0.2s, box-shadow 0.3s; box-shadow: 0 4px 12px rgba(24,144,255,0.3); }
    .login-box button:hover { background: var(--primary-hover); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(24,144,255,0.4); }

    .mobile-overlay { display: none; position: fixed; top: 56px; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); z-index: 999; backdrop-filter: blur(2px); }
    
    @media (max-width: 768px) {
      .menu-toggle { display: inline-block; }
      .navbar { padding: 0 16px; }
      .navbar .logo { font-size: 16px; }
      .navbar .global-stats { gap: 8px; }
      .navbar .stat-item { display: none; } 
      #ws-status { display: inline-block !important; padding: 4px 8px; }
      
      .sidebar { position: fixed; left: -260px; top: 56px; height: calc(100vh - 56px); width: 260px; }
      .sidebar.open { left: 0; }
      .mobile-overlay.show { display: block; }
      
      .content { padding: 12px; }
      .toolbar { padding: 12px; gap: 8px; margin-bottom: 12px; }
      .toolbar > div { width: 100%; flex-wrap: wrap; }
      .toolbar .btn { flex: 1; min-width: 80px; padding: 8px; }
      .toolbar input[type="text"], .toolbar select { width: 100% !important; flex: 1 1 100%; margin-bottom: 6px; }
      
      .task-card { margin-bottom: 10px; }
      .task-header { padding: 12px 16px 8px; }
      .task-actions { opacity: 1; margin-top: 10px; width: 100%; justify-content: flex-end; }
      .task-actions .btn { flex: 1; }
      .task-meta .meta-left, .task-meta .meta-right { width: 100%; justify-content: space-between; gap: 8px; }
      .task-body { padding: 0 16px 16px; padding-left: 16px; }
      .task-title { width: 100%; }

      .modal-body { padding: 16px; }
      #settings-modal .modal-body { flex-direction: column !important; }
      #settings-modal .modal-body > div { width: 100% !important; border-right: none !important; padding-right: 0 !important; margin-bottom: 24px; }
      
      .ol-table th:nth-child(4), .ol-table td:nth-child(4) { display: none; } 
      .ol-table th:nth-child(3), .ol-table td:nth-child(3) { width: 80px; font-size: 12px; } 
      
      .toast-container { bottom: 16px; left: 16px; right: 16px; align-items: center; }
      .toast { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>

  <div id="login-screen">
    <div class="login-box">
      <h2>Manager Pro 安全中心</h2>
      <input type="text" id="login-user" placeholder="管理员账号">
      <input type="password" id="login-pass" placeholder="安全凭证" onkeyup="if(event.key==='Enter') doLogin()">
      <button onclick="doLogin()">登 录 面 板</button>
    </div>
  </div>

  <header class="navbar">
    <div class="logo">
      <span class="menu-toggle" onclick="toggleMobileMenu()">☰</span>
      ⚡ Download Manager
    </div>
    <div class="global-stats">
      <div class="stat-item" id="global-speed">⬇️ 0 B/s | ⬆️ 0 B/s</div>
      <div class="stat-item" id="ws-status">🟡 连接中</div>
      <button class="btn btn-default btn-sm" id="theme-toggle-btn" onclick="toggleTheme()" style="background: rgba(255,255,255,0.1); color: white; border: none; backdrop-filter: blur(4px);">🌙 夜间</button>
      <button class="btn btn-danger btn-sm" onclick="doLogout()" style="background: rgba(255,77,79,0.8); color: white; border: none; backdrop-filter: blur(4px);">退出</button>
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
          <li class="sub-item" onclick="filterTasks('waiting', this)">⏳ 等待暂停</li>
          <li class="sub-item" onclick="filterTasks('complete', this)">✅ 已完成</li>
        </ul>

        <li class="nav-item" onclick="switchTab('openlist', this)">☁️ 云端文件</li>
        <li class="nav-item" onclick="switchTab('ssh', this)">💻 SSH 终端</li>
        
        <li class="nav-item" style="margin-top: 24px; border-top: 1px solid var(--border-color); padding-top: 24px; transition: border-color 0.4s;" onclick="openSettingsModal()">⚙️ 全局设置</li>
        
        <li>
          <div style="padding: 16px; font-size: 12px; line-height: 2.2; color: rgba(255,255,255,0.4);" id="sidebar-engines-status">
            </div>
        </li>
      </ul>
    </aside>

    <main class="content">
      <div id="section-downloads" class="section active">
        <div class="toolbar" style="justify-content: space-between;">
          <div style="display: flex; gap: 12px; flex: 1;">
            <button class="btn btn-primary" onclick="showNewTaskModal()">➕ 新建任务</button>
            <button class="btn btn-default" onclick="refreshTasks()">🔄 刷新</button>
          </div>
          <div style="display: flex; gap: 10px; align-items: center; font-size: 13px; flex: 1; justify-content: flex-end;">
            排序:
            <select id="task-sort-select" class="form-control" style="padding: 6px 10px; font-size: 12px; width: 140px;" onchange="changeTaskSort()">
              <option value="created_at_desc">按时间倒序</option>
              <option value="created_at_asc">按时间正序</option>
              <option value="name_asc">按名称 (A-Z)</option>
              <option value="size_desc">按文件大小</option>
              <option value="progress_desc">按下载进度</option>
            </select>
          </div>
        </div>

        <div class="toolbar" style="background: var(--primary-light); padding: 10px 16px;">
          <label style="cursor: pointer; display: flex; align-items: center; font-weight: 600; color: var(--primary); white-space: nowrap;">
            <input type="checkbox" class="custom-checkbox" id="task-select-all" onclick="toggleAllTasks(this.checked)"> 全选当前
          </label>
          <div style="border-left: 1px solid var(--input-border); height: 16px; margin: 0 12px; transition: border-color 0.4s;"></div>
          <button class="btn btn-warning btn-sm" onclick="batchTaskAction('pause')">⏸️ 暂停</button>
          <button class="btn btn-success btn-sm" onclick="batchTaskAction('resume')">▶️ 继续</button>
          <button class="btn btn-danger btn-sm" onclick="batchTaskAction('delete')">🗑️ 删除</button>
          <span id="task-selected-count" style="font-size: 13px; color: var(--text-muted); margin-left: auto;">已选 0 项</span>
        </div>

        <div id="task-list" style="overflow-y: auto; flex: 1; padding-bottom: 20px;"></div>
      </div>

      <div id="section-openlist" class="section">
        <div class="toolbar" style="gap: 12px; align-items: center; display: flex;">
          <select id="ol-account-select" class="form-control" style="width: 140px; font-weight: bold; color: var(--primary);" onchange="switchOlAccount()">
            <option value="">配置加载中...</option>
          </select>
          <button class="btn btn-default" onclick="openListGoUp()">⬆️ 返回上级</button>
          <input type="text" id="openlist-path" class="form-control" style="flex: 1; min-width: 150px; background: var(--bg-light);" value="/" readonly>
          <button class="btn btn-primary" onclick="loadOpenList()">🔄 刷新目录</button>
          
          <div style="border-left: 1px solid var(--border-color); height: 24px; margin: 0 8px; transition: border-color 0.4s;"></div>
          
          <button class="btn btn-success" id="btn-ol-download" style="display:none;" onclick="showEngineSelectModalForOL()">📥 推送下载</button>
          <button class="btn btn-warning" id="btn-ol-rename" style="display:none;" onclick="showRenameModal()">✏️ 智能重命名</button>
          <button class="btn btn-danger" id="btn-ol-delete" style="display:none;" onclick="deleteSelectedFiles()">🗑️ 删除选定</button>
        </div>
        <div class="ol-table-wrapper">
          <div id="openlist-content">
            <div style="padding: 60px; text-align: center; color: var(--text-muted);">请在右侧全局设置中添加 OpenList 账号</div>
          </div>
        </div>
      </div>

      <div id="section-ssh" class="section">
        <div class="toolbar" style="gap: 12px; align-items: center; flex-wrap: wrap;">
          <select id="ssh-history" class="form-control" onchange="loadHistory(this.value)">
            <option value="">-- 连接历史 --</option>
          </select>
          <input type="text" id="ssh-host" placeholder="服务器 IP" class="form-control">
          <input type="text" id="ssh-port" placeholder="端口(22)" value="22" class="form-control" style="width: 80px;">
          <input type="text" id="ssh-user" placeholder="用户名(root)" class="form-control" style="width: 100px;">
          <select id="ssh-auth-type" class="form-control" onchange="toggleAuthType()">
            <option value="password">密码鉴权</option><option value="key">私钥鉴权</option>
          </select>
          <input type="password" id="ssh-pass" placeholder="服务器密码" class="form-control">
          <input type="file" id="ssh-key-file" class="form-control" style="display:none; width: 200px;" accept=".pem,.id_rsa,*" onchange="onKeySelect(event)">
          <button class="btn btn-primary" onclick="connectSSH()" id="btn-ssh-conn">🔌 发起连接</button>
          <button class="btn btn-danger" onclick="disconnectSSH()" id="btn-ssh-disc" style="display:none;">❌ 断开连接</button>
        </div>
        <div id="terminal-container"></div>
      </div>
    </main>
  </div>

  <div class="modal-overlay" id="new-task-modal">
    <div class="modal">
      <div class="modal-header"><span>➕ 新建下载任务</span> <button class="close-btn" onclick="hideModal('new-task-modal')">✖</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label>指派下载节点</label>
          <select id="task-engine-select" class="form-control" style="width:100%; font-weight: 500;"></select>
        </div>
        <div class="form-group">
          <label>资源链接 (支持多行批量添加)</label>
          <textarea id="url-input" class="form-control" style="resize:vertical;min-height:140px;width:100%; font-family: monospace; font-size: 12px; padding: 12px;"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('new-task-modal')">取 消</button>
        <button class="btn btn-primary" onclick="addDownload()">🚀 立即下载</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="engine-select-modal">
    <div class="modal" style="width: 420px;">
      <div class="modal-header"><span>📥 选择接收节点</span> <button class="close-btn" onclick="hideModal('engine-select-modal')">✖</button></div>
      <div class="modal-body">
        <p style="margin-bottom: 16px; font-size: 14px; color: var(--text-main);">系统已提取直链，请选择推送至本地哪个下载引擎：</p>
        <select id="ol-engine-select" class="form-control" style="width:100%; margin-bottom: 8px; font-weight:500;"></select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('engine-select-modal')">取 消</button>
        <button class="btn btn-success" onclick="executeOlDownload()">🚀 确认推送</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="settings-modal">
    <div class="modal" style="width: 960px; max-width: 95vw;">
      <div class="modal-header"><span>⚙️ 系统核心设置</span> <button class="close-btn" onclick="hideModal('settings-modal')">✖</button></div>
      <div class="modal-body" style="display: flex; gap: 30px; align-items: flex-start;">
        
        <div style="flex: 1; border-right: 1px solid var(--border-color); padding-right: 20px; transition: border-color 0.4s;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="color: var(--primary); margin:0; font-size: 15px;">☁️ OpenList 网盘矩阵</h4>
            <button class="btn btn-success btn-sm" onclick="addOlAccount()">➕ 新增网盘</button>
          </div>
          <div id="ol-accounts-container" style="max-height: 45vh; overflow-y: auto; padding-right: 8px;"></div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; margin-top: 30px;">
            <h4 style="color: #722ed1; margin:0; font-size: 15px;">🟣 Aria2 下载集群</h4>
            <button class="btn btn-primary btn-sm" onclick="addAria2NodeForm()" style="background: #722ed1;">➕ 新增节点</button>
          </div>
          <div id="aria2-nodes-container" style="max-height: 45vh; overflow-y: auto; padding-right: 8px;"></div>
        </div>

        <div style="flex: 1;">
          <h4 style="margin-bottom: 16px; color: var(--danger); font-size: 15px;">🔒 面板安全设置</h4>
          <div class="config-card">
            <div class="form-group"><label>面板登录账号</label><input type="text" id="panel-user" class="form-control"></div>
            <div class="form-group"><label>面板登录密码</label><input type="password" id="panel-pass" class="form-control" placeholder="留空则保持当前密码不变"></div>
          </div>
          
          <h4 style="margin-bottom: 16px; color: #13c2c2; font-size: 15px; margin-top: 30px;">🟠 qBittorrent 引擎</h4>
          <div class="config-card">
            <div class="form-group"><label>WebUI API URL</label><input type="text" id="qbit-url" class="form-control" placeholder="例如 http://IP:8080"></div>
            <div class="form-group"><label>用户名</label><input type="text" id="qbit-user" class="form-control"></div>
            <div class="form-group"><label>密码</label><input type="password" id="qbit-pass" class="form-control"></div>
          </div>
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('settings-modal')">放 弃</button>
        <button class="btn btn-primary" onclick="saveSettings()">💾 保存并重载配置</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="rename-modal">
    <div class="modal" style="width: 580px;">
      <div class="modal-header"><span id="rename-title">✏️ 智能批量重命名</span> <button class="close-btn" onclick="hideModal('rename-modal')">✖</button></div>
      <div class="modal-body" id="rename-body-batch">
        <div style="margin-bottom: 20px; display: flex; gap: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; transition: border-color 0.4s;" id="rename-mode-selector">
          <label style="cursor: pointer; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="batch-rename-mode" value="replace" checked onchange="toggleBatchMode()"> 🔍 查找与替换
          </label>
          <label style="cursor: pointer; font-weight: 600; color: #722ed1; display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="batch-rename-mode" value="sequence" onchange="toggleBatchMode()"> 🔢 顺序递增命名
          </label>
        </div>
        <div id="batch-mode-replace">
          <div class="form-group"><label>查找规则 (原文本)</label><input type="text" id="rename-batch-search" class="form-control" oninput="generateRenamePreview()"></div>
          <div class="form-group"><label>替换内容 (新文本)</label><input type="text" id="rename-batch-replace" class="form-control" oninput="generateRenamePreview()" placeholder="可留空以彻底删除查找到的字符"></div>
        </div>
        <div id="batch-mode-sequence" style="display:none;">
          <div style="background: var(--primary-light); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px; font-size: 13px; color: var(--text-main); border: 1px dashed var(--primary); transition: background-color 0.4s;">可用魔法变量：<br><code style="color:var(--danger);font-weight:bold;">{number}</code> (代表自增数字) &nbsp;&nbsp;|&nbsp;&nbsp; <code style="color:var(--success);font-weight:bold;">{ext}</code> (代表原文件扩展名)</div>
          <div class="form-group"><label>新文件名格式模板</label><input type="text" id="rename-batch-format" class="form-control" oninput="generateRenamePreview()" placeholder="例如: 权力的游戏_S01E{number}{ext}"></div>
          <div class="form-group"><label>数字起始位</label><input type="number" id="rename-batch-start" class="form-control" value="1" oninput="generateRenamePreview()"></div>
        </div>
        <label style="display:block; margin-top: 24px; font-size: 14px; font-weight: 600; color: var(--text-main);">实时效果预览:</label>
        <div class="preview-box" id="rename-preview-box">请输入规则以启动智能预览...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-default" onclick="hideModal('rename-modal')">取 消</button>
        <button class="btn btn-primary" id="btn-submit-rename" onclick="submitRename()">✅ 确认执行修改</button>
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
    let olAccounts = []; 
    
    // 主题控制引擎 (附带微动效)
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const newTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('dm_theme', newTheme);
      
      const btn = document.getElementById('theme-toggle-btn');
      
      // 增加旋转翻转微动效
      btn.style.transform = 'scale(0.8) rotate(15deg)';
      setTimeout(() => {
        updateThemeIcon(newTheme);
        btn.style.transform = 'scale(1) rotate(0deg)';
      }, 150);
    }
    
    function updateThemeIcon(theme) {
      const btn = document.getElementById('theme-toggle-btn');
      if (btn) btn.innerHTML = theme === 'dark' ? '☀️ 亮色' : '🌙 夜间';
    }
    document.addEventListener('DOMContentLoaded', () => {
      updateThemeIcon(document.documentElement.getAttribute('data-theme'));
    });

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
        showToast('认证成功，欢迎回来', 'success');
        initApp();
      } else { showToast('身份认证失败，请重试', 'error'); }
    }

    function doLogout() {
      authToken = ''; localStorage.removeItem('manager_auth_token'); location.reload();
    }
    
    function showModal(id) { document.getElementById(id).classList.add('show'); }
    function hideModal(id) { document.getElementById(id).classList.remove('show'); }
    
    async function openSettingsModal() {
      try { closeMobileMenu(); await loadConfig(); showModal('settings-modal'); } catch (e) { showToast('拉取配置异常', 'error'); }
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
      sel.innerHTML = '<option value="auto">✨ 智能负载分配 (Aria2/qBit)</option>';
      sel.innerHTML += '<option value="qbit">🟠 强制 qBittorrent 引擎</option>';
      if (sysConfig.aria2 && Array.isArray(sysConfig.aria2)) {
        sysConfig.aria2.forEach((node, idx) => { sel.innerHTML += \`<option value="aria2_\${idx}">🟣 Aria2: \${node.name}</option>\`; });
      }
    }

    function showToast(msg, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⚠️');
      toast.className = \`toast \${type}\`; toast.innerHTML = \`<span>\${icon}</span> <span>\${msg}</span>\`;
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
      currentTaskFilter = filterType; selectedTasks.clear(); renderTasks(); closeMobileMenu();
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
          term = new Terminal({ theme: { background: '#000' }, cursorBlink: true, fontSize: 14 });
          fitAddon = new FitAddon.FitAddon(); term.loadAddon(fitAddon);
          term.open(document.getElementById('terminal-container'));
          term.writeln('Welcome to Download Manager Secure Shell');
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
      taskSortDesc = parts.pop() === 'desc'; taskSortBy = parts.join('_'); renderTasks();
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
      document.getElementById('task-selected-count').textContent = \`已选 \${selectedTasks.size} 项\`;
      const visibleTasks = getFilteredTasks();
      document.getElementById('task-select-all').checked = visibleTasks.length > 0 && selectedTasks.size === visibleTasks.length;
    }

    async function batchTaskAction(action) {
      if (selectedTasks.size === 0) return showToast('没有选择任何任务', 'warning');
      const actionName = action === 'pause' ? '暂停' : (action === 'resume' ? '继续' : '删除');
      if (action === 'delete' && !confirm(\`数据无价，确认抹除这 \${selectedTasks.size} 个任务的记录吗？\`)) return;
      
      showToast(\`队列调度中...\`, 'success');
      const ids = Array.from(selectedTasks);
      const res = await api('/api/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, action }) });
      if (res.success) { showToast(\`批量调度成功\`, 'success'); selectedTasks.clear(); refreshTasks(); } 
      else { showToast('部分节点响应超时，请重试', 'error'); }
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
        list.innerHTML = '<div style="text-align: center; padding: 80px 20px; color: var(--text-muted);"><div style="font-size: 40px; margin-bottom: 15px; opacity: 0.5;">📭</div><p>当前视图下没有任何任务活动</p></div>'; 
        return; 
      }
      
      const statusText = { 'downloading': '高速下载中', 'waiting': '队列等待中', 'paused': '用户已挂起', 'complete': '底层已校验完成', 'error': '引擎异常' };
      list.innerHTML = filteredTasks.map(t => {
        let eta = t.speed > 0 ? (t.total_size - t.downloaded_size) / t.speed : 0;
        let progress = t.progress ? parseFloat(t.progress).toFixed(2) : 0;
        if(t.status === 'complete') progress = 100;
        
        let engineTag = t.engine; let engineClass = 'aria2';
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
              <span class="t-name">\${t.filename || '正在解析元数据...'}</span>
            </div>
            <div class="task-actions">
              \${t.status !== 'paused' && t.status !== 'complete' && t.status !== 'error' ? \`<button class="btn btn-warning btn-sm" onclick="singleAction('\${t.id}', 'pause')">⏸️ 暂停</button>\` : ''}
              \${t.status === 'paused' || t.status === 'error' ? \`<button class="btn btn-success btn-sm" onclick="singleAction('\${t.id}', 'resume')">▶️ 唤醒</button>\` : ''}
              <button class="btn btn-default btn-sm" onclick="singleAction('\${t.id}', 'delete')"><span style="color:var(--danger);">🗑️ 删除</span></button>
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
                <span>\${statusText[t.status] || t.status}</span>
                <span style="color:var(--border-color);">|</span>
                <span>\${formatSize(t.downloaded_size)} / \${formatSize(t.total_size)}</span>
              </div>
              <div class="meta-right">
                \${['downloading'].includes(t.status) ? \`<span style="color:var(--primary);">⬇️ \${formatSize(t.speed)}/s</span> <span style="color:var(--text-muted); font-weight:normal;">⏳ \${formatTime(eta)}</span>\` : ''}
              </div>
            </div>
          </div>
        </div>
      \`}).join('');
    }

    async function singleAction(id, type) {
      if (type === 'delete' && !confirm('指令确认：是否销毁此任务？')) return;
      const btn = event.currentTarget; btn.style.opacity = '0.5'; btn.disabled = true;
      await api(\`/api/tasks/\${id}/\${type}\`, { method: 'POST' }); refreshTasks();
    }

    function getCurrentOlIdx() {
      const val = document.getElementById('ol-account-select').value;
      return val === "" ? 0 : parseInt(val);
    }
    
    function switchOlAccount() {
      currentOpenListPath = '/';
      loadOpenList();
    }

    async function loadOpenList(path = currentOpenListPath) {
      const container = document.getElementById('openlist-content');
      const olIdx = getCurrentOlIdx();
      if (!sysConfig.openlist || sysConfig.openlist.length === 0) {
        container.innerHTML = '<div style="padding: 60px; text-align: center; color: var(--text-muted);">暂无配置任何 OpenList 账号，请在设置中添加</div>';
        return;
      }
      
      container.innerHTML = '<div style="padding: 60px; text-align: center; color: var(--primary);">📡 正在连接云端节点读取目录树...</div>';
      olSelected.clear(); updateOlToolbar();
      
      const res = await api('/api/openlist/list', { method: 'POST', body: JSON.stringify({ path, olIdx }) });
      if (res.error || res.code !== 200) {
        container.innerHTML = \`<div style="color:var(--danger); padding: 40px; text-align:center;"><strong>通讯阻断：</strong>\${res.error || res.message}</div>\`; return;
      }

      currentOpenListPath = path; document.getElementById('openlist-path').value = path;
      olFiles = res.data.content || []; renderOpenList();
    }

    function sortOpenList(field) {
      if (olSortBy === field) { olSortDesc = !olSortDesc; } else { olSortBy = field; olSortDesc = false; }
      renderOpenList();
    }

    function renderOpenList() {
      const container = document.getElementById('openlist-content');
      if (olFiles.length === 0) { container.innerHTML = '<div style="padding: 80px; text-align: center; color: var(--text-muted); font-size:14px;">文件夹已空</div>'; return; }

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

      let html = \`<table class="ol-table"><thead><tr><th style="width: 40px; text-align:center; border-radius: 6px 0 0 0;"><input type="checkbox" class="custom-checkbox" \${allChecked} onclick="toggleAllOlFiles(this.checked)"></th><th onclick="sortOpenList('name')">文件名称 <span class="sort-icon">\${getIcon('name')}</span></th><th style="width: 120px;" onclick="sortOpenList('size')">体积大小 <span class="sort-icon">\${getIcon('size')}</span></th><th style="width: 180px; border-radius: 0 6px 0 0;" onclick="sortOpenList('time')">最后修改 <span class="sort-icon">\${getIcon('time')}</span></th></tr></thead><tbody>\`;

      olFiles.forEach(f => {
        const isChecked = olSelected.has(f.name) ? 'checked' : '';
        const icon = f.is_dir ? '📁' : '📄';
        const size = f.is_dir ? '-' : formatSize(f.size);
        const time = new Date(f.modified).toLocaleString();
        const action = f.is_dir ? \`loadOpenList('\${currentOpenListPath === '/' ? '' : currentOpenListPath}/\${f.name}')\` : \`toggleOlFile('\${f.name}', !\${isChecked})\`;

        html += \`<tr><td style="text-align:center;"><input type="checkbox" class="custom-checkbox" value="\${f.name}" \${isChecked} onclick="toggleOlFile('\${f.name}', this.checked)"></td><td><div class="ol-filename-cell" onclick="\${action}"><span style="font-size: 18px; margin-right: 12px;">\${icon}</span><span title="\${f.name}">\${f.name}</span></div></td><td style="color: var(--text-muted);">\${size}</td><td style="color: var(--text-muted); font-size:12px;">\${time}</td></tr>\`;
      });
      html += \`</tbody></table>\`;
      container.innerHTML = html; updateOlToolbar();
    }

    function toggleOlFile(name, isChecked) {
      if (isChecked) olSelected.add(name); else olSelected.delete(name); renderOpenList();
    }
    function toggleAllOlFiles(isChecked) {
      if (isChecked) { olSelected = new Set(olFiles.map(f => f.name)); } else { olSelected.clear(); } renderOpenList();
    }
    function updateOlToolbar() {
      const show = olSelected.size > 0;
      document.getElementById('btn-ol-download').style.display = show ? 'inline-flex' : 'none';
      document.getElementById('btn-ol-rename').style.display = show ? 'inline-flex' : 'none';
      document.getElementById('btn-ol-delete').style.display = show ? 'inline-flex' : 'none';
    }
    function openListGoUp() {
      if (currentOpenListPath === '/') return;
      const parts = currentOpenListPath.split('/'); parts.pop(); loadOpenList(parts.join('/') || '/');
    }

    async function executeOlDownload() {
      const engine = document.getElementById('ol-engine-select').value;
      const olIdx = getCurrentOlIdx();
      hideModal('engine-select-modal');
      const filesToDownload = Array.from(olSelected);
      if(filesToDownload.length === 0) return;
      
      showToast(\`指令下达：开始解析 \${filesToDownload.length} 个云端资产...\`, 'success');
      let successCount = 0;
      for(const name of filesToDownload) {
        const path = currentOpenListPath === '/' ? \`/\${name}\` : \`\${currentOpenListPath}/\${name}\`;
        const res = await api('/api/openlist/get', { method: 'POST', body: JSON.stringify({ path, olIdx }) });
        if (res.code === 200 && res.data && res.data.raw_url) {
          const headers = res.data.header ? res.data.header : {};
          const dlRes = await api('/api/download', { method: 'POST', body: JSON.stringify({ url: res.data.raw_url, engine, headers }) });
          if(dlRes.success) successCount++;
        }
      }
      showToast(\`数据流转完成：成功推入本地引擎 \${successCount} 个任务\`, 'success');
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
        if (!searchStr) return oldName; return oldName.split(searchStr).join(replaceStr);
      } else if (mode === 'sequence') {
        const formatStr = document.getElementById('rename-batch-format').value;
        let num = window._seqCurrentNum++; 
        if (!formatStr) return oldName;
        const dotIdx = oldName.lastIndexOf('.');
        const ext = dotIdx > -1 ? oldName.substring(dotIdx) : '';
        let newName = formatStr.replace(/\\{ext\\}/g, ext);
        if (newName.includes('{number}')) { newName = newName.replace(/\\{number\\}/g, num); } else { newName = newName + num; }
        return newName;
      } return oldName;
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
        if (oldName !== newName) { html += \`<div class="preview-item"><del>\${oldName}</del><br>➜ <span>\${newName}</span></div>\`; } 
        else { html += \`<div class="preview-item" style="opacity:0.5;">\${oldName} (无命中，无修改)</div>\`; }
      });
      box.innerHTML = html || '等待规则输入以接管命名空间...';
    }

    function showRenameModal() {
      if (olSelected.size === 0) return;
      const isSingle = olSelected.size === 1;
      document.getElementById('rename-title').textContent = isSingle ? '✏️ 单体文件重命名' : \`✏️ 批量接管 (\${olSelected.size} 个资产)\`;
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
      toggleBatchMode(); showModal('rename-modal'); generateRenamePreview();
    }

    async function submitRename() {
      const btn = document.getElementById('btn-submit-rename'); btn.textContent = '节点通讯中...'; btn.disabled = true;
      const mode = document.querySelector('input[name="batch-rename-mode"]:checked').value;
      const selectedNames = Array.from(olSelected).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      window._seqCurrentNum = parseInt(document.getElementById('rename-batch-start').value) || 1;
      let successCount = 0; const olIdx = getCurrentOlIdx();

      for (const oldName of selectedNames) {
        const newName = calculateNewName(oldName, mode);
        if (newName !== oldName) {
          const path = currentOpenListPath === '/' ? \`/\${oldName}\` : \`\${currentOpenListPath}/\${oldName}\`;
          const res = await api('/api/openlist/rename', { method: 'POST', body: JSON.stringify({ name: newName, path, olIdx }) });
          if(res.code === 200) successCount++;
        }
      }
      btn.innerHTML = '✅ 确认执行修改'; btn.disabled = false; hideModal('rename-modal');
      showToast(\`命名空间同步完毕，成功接管 \${successCount} 个文件记录\`); loadOpenList(currentOpenListPath);
    }

    async function deleteSelectedFiles() {
      if (!confirm(\`高危操作警告：确定彻底粉碎这 \${olSelected.size} 个云端资产吗？无法恢复！\`)) return;
      showToast('销毁指令下达...', 'warning');
      const names = Array.from(olSelected); const olIdx = getCurrentOlIdx();
      const res = await api('/api/openlist/remove', { method: 'POST', body: JSON.stringify({ dir: currentOpenListPath, names, olIdx }) });
      if (res.code === 200) { showToast('资产已粉碎', 'success'); loadOpenList(currentOpenListPath); } else { showToast('粉碎失败: ' + res.message, 'error'); }
    }

    async function loadConfig() {
      const config = await api('/api/config');
      if (config.error) throw new Error(config.error); 
      sysConfig = config; 
      
      aria2Nodes = config.aria2 || []; renderAria2Nodes();
      olAccounts = config.openlist || []; renderOlAccounts(); updateOlDropdown();
      
      document.getElementById('panel-user').value = config.auth?.username || 'admin';
      document.getElementById('panel-pass').value = ''; 
      document.getElementById('qbit-url').value = config.qbit?.baseUrl || '';
      document.getElementById('qbit-user').value = config.qbit?.username || '';
      document.getElementById('qbit-pass').value = config.qbit?.password || '';
    }

    function renderAria2Nodes() {
      const container = document.getElementById('aria2-nodes-container'); container.innerHTML = '';
      aria2Nodes.forEach((node, idx) => {
        container.innerHTML += \`
          <div class="config-card">
            <button class="remove-btn" onclick="removeAria2Node(\${idx})" title="销毁节点">✖</button>
            <div class="form-group"><label>节点标签名称</label><input type="text" id="a2-name-\${idx}" class="form-control" value="\${node.name}"></div>
            <div class="form-group"><label>JSON-RPC 端点</label><input type="text" id="a2-url-\${idx}" class="form-control" value="\${node.url}" placeholder="例如 http://IP:6800/jsonrpc"></div>
            <div class="form-group"><label>安全密钥 (Secret)</label><input type="password" id="a2-sec-\${idx}" class="form-control" value="\${node.secret}"></div>
          </div>
        \`;
      });
      if(aria2Nodes.length === 0) container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:13px;">集群节点为空，建议添加基础节点</div>';
    }
    function addAria2NodeForm() { aria2Nodes.push({ name: '新扩展节点', url: '', secret: '' }); renderAria2Nodes(); }
    function removeAria2Node(idx) { if(confirm('确认从集群中剔除此下载节点？')) { aria2Nodes.splice(idx, 1); renderAria2Nodes(); } }

    function renderOlAccounts() {
      const container = document.getElementById('ol-accounts-container'); container.innerHTML = '';
      olAccounts.forEach((acc, idx) => {
        container.innerHTML += \`
          <div class="config-card" style="border-left: 3px solid var(--primary);">
            <button class="remove-btn" onclick="removeOlAccount(\${idx})" title="解除绑定">✖</button>
            <div class="form-group"><label>网盘别名标识</label><input type="text" id="ol-name-\${idx}" class="form-control" value="\${acc.name || '默认云盘'}"></div>
            <div class="form-group"><label>API 端点地址</label><input type="text" id="ol-url-\${idx}" class="form-control" value="\${acc.url}" placeholder="例如 http://IP:5244"></div>
            <div class="form-group"><label>高级认证令牌 (Token)</label><input type="password" id="ol-token-\${idx}" class="form-control" value="\${acc.token}"></div>
          </div>
        \`;
      });
      if(olAccounts.length === 0) container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:13px;">暂无绑定的 OpenList 资源池</div>';
    }
    function addOlAccount() { olAccounts.push({ name: '新增云盘矩阵', url: '', token: '' }); renderOlAccounts(); }
    function removeOlAccount(idx) { if(confirm('确认切断此云端矩阵的连接？')) { olAccounts.splice(idx, 1); renderOlAccounts(); } }

    function updateOlDropdown() {
      const sel = document.getElementById('ol-account-select');
      sel.innerHTML = '';
      if(!sysConfig.openlist || sysConfig.openlist.length === 0) { sel.innerHTML = '<option value="">无可用网盘</option>'; return; }
      sysConfig.openlist.forEach((acc, idx) => {
        sel.innerHTML += \`<option value="\${idx}">☁️ \${acc.name || '默认云盘'}</option>\`;
      });
    }

    async function saveSettings() {
      for(let i=0; i<aria2Nodes.length; i++) {
        aria2Nodes[i].name = document.getElementById(\`a2-name-\${i}\`).value;
        aria2Nodes[i].url = document.getElementById(\`a2-url-\${i}\`).value;
        aria2Nodes[i].secret = document.getElementById(\`a2-sec-\${i}\`).value;
      }
      for(let i=0; i<olAccounts.length; i++) {
        olAccounts[i].name = document.getElementById(\`ol-name-\${i}\`).value;
        olAccounts[i].url = document.getElementById(\`ol-url-\${i}\`).value;
        olAccounts[i].token = document.getElementById(\`ol-token-\${i}\`).value;
      }

      const pUser = document.getElementById('panel-user').value;
      const pPass = document.getElementById('panel-pass').value || sysConfig.auth.password;
      
      const config = {
        auth: { username: pUser, password: pPass },
        aria2: aria2Nodes,
        openlist: olAccounts,
        qbit: { baseUrl: document.getElementById('qbit-url').value, username: document.getElementById('qbit-user').value, password: document.getElementById('qbit-pass').value }
      };
      
      const res = await api('/api/config', { method: 'POST', body: JSON.stringify(config) });
      if (res.success) { 
        hideModal('settings-modal'); 
        showToast('系统核心态配置重载成功', 'success'); 
        authToken = btoa(pUser + ':' + pPass); localStorage.setItem('manager_auth_token', authToken);
        sysConfig = config; document.getElementById('panel-pass').value = '';
        updateOlDropdown(); refreshTasks(); 
        if(ws) { ws.onclose = null; ws.close(); } connectWS(); 
        
        if(document.getElementById('section-openlist').classList.contains('active')) { switchOlAccount(); }
      }
    }

    async function refreshTasks() {
      tasks = await api('/api/tasks'); 
      if (tasks.error) return; renderTasks();
      const stats = await api('/api/global-stats');
      document.getElementById('global-speed').textContent = \`⬇️ \${formatSize((stats.aria2Speed || 0) + (stats.qbitSpeed || 0))}/s\`;
      
      let sbHtml = \`QBit 引擎: <span style="color: \${stats.qbit ? 'var(--success)' : 'var(--danger)'}">\${stats.qbit ? '就绪' : '断线'}</span><br>\`;
      if(sysConfig.aria2 && Array.isArray(sysConfig.aria2)) {
        sysConfig.aria2.forEach((node, i) => {
          const isOnline = stats.aria2Nodes && stats.aria2Nodes[i];
          sbHtml += \`\${node.name}: <span style="color: \${isOnline ? 'var(--success)' : 'var(--danger)'}">\${isOnline ? '就绪' : '断线'}</span><br>\`;
        });
      }
      document.getElementById('sidebar-engines-status').innerHTML = sbHtml;
    }

    function toggleAuthType() { const type = document.getElementById('ssh-auth-type').value; document.getElementById('ssh-pass').style.display = type === 'password' ? 'inline-block' : 'none'; document.getElementById('ssh-key-file').style.display = type === 'key' ? 'inline-block' : 'none'; }
    function onKeySelect(e) { const file = e.target.files[0]; if(!file) { currentKeyContent = ""; return; } const reader = new FileReader(); reader.onload = ev => { currentKeyContent = ev.target.result; showToast('终端凭证指纹载入完毕'); }; reader.readAsText(file); }
    function renderHistoryList() { const sel = document.getElementById('ssh-history'); sel.innerHTML = '<option value="">-- 连接记录检索 --</option>'; JSON.parse(localStorage.getItem('ssh_history') || '[]').forEach((h, i) => sel.innerHTML += \`<option value="\${i}">\${h.username}@\${h.host}</option>\`); }
    function loadHistory(idx) { if(idx === "") return; const h = JSON.parse(localStorage.getItem('ssh_history') || '[]')[idx]; if(h) { document.getElementById('ssh-host').value = h.host; document.getElementById('ssh-port').value = h.port; document.getElementById('ssh-user').value = h.username; } }
    function saveHistory(host, port, username) { let history = JSON.parse(localStorage.getItem('ssh_history') || '[]').filter(h => !(h.host === host && h.username === username)); history.unshift({ host, port, username }); localStorage.setItem('ssh_history', JSON.stringify(history.slice(0, 15))); renderHistoryList(); }
    function connectSSH() {
      const host = document.getElementById('ssh-host').value, port = parseInt(document.getElementById('ssh-port').value) || 22, username = document.getElementById('ssh-user').value, authType = document.getElementById('ssh-auth-type').value, password = document.getElementById('ssh-pass').value;
      if(!host || !username) return showToast('寻址目标与身份标识缺一不可', 'error');
      if (sshWs) { sshWs.onclose = null; sshWs.close(); } 
      term.clear(); term.writeln('\\x1b[38;5;39mInitiating secure shell handshake...\\x1b[0m');
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
      sshWs.onclose = () => { term.writeln('\\r\\n\\x1b[31m[Link Severed]\\x1b[0m'); document.getElementById('btn-ssh-conn').style.display = 'inline-flex'; document.getElementById('btn-ssh-disc').style.display = 'none'; };
    }
    function disconnectSSH() { if(sshWs) sshWs.close(); }

    function connectWS() {
      if (ws) { ws.onclose = null; ws.close(); } 
      ws = new WebSocket(\`ws://\${location.hostname}:28080/tasks?token=\${authToken}\`);
      const wsStatus = document.getElementById('ws-status');
      ws.onopen = () => { wsStatus.textContent = '🟢 双向链路已就绪'; wsStatus.style.color = 'var(--success)'; };
      ws.onclose = () => { wsStatus.textContent = '🔴 链路断开，重试中'; wsStatus.style.color = 'var(--danger)'; setTimeout(connectWS, 3000); };
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
      sysConfig = cfg; updateOlDropdown();
      refreshTasks(); connectWS(); 
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(refreshTasks, 3000);
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
    openlist: [] 
  };
  try { 
    if (fs.existsSync(CONFIG_FILE)) {
      const diskCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      cfg = { ...cfg, ...diskCfg };
      if (!cfg.auth || !cfg.auth.username) cfg.auth = { username: 'admin', password: 'password' };
      
      if (cfg.openlist && !Array.isArray(cfg.openlist)) {
        if (cfg.openlist.url) {
          cfg.openlist = [{ name: '默认迁移节点', url: cfg.openlist.url, token: cfg.openlist.token }];
        } else {
          cfg.openlist = [];
        }
        saveConfig(cfg);
      }
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

function getOlConf(req) {
  const idx = req.body.olIdx || 0;
  return config.openlist[idx];
}

app.post('/api/openlist/list', async (req, res) => {
  const { path } = req.body;
  const olConf = getOlConf(req);
  if (!olConf || !olConf.url) return res.status(400).json({ error: '当前网盘节点未配置有效端点' });
  try { const response = await axios.post(`${olConf.url}/api/fs/list`, { path: path || "/", password: "", page: 1, per_page: 0, refresh: false }, { headers: { 'Authorization': olConf.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/get', async (req, res) => {
  const { path } = req.body;
  const olConf = getOlConf(req);
  if (!olConf || !olConf.url) return res.status(400).json({ error: '当前网盘节点未配置有效端点' });
  try { const response = await axios.post(`${olConf.url}/api/fs/get`, { path, password: "" }, { headers: { 'Authorization': olConf.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/rename', async (req, res) => {
  const { name, path } = req.body;
  const olConf = getOlConf(req);
  try { const response = await axios.post(`${olConf.url}/api/fs/rename`, { name, path }, { headers: { 'Authorization': olConf.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/openlist/remove', async (req, res) => {
  const { dir, names } = req.body;
  const olConf = getOlConf(req);
  try { const response = await axios.post(`${olConf.url}/api/fs/remove`, { dir, names }, { headers: { 'Authorization': olConf.token || '' }, timeout: 10000 }); res.json(response.data); } catch (e) { res.status(500).json({ error: e.message }); }
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
  const { url, engine, headers } = req.body; 
  const urls = url.split(/[\n,]/).map(u => u.trim()).filter(u => u);
  if (urls.length === 0) return res.status(400).json({ success: false });
  
  const results = [];
  for (const dlUrl of urls) {
    let targetEngine = engine;
    if (!targetEngine || targetEngine === 'auto') targetEngine = detectEngine(dlUrl);
    
    try {
      if (targetEngine.startsWith('aria2_')) {
        const idx = parseInt(targetEngine.split('_')[1]);
        
        let headerArray = [];
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            headerArray.push(`${key}: ${value}`);
          }
        }
        const aria2Options = headerArray.length > 0 ? { header: headerArray } : {};
        
        const gid = await aria2.call(idx, 'addUri', [[dlUrl], aria2Options]);
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
  res.json({ success: results.some(r => r.success), message: `流转完毕: 已将 ${results.filter(r => r.success).length} 个任务指派给底层节点` });
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
