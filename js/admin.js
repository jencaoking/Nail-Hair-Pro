/* 管理后台：登录 / 概览 / 密钥与引擎 / 用户 / 生成日志 / 设置 */
import { initTheme, bindThemeToggleBtn } from './ui/theme.js';

// 初始化后台暗黑/浅色主题
initTheme();

const TOKEN_KEY = 'ti.admin.token';

const app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortId = id => String(id || '').slice(0, 10);
const fmtTime = t => {
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function toast(msg, kind = '') {
  const box = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
const setToken = t => t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/admin/' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { 'Authorization': 'Bearer ' + getToken() } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await res.json().catch(() => ({ ok: false, message: '响应异常' }));
  if (res.status === 401 && path !== 'login') {
    setToken('');
    renderLogin();
    throw new Error('请先登录');
  }
  return j;
}

/* ================= 登录 ================= */
function renderLogin(errMsg = '') {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <div class="art">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#5C4A42" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 18h24l-3 8v26a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8V26z" fill="#FF9BB3"/>
            <circle cx="32" cy="38" r="7" fill="#FFF8F2"/>
            <path d="M28 35l8 6M36 35l-8 6" stroke="#F27E9C"/>
          </svg>
        </div>
        <h1>莓好灵感屋 · 管理后台</h1>
        <p>引擎密钥、用户与额度都在这里管理</p>
        <div class="field" style="text-align:left">
          <label for="pw">管理口令</label>
          <input id="pw" type="password" autocomplete="current-password" placeholder="请输入管理口令" required>
        </div>
        <p class="err-msg">${esc(errMsg)}</p>
        <button class="btn btn-primary" style="width:100%" type="submit">进入后台</button>
        <p style="margin-top:14px"><a href="/" style="font-size:.78rem">← 回到用户端</a></p>
      </form>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = document.getElementById('pw').value;
    try {
      const j = await api('login', { method: 'POST', body: { password: pw } });
      if (j.ok) { setToken(j.token); location.hash = '#overview'; renderApp(); }
      else renderLogin(j.message || '口令不对哦');
    } catch {
      renderLogin('服务没有响应，请确认服务已启动');
    }
  });
}

/* ================= 主框架 ================= */
const TABS = [
  { id: 'overview', label: '📊 概览' },
  { id: 'personas', label: '🎯 用户画像与推荐算法' },
  { id: 'keys', label: '🔑 密钥与引擎' },
  { id: 'users', label: '👥 用户' },
  { id: 'events', label: '📋 生成日志' },
  { id: 'research', label: '🔬 研究数据' },
  { id: 'settings', label: '⚙️ 站点设置' }
];

function renderApp() {
  const tab = (location.hash.replace('#', '') || 'overview');
  if (!TABS.some(t => t.id === tab)) { location.hash = '#overview'; return renderApp(); }
  app.innerHTML = `
    <header class="topbar">
      <span class="brand">
        <svg width="26" height="26" viewBox="0 0 64 64" fill="none" stroke="#5C4A42" stroke-width="3" aria-hidden="true"><path d="M20 18h24l-3 8v26a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8V26z" fill="#FF9BB3"/><circle cx="32" cy="38" r="7" fill="#FFF8F2"/></svg>
        <span class="brand-text">莓好灵感屋 <span class="sub">管理后台</span></span>
      </span>
      <span class="spacer"></span>
      <div class="topbar-actions">
        <button class="theme-toggle-btn" id="admin-theme-toggle" aria-label="切换明暗主题模式" title="切换明暗主题" style="width:36px;height:36px;font-size:1rem">
          <span class="theme-icon" aria-hidden="true">🌓</span>
        </button>
        <a class="site-link" href="/" target="_blank" rel="noopener">用户端 ↗</a>
        <button class="logout" id="btn-logout">退出</button>
      </div>
    </header>
    <div class="layout">
      <h1 class="page-title">${TABS.find(t => t.id === tab).label}</h1>
      <nav class="sidenav" aria-label="后台导航">
        ${TABS.map(t => `<a href="#${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</a>`).join('')}
      </nav>
      <main id="view" class="view"></main>
    </div>`;

  const themeToggleBtn = document.getElementById('admin-theme-toggle');
  if (themeToggleBtn) {
    bindThemeToggleBtn(themeToggleBtn);
  }

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await api('logout', { method: 'POST' }); } catch { /* 忽略 */ }
    setToken('');
    renderLogin();
  });
  VIEWS[tab](document.getElementById('view'));
}

/* ================= 概览 ================= */
async function viewOverview(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const j = await api('overview').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const s = j.stats;
  const engineList = j.engines.map(e => `
    <div class="engine-item">
      <div class="head">
        <strong>${esc(e.label)}</strong>
        ${e.primary ? '<span class="chip gold">首选</span>' : ''}
        ${e.ready ? '<span class="chip mint">可用</span>' : '<span class="chip disabled">未启用</span>'}
        ${e.requiresKey ? '' : '<span class="chip lav">免密钥</span>'}
        <a href="${esc(e.docsUrl)}" target="_blank" rel="noopener" style="font-size:.72rem;margin-left:auto">文档 ↗</a>
      </div>
      <p class="notes">${esc(e.notes)}</p>
    </div>`).join('');

  const byProvider = Object.entries(s.byProvider || {}).map(([id, v]) => {
    const total = v.ok + v.fail;
    const pct = total ? Math.round(v.ok / total * 100) : 0;
    return `<tr>
      <td>${esc(id)}</td>
      <td class="num">${v.ok}</td>
      <td class="num">${v.fail}</td>
      <td><div class="pbar"><i style="width:${pct}%"></i></div></td>
      <td class="num">${pct}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--muted)">还没有生成记录</td></tr>';

  view.innerHTML = `
    <div class="card">
      <h2>今日概况</h2>
      <p class="desc">所有用户共用的站点级统计</p>
      <div class="stat-grid">
        <div class="stat"><b>${j.todayGens}</b><span>今日生成</span></div>
        <div class="stat"><b>${j.todayUsers}</b><span>今日活跃用户</span></div>
        <div class="stat"><b>${j.userCount}</b><span>累计用户</span></div>
        <div class="stat"><b>${s.ok}</b><span>累计成功</span></div>
        <div class="stat"><b>${s.fail}</b><span>累计失败</span></div>
      </div>
    </div>
    <div class="card">
      <h2>引擎降级链</h2>
      <p class="desc">生成时按「首选 → 其余已配置引擎」顺序自动尝试；密钥在「密钥与引擎」页维护</p>
      ${engineList}
    </div>
    <div class="card">
      <h2>各引擎成功率</h2>
      <div class="table-responsive">
        <table><thead><tr><th>引擎</th><th>成功</th><th>失败</th><th style="min-width:100px;width:35%">占比</th><th>成功率</th></tr></thead>
        <tbody>${byProvider}</tbody></table>
      </div>
    </div>`;
}

/* ================= 密钥与引擎 ================= */
async function viewKeys(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const [ov, ks] = await Promise.all([api('overview').catch(() => null), api('keys').catch(() => null)]);
  if (!ov || !ov.ok || !ks || !ks.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const needKey = ov.engines.filter(e => e.requiresKey);
  const keyCard = needKey.map(e => {
    const shape = e.keyShape || { key: 'API Key' };
    const fields = Object.entries(shape).map(([f, label]) => {
      const field = f === 'key' ? e.id : f;
      const masked = e.id === 'cloudflare' ? (ks.keys.cloudflare && ks.keys.cloudflare[f]) : ks.keys[e.id];
      return `
        <div class="field">
          <label for="k-${e.id}-${f}">${esc(label)}</label>
          <div class="row">
            <input id="k-${e.id}-${f}" data-field="${field}" data-engine="${e.id}" type="password" style="flex:1;min-width:180px" placeholder="${masked ? '已配置（' + esc(masked) + '），留空保持不变' : '尚未配置'}" autocomplete="off">
          </div>
        </div>`;
    }).join('');
    return `
      <div class="engine-item" data-engine-card="${e.id}">
        <div class="head">
          <strong>${esc(e.label)}</strong>
          ${e.ready ? '<span class="chip mint">已配置</span>' : '<span class="chip disabled">未配置</span>'}
          ${e.primary ? '<span class="chip gold">首选</span>' : ''}
        </div>
        ${fields}
        <div class="row">
          <button class="btn btn-sm btn-primary" data-save="${e.id}">保存</button>
          <button class="btn btn-sm btn-mint" data-verify="${e.id}">测试一下</button>
          <span class="verify-result" data-result="${e.id}"></span>
        </div>
        <p class="notes">${esc(e.notes)}</p>
      </div>`;
  }).join('');

  view.innerHTML = `
    <div class="card">
      <h2>AI 引擎密钥</h2>
      <p class="desc">密钥只保存在服务器 data.json，不会下发到任何浏览器。填完点「保存」即可生效，无需重启。</p>
      ${keyCard}
    </div>
    <div class="card">
      <h2>Pollinations Token（可选）</h2>
      <p class="desc">默认引擎 Pollinations 不填任何东西就能用（匿名模式，画质中等）。在 enter.pollinations.ai 免费领取 Token 填入后，自动切换为 kontext 高保真编辑，画质明显更好且不排队。</p>
      <div class="field">
        <label for="k-pollinations">Pollinations Token</label>
        <div class="row">
          <input id="k-pollinations" type="password" style="flex:1;min-width:180px" placeholder="${ks.keys.pollinations ? '已配置（' + esc(ks.keys.pollinations) + '），留空保持不变' : 'enter.pollinations.ai 领取，可不填'}" autocomplete="off">
          <button class="btn btn-sm btn-primary" id="save-pollinations">保存</button>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>临时图床 imgbb（可选）</h2>
      <p class="desc">默认引擎需要先把照片传临时图床：自动按 tmpfiles.org → uguu.se → litterbox 依次尝试（均免密钥，任一可用即成功）。配置 imgbb 后再追加一道兜底，容灾更强。</p>
      <div class="field">
        <label for="k-imgbb">imgbb API Key</label>
        <div class="row">
          <input id="k-imgbb" type="password" style="flex:1;min-width:180px" placeholder="${ks.keys.imgbb ? '已配置（' + esc(ks.keys.imgbb) + '），留空保持不变' : 'imgbb.com 免费注册获取'}" autocomplete="off">
          <button class="btn btn-sm btn-primary" id="save-imgbb">保存</button>
        </div>
      </div>
    </div>`;

  /* 保存引擎密钥 */
  view.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
    const engine = btn.dataset.save;
    const card = view.querySelector(`[data-engine-card="${engine}"]`);
    const inputs = [...card.querySelectorAll('input[data-field]')];
    const values = inputs.map(i => ({ field: i.dataset.field, value: i.value.trim() }));
    if (engine === 'cloudflare') {
      /* 两个字段一次提交，留空不覆盖 */
      const cur = { accountId: values.find(v => v.field === 'accountId')?.value || '', token: values.find(v => v.field === 'token')?.value || '' };
      const j = await api('keys', { method: 'POST', body: { field: 'cloudflare', value: cur } }).catch(e => ({ ok: false, message: e.message }));
      toast(j.ok ? (j.warning || '已保存') : (j.message || '保存失败'), j.ok && !j.warning ? '' : 'err');
    } else {
      for (const v of values) {
        if (!v.value) continue;
        const j = await api('keys', { method: 'POST', body: v }).catch(e => ({ ok: false, message: e.message }));
        if (!j.ok) { toast(j.message || '保存失败', 'err'); return; }
        if (j.warning) { toast(j.warning, 'err'); return; }
      }
      toast('已保存');
    }
    viewKeys(view);
  }));

  /* 验证密钥 */
  view.querySelectorAll('[data-verify]').forEach(btn => btn.addEventListener('click', async () => {
    const engine = btn.dataset.verify;
    const out = view.querySelector(`[data-result="${engine}"]`);
    out.className = 'verify-result';
    out.textContent = '验证中…';
    btn.disabled = true;
    try {
      const j = await api('keys/verify', { method: 'POST', body: { provider: engine } });
      out.className = 'verify-result ' + (j.ok ? 'ok' : 'err');
      out.textContent = j.message || (j.ok ? '有效' : '验证失败');
    } catch (e) {
      out.className = 'verify-result err';
      out.textContent = e.message || '验证失败';
    } finally {
      btn.disabled = false;
    }
  }));

  /* pollinations token */
  document.getElementById('save-pollinations').addEventListener('click', async () => {
    const v = document.getElementById('k-pollinations').value.trim();
    if (!v) return toast('先填入 Token，不需要就留空', 'err');
    const j = await api('keys', { method: 'POST', body: { field: 'pollinations', value: v } }).catch(e => ({ ok: false, message: e.message }));
    toast(j.ok ? (j.warning || '已保存，下一次生成即用 kontext') : (j.message || '保存失败'), j.ok && !j.warning ? '' : 'err');
    if (j.ok) viewKeys(view);
  });

  /* imgbb */
  document.getElementById('save-imgbb').addEventListener('click', async () => {
    const v = document.getElementById('k-imgbb').value.trim();
    if (!v) return toast('先填入 imgbb 密钥', 'err');
    const j = await api('keys', { method: 'POST', body: { field: 'imgbb', value: v } }).catch(e => ({ ok: false, message: e.message }));
    toast(j.ok ? (j.warning || '已保存') : (j.message || '保存失败'), j.ok && !j.warning ? '' : 'err');
    if (j.ok) viewKeys(view);
  });
}

/* ================= 用户管理与单独设置 ================= */
async function viewUsers(view) {
  view.innerHTML = '<div class="card"><p class="desc">正在加载全站用户列表与设备网络档案…</p></div>';
  const j = await api('users').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，请刷新重试</p></div>'; return; }

  const users = j.users || [];
  const globalDailyLimit = j.globalDailyLimit || 20;

  // 统计指标
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalCount = users.length;
  const todayActiveCount = users.filter(u => u.day === todayStr && (u.dayCount > 0 || (u.last || '').startsWith(todayStr))).length;
  const customQuotaCount = users.filter(u => u.isCustomLimit || u.bonusQuota > 0).length;
  const blockedCount = users.filter(u => u.blocked).length;

  let currentFilter = 'all'; // all | today | custom | blocked
  let currentSearch = '';

  function renderUserTable() {
    const term = currentSearch.trim().toLowerCase();
    const filtered = users.filter(u => {
      if (currentFilter === 'today' && !(u.day === todayStr && (u.dayCount > 0 || (u.last || '').startsWith(todayStr)))) return false;
      if (currentFilter === 'custom' && !(u.isCustomLimit || u.bonusQuota > 0)) return false;
      if (currentFilter === 'blocked' && !u.blocked) return false;
      if (!term) return true;

      const idMatch = (u.id || '').toLowerCase().includes(term);
      const ipMatch = (u.lastIp || '').toLowerCase().includes(term) || (Array.isArray(u.ips) && u.ips.some(ip => ip.toLowerCase().includes(term)));
      const devMatch = (u.lastDevice || '').toLowerCase().includes(term);
      const noteMatch = (u.note || '').toLowerCase().includes(term);
      const personaMatch = (u.persona?.name || '').toLowerCase().includes(term);
      return idMatch || ipMatch || devMatch || noteMatch || personaMatch;
    });

    const rowsHtml = filtered.map(u => {
      const isToday = u.day === todayStr;
      const dayCount = isToday ? (u.dayCount || 0) : 0;
      const effectiveLimit = u.effectiveLimit || globalDailyLimit;
      const remaining = u.remainingToday != null ? u.remainingToday : Math.max(0, effectiveLimit - dayCount);
      const pct = Math.min(100, Math.round((dayCount / Math.max(1, effectiveLimit)) * 100));

      const quotaBarClass = pct >= 100 ? 'full' : pct >= 75 ? 'warning' : '';
      const customPills = [];
      if (u.isCustomLimit) customPills.push(`<span class="quota-tag-custom" title="独立每日上限: ${u.dailyLimit}">⭐ 专属 ${u.dailyLimit}/天</span>`);
      if (u.bonusQuota > 0) customPills.push(`<span class="quota-tag-bonus" title="额外赠送额度: +${u.bonusQuota}">🎁 赠送 +${u.bonusQuota}</span>`);

      // 设备与 IP
      const ipDisplay = u.lastIp ? `<span class="user-ip-tag" title="最近访问 IP">${esc(u.lastIp)}</span>` : '<span style="color:#aaa;font-size:0.75rem">未记录</span>';
      const ipCountTag = Array.isArray(u.ips) && u.ips.length > 1 ? `<span style="font-size:0.68rem;color:#777;margin-left:2px">(${u.ips.length}个IP)</span>` : '';

      const deviceDisplay = u.lastDevice ? `<span class="user-device-tag" title="${esc(u.lastUserAgent || u.lastDevice)}">${esc(u.lastDevice)}</span>` : '<span style="color:#aaa;font-size:0.75rem">Web 客户端</span>';

      const personaBadge = u.persona ? `<span class="user-persona-tag" title="置信度: ${u.persona.confidence || 0}%">${esc(u.persona.badge || '🌱')} ${esc(u.persona.name || '灵感初探')}</span>` : '';

      const notePill = u.note ? `<span class="note-preview-pill" data-edit-user="${esc(u.id)}" title="${esc(u.note)}">📝 ${esc(u.note)}</span>` : '';

      return `
        <tr class="${u.blocked ? 'blocked' : ''}" data-user-row="${esc(u.id)}">
          <td>
            <div class="user-cell-id">
              <div class="user-id-row">
                <span class="mono" style="font-weight:900" title="${esc(u.id)}">${esc(shortId(u.id))}</span>
                <button class="btn-copy-id" data-copy-id="${esc(u.id)}" title="复制完整 Client ID">📋</button>
              </div>
              ${personaBadge}
              ${notePill}
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;flex-wrap:wrap">
              ${ipDisplay}${ipCountTag}
            </div>
          </td>
          <td>
            ${deviceDisplay}
          </td>
          <td>
            <div class="quota-cell">
              <div class="quota-num-row">
                <span class="nums">${dayCount} / ${effectiveLimit}</span>
                <span class="sub">余 ${remaining}</span>
              </div>
              <div class="quota-bar-track">
                <div class="quota-bar-fill ${quotaBarClass}" style="width:${pct}%"></div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:2px">
                ${customPills.join('')}
              </div>
            </div>
          </td>
          <td class="num font-mono" style="font-weight:900">${u.total || 0}</td>
          <td class="num" style="font-size:0.78rem;color:#555;white-space:nowrap">${esc(fmtTime(u.last))}</td>
          <td>
            ${u.blocked ? '<span class="chip danger">已封禁</span>' : '<span class="chip mint">正常</span>'}
          </td>
          <td>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">
              <button class="btn btn-sm btn-lav" data-manage-user="${esc(u.id)}">⚙️ 单独管理</button>
              <button class="btn btn-sm ${u.blocked ? 'btn-mint' : 'btn-danger'}" data-quick-block="${esc(u.id)}" data-to="${u.blocked ? '0' : '1'}">${u.blocked ? '解封' : '封禁'}</button>
            </div>
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">没有找到符合条件的用户</td></tr>';

    const tbody = view.querySelector('#user-table-body');
    if (tbody) tbody.innerHTML = rowsHtml;
    bindTableEvents();
  }

  view.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <h2>👥 用户档案与单独管理</h2>
          <p class="desc">实时追踪用户 IP、访问终端与设备、画像偏好，并支持为单个用户单独调整每日额度、发放专属额外额度或重置使用量。</p>
        </div>
        <button class="btn btn-primary" id="btn-refresh-users">🔄 刷新列表</button>
      </div>

      <!-- 统计指标条 -->
      <div class="user-stats-strip">
        <div class="user-stat-chip">
          <span class="lbl">已建档用户总数</span>
          <span class="val">${totalCount} <span style="font-size:0.75rem;font-weight:600">人</span></span>
        </div>
        <div class="user-stat-chip">
          <span class="lbl">今日活跃用户</span>
          <span class="val" style="color:var(--primary)">${todayActiveCount} <span style="font-size:0.75rem;font-weight:600">人</span></span>
        </div>
        <div class="user-stat-chip">
          <span class="lbl">特别配额用户</span>
          <span class="val" style="color:#d97706">${customQuotaCount} <span style="font-size:0.75rem;font-weight:600">人</span></span>
        </div>
        <div class="user-stat-chip">
          <span class="lbl">已封禁黑名单</span>
          <span class="val" style="color:var(--danger)">${blockedCount} <span style="font-size:0.75rem;font-weight:600">人</span></span>
        </div>
      </div>

      <!-- 搜索与筛选工具栏 -->
      <div class="user-toolbar">
        <div class="user-search-wrap">
          <span>🔍</span>
          <input type="text" id="user-search-input" placeholder="搜索 ID、IP、设备、备注或画像..." value="">
        </div>

        <div class="user-filter-chips">
          <button type="button" class="user-filter-chip active" data-filter="all">全部 (${totalCount})</button>
          <button type="button" class="user-filter-chip" data-filter="today">今日活跃 (${todayActiveCount})</button>
          <button type="button" class="user-filter-chip" data-filter="custom">特别配额 (${customQuotaCount})</button>
          <button type="button" class="user-filter-chip" data-filter="blocked">已封禁 (${blockedCount})</button>
        </div>
      </div>

      <!-- 用户列表表格 -->
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>用户 / 画像</th>
              <th>网络 IP 归属</th>
              <th>访问终端设备</th>
              <th>今日额度 / 进度</th>
              <th>累计生成</th>
              <th>最近活跃</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="user-table-body"></tbody>
        </table>
      </div>
    </div>

    <!-- 用户单独管理弹窗挂载点 -->
    <div id="user-modal-container"></div>`;

  renderUserTable();

  // 工具栏事件
  const searchInput = view.querySelector('#user-search-input');
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value;
    renderUserTable();
  });

  const filterChips = view.querySelectorAll('.user-filter-chip');
  filterChips.forEach(btn => {
    btn.addEventListener('click', () => {
      filterChips.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderUserTable();
    });
  });

  view.querySelector('#btn-refresh-users').addEventListener('click', () => {
    viewUsers(view);
  });

  function bindTableEvents() {
    // 复制 ID
    view.querySelectorAll('[data-copy-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.copyId;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(id).then(() => toast('已复制用户 ID: ' + id, 'ok')).catch(() => {});
        } else {
          prompt('请手动复制用户 ID:', id);
        }
      });
    });

    // 快捷封禁 / 解封
    view.querySelectorAll('[data-quick-block]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clientId = btn.dataset.quickBlock;
        const toBlocked = btn.dataset.to === '1';
        const res = await api('users/block', { method: 'POST', body: { clientId, blocked: toBlocked } }).catch(() => null);
        if (res && res.ok) {
          toast(toBlocked ? '🚫 用户已封禁' : '✅ 用户已解封', 'ok');
          const target = users.find(u => u.id === clientId);
          if (target) target.blocked = toBlocked;
          renderUserTable();
        } else {
          toast('操作失败，请重试', 'err');
        }
      });
    });

    // 单独管理弹窗
    view.querySelectorAll('[data-manage-user], [data-edit-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clientId = btn.dataset.manageUser || btn.dataset.editUser;
        openUserDetailModal(clientId);
      });
    });
  }

  /* ================= 打开用户单独管理弹窗 ================= */
  async function openUserDetailModal(clientId) {
    const modalRoot = document.getElementById('user-modal-container');
    modalRoot.innerHTML = `
      <div class="user-modal-backdrop" id="user-modal-backdrop">
        <div class="user-modal-card">
          <div class="user-modal-header">
            <div class="user-modal-title-box">
              <h3>⚙️ 正在加载用户档案…</h3>
            </div>
            <button class="btn-close-modal" id="btn-close-modal-x">✕</button>
          </div>
          <div style="padding:20px;text-align:center;color:var(--muted)">加载中…</div>
        </div>
      </div>`;

    const detailRes = await api(`users/detail?clientId=${encodeURIComponent(clientId)}`).catch(() => null);
    if (!detailRes || !detailRes.ok) {
      toast('获取用户详情失败', 'err');
      modalRoot.innerHTML = '';
      return;
    }

    const { user, persona, generationHistory, behaviorEvents } = detailRes;
    const isCustom = user.isCustomLimit;
    const initialCustomLimit = isCustom ? user.dailyLimit : '';
    const initialBonus = user.bonusQuota || 0;

    // IP 列表 HTML
    const ipsList = Array.isArray(user.ips) && user.ips.length > 0 ? user.ips : (user.lastIp ? [user.lastIp] : []);
    const ipsHtml = ipsList.map(ip => `<span class="user-ip-tag">${esc(ip)}</span>`).join(' ') || '<span style="color:#999;font-size:0.8rem">暂无 IP 记录</span>';

    // 设备列表 HTML
    const devicesList = Array.isArray(user.devices) && user.devices.length > 0 ? user.devices : (user.lastDevice ? [user.lastDevice] : []);
    const devicesHtml = devicesList.map(d => `<span class="user-device-tag">${esc(d)}</span>`).join(' ') || '<span style="color:#999;font-size:0.8rem">暂无设备记录</span>';

    // 标签画像 HTML
    const tagsHtml = (persona?.topTags || []).map(t =>
      `<span style="background:#ffeaa7;border:1px solid #1a1a1a;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:900">#${esc(t.tag)} (${Math.round(t.score * 10) / 10})</span>`
    ).join(' ') || '<span style="color:#999;font-size:0.8rem">暂无偏好标签</span>';

    // 历史日志列表 HTML
    const genItemsHtml = (generationHistory || []).slice(0, 6).map(g => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed #e2dcd5;font-size:0.76rem">
        <span>${esc(fmtTime(g.t))} · <strong style="color:var(--primary)">${esc(g.provider || 'AI')}</strong></span>
        <span class="${g.ok ? 'text-green' : 'text-danger'}" style="font-weight:900">${g.ok ? '✓ 成功' : '✗ 失败'}</span>
      </div>`).join('') || '<p style="color:#999;font-size:0.76rem">暂无生成流水</p>';

    modalRoot.innerHTML = `
      <div class="user-modal-backdrop" id="user-modal-backdrop">
        <div class="user-modal-card">
          <!-- 头部 -->
          <div class="user-modal-header">
            <div class="user-modal-title-box">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <h3>👤 用户档案单独管理</h3>
                <span class="badge" style="background:var(--yellow);border:1.5px solid var(--border-ink);padding:2px 8px;font-size:0.8rem;font-weight:900">
                  ${esc(persona?.personaBadge || '🌱')} ${esc(persona?.personaName || '灵感初探')}
                </span>
                ${user.blocked ? '<span class="chip danger">🚫 已封禁</span>' : '<span class="chip mint">✅ 正常</span>'}
              </div>
              <div style="font-size:0.8rem;color:#555;margin-top:2px">
                Client ID: <code class="mono" style="font-weight:900">${esc(user.id)}</code>
                <button class="btn-copy-id" id="btn-modal-copy-id" title="复制 ID">📋 复制</button>
              </div>
            </div>
            <button class="btn-close-modal" id="btn-close-modal-x">✕</button>
          </div>

          <!-- 1. 额度与配额单独调整 -->
          <div class="user-modal-section">
            <h4>⚡ 额度与配额单独调整</h4>
            <div class="quota-adjust-grid">
              <!-- 每日基础上限 -->
              <div class="quota-adjust-box">
                <label>📅 每日基础额度上限</label>
                <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
                  <label style="font-size:0.78rem;font-weight:normal;display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="radio" name="modal-quota-type" id="quota-type-default" value="default" ${!isCustom ? 'checked' : ''}>
                    <span>跟随全局默认 (当前 <strong>${globalDailyLimit}</strong> 次/天)</span>
                  </label>
                  <label style="font-size:0.78rem;font-weight:normal;display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="radio" name="modal-quota-type" id="quota-type-custom" value="custom" ${isCustom ? 'checked' : ''}>
                    <span>独立专属上限:</span>
                    <input type="number" id="modal-custom-limit-input" min="0" max="1000" placeholder="如 50" value="${initialCustomLimit}" style="width:70px;padding:2px 6px;font-size:0.8rem;border:1.5px solid var(--border-ink);border-radius:4px" ${!isCustom ? 'disabled' : ''}>
                    <span style="font-size:0.75rem">次/天</span>
                  </label>
                </div>
              </div>

              <!-- 额外赠送额度 -->
              <div class="quota-adjust-box">
                <label>🎁 额外赠送额度 (Bonus Quota)</label>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                  <input type="number" id="modal-bonus-quota-input" min="0" max="10000" value="${initialBonus}" style="width:90px;padding:4px 8px;font-size:0.85rem;border:2px solid var(--border-ink);border-radius:4px;font-weight:900">
                  <span style="font-size:0.75rem;color:#666">次 (永久/不随每日重置)</span>
                </div>
                <div class="quota-btn-group">
                  <button type="button" class="quota-quick-btn" data-add-bonus="5">+5次</button>
                  <button type="button" class="quota-quick-btn" data-add-bonus="10">+10次</button>
                  <button type="button" class="quota-quick-btn" data-add-bonus="20">+20次</button>
                  <button type="button" class="quota-quick-btn" data-add-bonus="50">+50次</button>
                  <button type="button" class="quota-quick-btn" data-set-bonus="0" style="color:var(--danger)">清零</button>
                </div>
              </div>

              <!-- 今日已用与重置 -->
              <div class="quota-adjust-box">
                <label>⏳ 今日已用次数管理</label>
                <div style="font-size:0.84rem;margin:4px 0">
                  今日已使用: <strong style="font-family:var(--font-title);font-size:1.1rem;color:var(--primary)" id="modal-used-today-val">${user.dayCount || 0}</strong> 次
                </div>
                <button type="button" class="btn btn-sm btn-lav" id="btn-modal-reset-today" style="margin-top:auto">🔄 立即重置今日已用为 0</button>
              </div>
            </div>

            <!-- 实时配额预览条 -->
            <div class="quota-summary-strip">
              <div>
                <span>当前综合生效上限：</span>
                <strong id="preview-effective-limit">${user.effectiveLimit || globalDailyLimit} 次</strong>
                <span style="color:#666;font-size:0.75rem">（基础 <span id="preview-base-limit">${user.dailyLimit || globalDailyLimit}</span> + 赠送 <span id="preview-bonus-limit">${user.bonusQuota || 0}</span>）</span>
              </div>
              <div>
                <span>今日剩余可用：</span>
                <strong style="color:var(--primary);font-size:1rem" id="preview-remaining">${user.remainingToday != null ? user.remainingToday : 0} 次</strong>
              </div>
            </div>
          </div>

          <!-- 2. 网络 IP 轨迹与终端设备详情 -->
          <div class="user-modal-section">
            <h4>🌐 网络 IP 与设备指纹轨迹</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px">
              <div>
                <strong style="font-size:0.8rem;color:#444">最近登录与历史访问 IP：</strong>
                <div class="ip-list-wrap" style="margin-top:6px">
                  ${ipsHtml}
                </div>
              </div>
              <div>
                <strong style="font-size:0.8rem;color:#444">访问设备终端：</strong>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                  ${devicesHtml}
                </div>
              </div>
            </div>

            <div style="margin-top:8px">
              <strong style="font-size:0.76rem;color:#666">最近完整 User-Agent 字符串：</strong>
              <div class="device-raw-ua" style="margin-top:4px">${esc(user.lastUserAgent || '无记录')}</div>
            </div>

            <div style="display:flex;gap:16px;font-size:0.76rem;color:#666;margin-top:4px">
              <span>首次访问建档：${esc(fmtTime(user.first))}</span>
              <span>最近活跃时间：${esc(fmtTime(user.last))}</span>
              <span>累计生成次数：${user.total || 0} 次</span>
            </div>
          </div>

          <!-- 3. 用户画像与行为偏好 -->
          <div class="user-modal-section">
            <h4>🎯 用户自适应学习画像</h4>
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div>
                <strong>画像客群：</strong>
                <span class="user-persona-tag" style="font-size:0.8rem">${esc(persona?.personaBadge || '🌱')} ${esc(persona?.personaName || '灵感探索')}</span>
                <span style="font-size:0.78rem;color:#666;margin-left:6px">置信度: ${persona?.confidence || 0}%</span>
              </div>
              <span style="font-size:0.76rem;color:#666">行为事件记录: ${behaviorEvents?.length || 0} 条</span>
            </div>
            <p style="font-size:0.78rem;color:#555;margin:2px 0">${esc(persona?.personaDesc || '基于用户全链路行为自动归纳')}</p>
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px">
              <strong style="font-size:0.76rem;color:#444">偏好标签：</strong>
              ${tagsHtml}
            </div>

            <h5 style="margin-top:8px;margin-bottom:4px;font-size:0.8rem;color:#444">⚡ 最近生成记录流水</h5>
            <div style="background:#faf8f5;border:1px solid #e2dcd5;border-radius:4px;padding:6px 10px">
              ${genItemsHtml}
            </div>
          </div>

          <!-- 4. 站长专属备注与账号安全状态 -->
          <div class="user-modal-section">
            <h4>📝 站长专属备注与访问权限</h4>
            <div class="field" style="margin:0">
              <label for="modal-user-note" style="font-size:0.8rem">用户标签与备注（仅管理员可见）</label>
              <input type="text" id="modal-user-note" placeholder="例如：VIP博主、高频测试员、需增加额度等..." value="${esc(user.note || '')}" maxlength="100" style="padding:8px 12px;border:2px solid var(--border-ink);border-radius:var(--r-xs);background:#fff">
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;background:#fef2f2;border:1.5px solid #ef4444;border-radius:var(--r-xs);padding:10px;margin-top:8px">
              <div>
                <strong style="color:#b91c1c;font-size:0.86rem">账号访问状态：${user.blocked ? '已封禁 (无法试戴生成)' : '正常状态'}</strong>
                <p style="font-size:0.74rem;color:#7f1d1d;margin:2px 0 0 0">封禁后该用户在前端尝试生成时将直接被拦截，解封后立即恢复。</p>
              </div>
              <button type="button" class="btn btn-sm ${user.blocked ? 'btn-mint' : 'btn-danger'}" id="btn-modal-toggle-block">
                ${user.blocked ? '✅ 解除封禁' : '🚫 封禁该用户'}
              </button>
            </div>
          </div>

          <!-- 底部操作按钮 -->
          <div class="user-modal-footer">
            <button type="button" class="btn btn-lav" id="btn-modal-cancel">取消</button>
            <button type="button" class="btn btn-primary" id="btn-modal-save">💾 保存并应用该用户配置</button>
          </div>
        </div>
      </div>`;

    // 模态弹窗内部动态交互逻辑
    let currentBlocked = !!user.blocked;
    const rdoDefault = document.getElementById('quota-type-default');
    const rdoCustom = document.getElementById('quota-type-custom');
    const customInput = document.getElementById('modal-custom-limit-input');
    const bonusInput = document.getElementById('modal-bonus-quota-input');
    const usedValEl = document.getElementById('modal-used-today-val');

    const previewEffective = document.getElementById('preview-effective-limit');
    const previewBase = document.getElementById('preview-base-limit');
    const previewBonus = document.getElementById('preview-bonus-limit');
    const previewRem = document.getElementById('preview-remaining');

    function updatePreview() {
      const isCust = rdoCustom.checked;
      customInput.disabled = !isCust;
      const base = isCust ? (parseInt(customInput.value, 10) || 0) : globalDailyLimit;
      const bonus = parseInt(bonusInput.value, 10) || 0;
      const eff = Math.max(0, base + bonus);
      const used = parseInt(usedValEl.textContent, 10) || 0;
      const rem = Math.max(0, eff - used);

      previewBase.textContent = `${base}次/天`;
      previewBonus.textContent = `+${bonus}`;
      previewEffective.textContent = `${eff} 次`;
      previewRem.textContent = `${rem} 次`;
    }

    rdoDefault.addEventListener('change', updatePreview);
    rdoCustom.addEventListener('change', () => {
      if (!customInput.value) customInput.value = globalDailyLimit;
      updatePreview();
      customInput.focus();
    });
    customInput.addEventListener('input', updatePreview);
    bonusInput.addEventListener('input', updatePreview);

    // 快捷增减额外额度
    modalRoot.querySelectorAll('[data-add-bonus]').forEach(btn => {
      btn.addEventListener('click', () => {
        const add = parseInt(btn.dataset.addBonus, 10) || 0;
        const cur = parseInt(bonusInput.value, 10) || 0;
        bonusInput.value = Math.max(0, cur + add);
        updatePreview();
      });
    });

    modalRoot.querySelectorAll('[data-set-bonus]').forEach(btn => {
      btn.addEventListener('click', () => {
        bonusInput.value = btn.dataset.setBonus;
        updatePreview();
      });
    });

    // 复制 ID
    document.getElementById('btn-modal-copy-id').addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(user.id).then(() => toast('已复制 ID: ' + user.id, 'ok')).catch(() => {});
      } else {
        prompt('请复制 Client ID:', user.id);
      }
    });

    // 重置今日已用
    document.getElementById('btn-modal-reset-today').addEventListener('click', async () => {
      const res = await api('users/reset-today', { method: 'POST', body: { clientId } }).catch(() => null);
      if (res && res.ok) {
        usedValEl.textContent = '0';
        updatePreview();
        toast('✅ 今日使用量已重置为 0', 'ok');
      } else {
        toast('重置失败', 'err');
      }
    });

    // 封禁切换
    const toggleBlockBtn = document.getElementById('btn-modal-toggle-block');
    toggleBlockBtn.addEventListener('click', () => {
      currentBlocked = !currentBlocked;
      toggleBlockBtn.textContent = currentBlocked ? '✅ 解除封禁' : '🚫 封禁该用户';
      toggleBlockBtn.className = `btn btn-sm ${currentBlocked ? 'btn-mint' : 'btn-danger'}`;
      toast(currentBlocked ? '已标记为封禁（保存后生效）' : '已解除封禁标记（保存后生效）');
    });

    // 关闭弹窗
    function closeModal() {
      modalRoot.innerHTML = '';
    }

    document.getElementById('btn-close-modal-x').addEventListener('click', closeModal);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('user-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'user-modal-backdrop') closeModal();
    });

    // 保存提交
    document.getElementById('btn-modal-save').addEventListener('click', async () => {
      const saveBtn = document.getElementById('btn-modal-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '正在保存…';

      const customLimitVal = rdoCustom.checked ? (parseInt(customInput.value, 10) || 0) : null;
      const bonusQuotaVal = parseInt(bonusInput.value, 10) || 0;
      const noteVal = document.getElementById('modal-user-note').value.trim();

      const body = {
        clientId,
        customDailyLimit: customLimitVal,
        bonusQuota: bonusQuotaVal,
        note: noteVal,
        blocked: currentBlocked
      };

      const res = await api('users/update', { method: 'POST', body }).catch(e => ({ ok: false, message: e.message }));
      if (res && res.ok) {
        toast('✅ 用户单独配置已保存并即时生效！', 'ok');
        closeModal();
        viewUsers(view);
      } else {
        toast(res.message || '保存配置失败', 'err');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 保存并应用该用户配置';
      }
    });
  }
}

/* ================= 生成日志 ================= */
async function viewEvents(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const j = await api('events').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const items = j.events.map(e => `
    <div class="event-item">
      <div class="event-main">
        <span class="t">${esc(fmtTime(e.t))}</span>
        <span class="status-chip ${e.ok ? 'ok' : 'fail'}">${e.ok ? '✓ 成功' : '✗ 失败'}</span>
        <span class="prov">${esc(e.provider || '-')}</span>
      </div>
      <div class="event-sub">
        <span class="mono">${esc(shortId(e.clientId))}</span>
        ${e.ms ? `<span class="num">${Math.round(e.ms / 100) / 10}s</span>` : ''}
        ${e.err ? `<span class="err" title="${esc(e.err)}">${esc(e.err)}</span>` : ''}
      </div>
    </div>`).join('') || '<p class="desc">还没有生成记录</p>';

  view.innerHTML = `
    <div class="card">
      <h2>生成日志</h2>
      <p class="desc">最近 ${j.events.length} 条（服务器只保留最近 200 条，不含任何照片内容）</p>
      ${items}
    </div>`;
}

/* ================= 用户画像与推荐算法 ================= */
async function viewPersonas(view) {
  view.innerHTML = '<div class="card"><p class="desc">正在汇聚全站用户学习数据与画像矩阵…</p></div>';
  const [data, settingsRes] = await Promise.all([
    api('personas').catch(() => null),
    api('recommendation-settings').catch(() => null)
  ]);

  if (!data || !data.ok) {
    view.innerHTML = '<div class="card"><p class="desc">用户画像数据加载失败，请刷新重试</p></div>';
    return;
  }

  const { overview, clusterDistribution, topAffinityTags, categoryBreakdown, userList, presets } = data;
  let currentSettings = (settingsRes && settingsRes.ok && settingsRes.settings) ? settingsRes.settings : (presets?.balanced || {});

  // 1. 顶部画像统计指标
  const topMetricCards = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">已建档学习用户</div>
        <div class="val">${overview.totalLearnedUsers || 0} <span class="unit">人</span></div>
      </div>
      <div class="stat-card">
        <div class="label">平均画像置信度</div>
        <div class="val">${Math.round(overview.avgConfidence || 0)} <span class="unit">%</span></div>
      </div>
      <div class="stat-card">
        <div class="label">算法策略模式</div>
        <div class="val" style="font-size:1.3rem;line-height:1.2">${currentSettings.preset === 'hyper_personal' ? '深度个性化' : currentSettings.preset === 'trending' ? '爆款导向' : currentSettings.preset === 'discover' ? '探索发现' : '均衡推荐'}</div>
      </div>
      <div class="stat-card">
        <div class="label">全站最热画像客群</div>
        <div class="val" style="font-size:1.15rem;line-height:1.2;color:var(--primary)">${esc(overview.dominantPersona || '灵感初探')}</div>
      </div>
    </div>`;

  // 2. 画像人群分布
  const personaCardsHtml = clusterDistribution.map(p => `
    <div class="persona-item-card">
      <div class="card-head">
        <span class="badge">${esc(p.badge)}</span>
        <span class="count">${p.userCount} <span style="font-size:0.75rem;color:#777">(${p.percentage}%)</span></span>
      </div>
      <strong style="font-size:0.92rem">${esc(p.name)}</strong>
      <p class="desc">${esc(p.description)}</p>
      <div style="font-size:0.75rem;color:#666;margin-top:auto">
        核心标签：${p.coreTags.map(t => `<span style="background:#f4efe6;padding:1px 5px;border-radius:3px;margin-right:4px;border:1px solid #ddd">${esc(t)}</span>`).join('')}
      </div>
    </div>`).join('');

  // 3. 全站标签亲和度排行
  const maxTagScore = topAffinityTags.length > 0 ? (topAffinityTags[0].score || 1) : 1;
  const tagBarsHtml = topAffinityTags.slice(0, 10).map(t => {
    const pct = Math.min(100, Math.round((t.score / maxTagScore) * 100));
    return `
      <div class="affinity-bar-row">
        <span class="tag-name">#${esc(t.tag)}</span>
        <div class="bar-wrap">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="score-val">${Math.round(t.score)}</span>
      </div>`;
  }).join('') || '<p style="color:var(--muted);font-size:0.85rem">暂无足够行为数据</p>';

  // 4. 用户下拉选项
  const userOpts = (userList || []).map(u => `
    <option value="${esc(u.clientId)}">
      ${esc(u.shortId)} · ${esc(u.personaBadge || '🌱')} ${esc(u.personaName || '探索用户')} (${u.eventCount}次交互)
    </option>`).join('');

  view.innerHTML = `
    <div class="card">
      <h2>🎯 全站用户画像与偏好大盘</h2>
      <p class="desc">基于用户浏览、搜索、试戴生成、对比及保存等全链路交互，由衰减学习模型自动聚类演算。</p>
      ${topMetricCards}

      <h3 style="margin-top:20px;font-size:1.05rem">👥 画像客群分布</h3>
      <div class="persona-grid">
        ${personaCardsHtml}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-top:20px">
        <div style="background:#fff;border:2.5px solid var(--border-ink);padding:14px;border-radius:var(--r-m);box-shadow:var(--shadow-comic-sm)">
          <strong style="font-size:0.95rem">🔥 全站偏好标签 Top 10 热力指数</strong>
          <div class="affinity-bar-list">${tagBarsHtml}</div>
        </div>
        <div style="background:#fff;border:2.5px solid var(--border-ink);padding:14px;border-radius:var(--r-m);box-shadow:var(--shadow-comic-sm)">
          <strong style="font-size:0.95rem">📊 业务品类偏好热度</strong>
          <div class="affinity-bar-list" style="margin-top:16px">
            <div class="affinity-bar-row">
              <span class="tag-name">💅 美甲款式</span>
              <div class="bar-wrap"><div class="bar-fill" style="width:${categoryBreakdown.nail?.percentage || 33}%"></div></div>
              <span class="score-val">${categoryBreakdown.nail?.percentage || 33}%</span>
            </div>
            <div class="affinity-bar-row">
              <span class="tag-name">🎨 潮流发色</span>
              <div class="bar-wrap"><div class="bar-fill" style="width:${categoryBreakdown.hairColor?.percentage || 33}%;background:var(--lavender)"></div></div>
              <span class="score-val">${categoryBreakdown.hairColor?.percentage || 33}%</span>
            </div>
            <div class="affinity-bar-row">
              <span class="tag-name">💇 流行发型</span>
              <div class="bar-wrap"><div class="bar-fill" style="width:${categoryBreakdown.hairStyle?.percentage || 34}%;background:var(--mint)"></div></div>
              <span class="score-val">${categoryBreakdown.hairStyle?.percentage || 34}%</span>
            </div>
          </div>
          <p style="font-size:0.75rem;color:#666;margin-top:14px">系统将根据品类偏好在首页与推荐流中自动调整加权比重。</p>
        </div>
      </div>
    </div>

    <!-- 推荐算法调优工作台 -->
    <div class="card" id="algo-tuner-card">
      <h2>⚙️ 多因子推荐算法调优工作台</h2>
      <p class="desc">调整推荐评分公式中各因子权重，保存后全站推荐流与首页个性化分区将即时生效。</p>

      <div class="algo-preset-group">
        <button type="button" class="algo-preset-chip ${currentSettings.preset === 'balanced' ? 'active' : ''}" data-preset="balanced">⚖️ 均衡智能推荐 (默认)</button>
        <button type="button" class="algo-preset-chip ${currentSettings.preset === 'hyper_personal' ? 'active' : ''}" data-preset="hyper_personal">🎯 深度个性化模式 (高粘性)</button>
        <button type="button" class="algo-preset-chip ${currentSettings.preset === 'trending' ? 'active' : ''}" data-preset="trending">🔥 流行爆款导向 (促试戴)</button>
        <button type="button" class="algo-preset-chip ${currentSettings.preset === 'discover' ? 'active' : ''}" data-preset="discover">🧭 灵感探索发现 (推新品)</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px">
        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>🎯 个性化偏好权重 (Personal)</strong>
            <span class="val" id="val-personal">${(currentSettings.personalWeight ?? 0.45).toFixed(2)}</span>
          </div>
          <input type="range" id="w-personal" min="0" max="1" step="0.05" value="${currentSettings.personalWeight ?? 0.45}">
          <span class="slider-desc">根据用户历史浏览/试戴标签与色系的亲和度加权。</span>
        </div>

        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>🔥 热门爆款权重 (Hotness)</strong>
            <span class="val" id="val-hotness">${(currentSettings.hotnessWeight ?? 0.25).toFixed(2)}</span>
          </div>
          <input type="range" id="w-hotness" min="0" max="1" step="0.05" value="${currentSettings.hotnessWeight ?? 0.25}">
          <span class="slider-desc">优先推荐全站试戴次数最多、满意度最高的精品款式。</span>
        </div>

        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>✨ 新鲜度轮换权重 (Freshness)</strong>
            <span class="val" id="val-freshness">${(currentSettings.freshnessWeight ?? 0.15).toFixed(2)}</span>
          </div>
          <input type="range" id="w-freshness" min="0" max="1" step="0.05" value="${currentSettings.freshnessWeight ?? 0.15}">
          <span class="slider-desc">为用户每次刷新引入微扰动与轮换，避免推荐池固化。</span>
        </div>

        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>🧭 多样性探索权重 (Explore)</strong>
            <span class="val" id="val-explore">${(currentSettings.exploreWeight ?? 0.15).toFixed(2)}</span>
          </div>
          <input type="range" id="w-explore" min="0" max="1" step="0.05" value="${currentSettings.exploreWeight ?? 0.15}">
          <span class="slider-desc">主动试探用户未接触过的潮流分支（如冷门但高级的配色）。</span>
        </div>

        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>⏳ 行为半衰期 (Decay Half-Life)</strong>
            <span class="val" id="val-halflife">${currentSettings.decayHalfLifeDays ?? 7} 天</span>
          </div>
          <input type="range" id="w-halflife" min="1" max="30" step="1" value="${currentSettings.decayHalfLifeDays ?? 7}">
          <span class="slider-desc">历史交互的衰减速度：天数越小，越看重近期的即时兴趣。</span>
        </div>

        <div class="weight-slider-row">
          <div class="slider-head">
            <strong>🎀 品类偏置加权 (Category Boost)</strong>
            <span class="val" id="val-catboost">${(currentSettings.categoryBoost ?? 0.20).toFixed(2)}</span>
          </div>
          <input type="range" id="w-catboost" min="0" max="0.5" step="0.05" value="${currentSettings.categoryBoost ?? 0.20}">
          <span class="slider-desc">用户若高频试戴美甲，美甲款式在通用推荐流中自动提权。</span>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-save-algo">💾 保存并应用推荐算法设置</button>
        <button class="btn btn-lav" id="btn-reset-algo">🔄 恢复默认均衡权重</button>
      </div>
    </div>

    <!-- 用户画像透视与算法实时模拟器 -->
    <div class="card">
      <h2>🔍 单用户画像透视与算法实时模拟器</h2>
      <p class="desc">选择具体用户，即时查看其深度学习画像模型，并实时演练上方算法权重对该用户推荐结果的排序影响。</p>

      <div class="field" style="max-width:480px">
        <label for="sim-user-select">选择目标测试用户</label>
        <select id="sim-user-select">
          ${userOpts || '<option value="">暂无行为记录用户（将使用冷启动默认画像模拟）</option>'}
        </select>
      </div>

      <div id="sim-user-detail-box" style="margin-top:14px"></div>
    </div>`;

  // 绑定预设与滑块联动
  const presetChips = view.querySelectorAll('.algo-preset-chip');
  const wPersonal = document.getElementById('w-personal');
  const wHotness = document.getElementById('w-hotness');
  const wFreshness = document.getElementById('w-freshness');
  const wExplore = document.getElementById('w-explore');
  const wHalfLife = document.getElementById('w-halflife');
  const wCatBoost = document.getElementById('w-catboost');

  const valPersonal = document.getElementById('val-personal');
  const valHotness = document.getElementById('val-hotness');
  const valFreshness = document.getElementById('val-freshness');
  const valExplore = document.getElementById('val-explore');
  const valHalfLife = document.getElementById('val-halflife');
  const valCatBoost = document.getElementById('val-catboost');

  function syncSliderLabels() {
    valPersonal.textContent = Number(wPersonal.value).toFixed(2);
    valHotness.textContent = Number(wHotness.value).toFixed(2);
    valFreshness.textContent = Number(wFreshness.value).toFixed(2);
    valExplore.textContent = Number(wExplore.value).toFixed(2);
    valHalfLife.textContent = `${wHalfLife.value} 天`;
    valCatBoost.textContent = Number(wCatBoost.value).toFixed(2);
  }

  [wPersonal, wHotness, wFreshness, wExplore, wHalfLife, wCatBoost].forEach(input => {
    input.addEventListener('input', () => {
      syncSliderLabels();
      presetChips.forEach(c => c.classList.remove('active'));
      simulateForSelectedUser();
    });
  });

  presetChips.forEach(btn => {
    btn.addEventListener('click', () => {
      const pKey = btn.dataset.preset;
      const p = presets && presets[pKey];
      if (!p) return;
      presetChips.forEach(c => c.classList.toggle('active', c.dataset.preset === pKey));
      wPersonal.value = p.personalWeight;
      wHotness.value = p.hotnessWeight;
      wFreshness.value = p.freshnessWeight;
      wExplore.value = p.exploreWeight;
      wHalfLife.value = p.decayHalfLifeDays;
      wCatBoost.value = p.categoryBoost;
      syncSliderLabels();
      simulateForSelectedUser();
    });
  });

  // 保存算法设置
  document.getElementById('btn-save-algo').addEventListener('click', async () => {
    const activePreset = Array.from(presetChips).find(c => c.classList.contains('active'))?.dataset.preset || 'custom';
    const body = {
      personalWeight: Number(wPersonal.value),
      hotnessWeight: Number(wHotness.value),
      freshnessWeight: Number(wFreshness.value),
      exploreWeight: Number(wExplore.value),
      decayHalfLifeDays: Number(wHalfLife.value),
      categoryBoost: Number(wCatBoost.value),
      preset: activePreset
    };
    const res = await api('recommendation-settings', { method: 'POST', body }).catch(e => ({ ok: false, message: e.message }));
    if (res && res.ok) {
      toast('✅ 推荐算法参数已更新，全站即时生效！', 'ok');
    } else {
      toast(res.message || '保存算法失败', 'err');
    }
  });

  document.getElementById('btn-reset-algo').addEventListener('click', () => {
    const btn = Array.from(presetChips).find(c => c.dataset.preset === 'balanced');
    if (btn) btn.click();
  });

  // 单用户透视与推荐模拟
  const simSelect = document.getElementById('sim-user-select');
  const simDetailBox = document.getElementById('sim-user-detail-box');

  async function simulateForSelectedUser() {
    const clientId = simSelect.value;
    if (!clientId && (!userList || userList.length === 0)) {
      simDetailBox.innerHTML = '<p class="desc" style="color:var(--muted)">当前没有用户行为事件，等待用户在前端交互后即可在此透视。</p>';
      return;
    }

    const weights = {
      personalWeight: Number(wPersonal.value),
      hotnessWeight: Number(wHotness.value),
      freshnessWeight: Number(wFreshness.value),
      exploreWeight: Number(wExplore.value),
      categoryBoost: Number(wCatBoost.value)
    };

    simDetailBox.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">正在模拟推荐演算…</p>';

    const [detailRes, simRes] = await Promise.all([
      clientId ? api(`personas/detail?clientId=${encodeURIComponent(clientId)}`).catch(() => null) : null,
      api('simulate-recommendation', { method: 'POST', body: { clientId, weights, limit: 8 } }).catch(() => null)
    ]);

    const persona = detailRes?.persona || {
      personaName: '灵感探索新手',
      personaBadge: '🌱 灵感初探',
      confidence: 0,
      personaDesc: '冷启动状态，将依托热门与探索因子进行智能冷启动推荐',
      topTags: []
    };

    const recs = simRes?.recommendations || [];

    const userTagsHtml = (persona.topTags || []).map(t =>
      `<span style="background:#ffeaa7;border:1.5px solid var(--border-ink);padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:900;margin-right:4px">#${esc(t.tag)} (${Math.round(t.score * 10) / 10})</span>`
    ).join('') || '<span style="color:#888;font-size:0.8rem">暂无标签积累</span>';

    const simCardsHtml = recs.map((r, idx) => `
      <div class="sim-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="rank-badge">Top ${idx + 1}</span>
          <strong style="color:var(--primary);font-family:var(--font-title)">总分: ${r.score}</strong>
        </div>
        <strong>${esc(r.item?.title || '款式')}</strong>
        <div style="font-size:0.74rem;color:#666">
          品类: ${r.item?.cat === 'nail' ? '💅 美甲' : r.item?.cat === 'hairColor' ? '🎨 发色' : '💇 发型'}
        </div>
        <div class="score-tags">
          <span class="score-pill" title="个性化得分">🎯 个性 ${r.breakdown.personalScore}</span>
          <span class="score-pill" title="热门得分">🔥 热门 ${r.breakdown.hotnessScore}</span>
          <span class="score-pill" title="新鲜轮换得分">✨ 新鲜 ${r.breakdown.freshnessScore}</span>
          <span class="score-pill" title="探索得分">🧭 探索 ${r.breakdown.exploreScore}</span>
        </div>
      </div>`).join('');

    simDetailBox.innerHTML = `
      <div style="background:#fff;border:2.5px solid var(--border-ink);padding:14px;border-radius:var(--r-m);box-shadow:var(--shadow-comic-sm)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <span class="badge" style="font-size:0.95rem;background:var(--yellow);border:2px solid var(--border-ink);padding:2px 8px;border-radius:var(--r-xs);font-weight:900">${esc(persona.personaBadge)} ${esc(persona.personaName)}</span>
            <span style="font-size:0.85rem;margin-left:8px;font-weight:900">置信度: ${persona.confidence}%</span>
          </div>
          <span style="font-size:0.75rem;color:#666">用户 ID: <code class="mono">${esc(clientId || 'cold-start')}</code></span>
        </div>
        <p style="font-size:0.82rem;color:#4a4a4a;margin-top:8px">${esc(persona.personaDesc)}</p>
        <div style="margin-top:8px;display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <strong style="font-size:0.8rem">用户亲和标签：</strong>
          ${userTagsHtml}
        </div>
      </div>

      <h4 style="margin-top:16px;font-size:0.95rem">🎯 实时算法模拟预测结果 (Top 8 排序与得分拆解)</h4>
      <div class="sim-grid">
        ${simCardsHtml || '<p style="color:var(--muted);font-size:0.85rem">无推荐结果</p>'}
      </div>`;
  }

  simSelect.addEventListener('change', simulateForSelectedUser);
  simulateForSelectedUser();
}

/* ================= 站点设置 ================= */
async function viewSettings(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const j = await api('overview').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }
  const s = j.settings;
  const engineOpts = ['<option value="auto">自动（已配置引擎依次降级）</option>']
    .concat(j.engines.filter(e => e.ready).map(e => `<option value="${e.id}" ${s.preferred === e.id ? 'selected' : ''}>${esc(e.label)}</option>`))
    .join('');

  view.innerHTML = `
    <div class="card">
      <h2>额度与引擎</h2>
      <p class="desc">修改即时生效，无需重启服务</p>
      <div class="field">
        <label for="s-limit">每人每日生成上限</label>
        <input id="s-limit" type="number" min="1" max="500" value="${s.dailyLimit}" style="max-width:160px">
        <p class="hint">按匿名用户计，建议 10–30 次：默认免费引擎本身有限流，太高的额度意义不大。</p>
      </div>
      <div class="field">
        <label for="s-preferred">首选引擎</label>
        <select id="s-preferred" style="max-width:320px">${engineOpts}</select>
        <p class="hint">首选失败时自动降级到其余已配置引擎。</p>
      </div>
      <div class="field">
        <label for="s-notice">用户端公告（可选）</label>
        <textarea id="s-notice" maxlength="140" placeholder="展示在「我的」页面，例如：周末免额度翻倍 🍓">${esc(s.announcement || '')}</textarea>
      </div>
      <button class="btn btn-primary" id="save-settings">保存设置</button>
    </div>
    <div class="card">
      <h2>修改管理口令</h2>
      <p class="desc">初始口令为 admin123，首次登录后请立即修改</p>
      <div class="field">
        <label for="pw-cur">当前口令</label>
        <input id="pw-cur" type="password" autocomplete="current-password">
      </div>
      <div class="field">
        <label for="pw-new">新口令（至少 6 位）</label>
        <input id="pw-new" type="password" autocomplete="new-password">
      </div>
      <div class="field">
        <label for="pw-new2">再输一遍新口令</label>
        <input id="pw-new2" type="password" autocomplete="new-password">
      </div>
      <button class="btn btn-lav" id="save-pw">修改口令</button>
    </div>`;

  document.getElementById('save-settings').addEventListener('click', async () => {
    const j2 = await api('settings', {
      method: 'POST',
      body: {
        dailyLimit: Number(document.getElementById('s-limit').value),
        preferred: document.getElementById('s-preferred').value,
        announcement: document.getElementById('s-notice').value.trim()
      }
    }).catch(e => ({ ok: false, message: e.message }));
    toast(j2.ok ? '已保存，即时生效' : (j2.message || '保存失败'), j2.ok ? '' : 'err');
  });

  document.getElementById('save-pw').addEventListener('click', async () => {
    const cur = document.getElementById('pw-cur').value;
    const n1 = document.getElementById('pw-new').value;
    const n2 = document.getElementById('pw-new2').value;
    if (n1 !== n2) return toast('两次输入的新口令不一致', 'err');
    const j2 = await api('password', { method: 'POST', body: { current: cur, next: n1 } }).catch(e => ({ ok: false, message: e.message }));
    if (j2.ok) { toast('口令已更新，请重新登录'); setToken(''); setTimeout(renderLogin, 600); }
    else toast(j2.message || '修改失败', 'err');
  });
}

/* ================= 研究数据（用户上传图 / 生成结果 / 提示词） ================= */
const RESEARCH_CAT_LABEL = { nail: '美甲', hairColor: '发色', hairStyle: '发型' };

async function viewResearch(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';

  let rows = [];
  let filters = { clientId: '', cat: '', provider: '', ok: '' };

  async function load() {
    const q = new URLSearchParams();
    if (filters.clientId) q.set('clientId', filters.clientId);
    if (filters.cat) q.set('cat', filters.cat);
    if (filters.provider) q.set('provider', filters.provider);
    if (filters.ok) q.set('ok', filters.ok);
    const j = await api('research?' + q.toString()).catch(() => null);
    return j && j.ok ? (j.research || []) : null;
  }

  function promptHtml(r) {
    const prompt = r.prompt || '';
    const long = prompt.length > 60;
    return `
      <div class="prompt ${long ? 'has-more' : ''}" data-prompt-full="${esc(prompt)}">
        <span class="prompt-text">💬 ${esc(long ? prompt.slice(0, 60) + '…' : prompt) || '（无提示词）'}</span>
        ${long ? '<button class="prompt-toggle" type="button">展开</button>' : ''}
      </div>`;
  }

  function rowHtml(r) {
    const catLabel = RESEARCH_CAT_LABEL[r.cat] || r.cat || '-';
    return `
      <div class="research-row" data-id="${esc(r.id)}">
        <div class="research-imgs">
          <div class="research-thumb" data-kind="in" data-id="${esc(r.id)}" title="用户上传图（点击看大图）">
            ${r.hasIn ? '<img loading="lazy" alt="原图"><span class="thumb-badge">原图</span>' : '<span class="no-img">无图</span>'}
          </div>
          <div class="research-thumb" data-kind="out" data-id="${esc(r.id)}" title="生成结果（点击看大图）">
            ${r.hasOut ? '<img loading="lazy" alt="结果"><span class="thumb-badge">结果</span>' : '<span class="no-img">无图</span>'}
          </div>
        </div>
        <div class="research-meta">
          <div class="row-top">
            <span class="t">${esc(fmtTime(r.t))}</span>
            <span class="status-chip ${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓ 成功' : '✗ 失败'}</span>
            <span class="chip plain">${esc(catLabel)}</span>
            <span class="prov">${esc(r.provider || '-')}</span>
            ${r.ms ? `<span class="num">${Math.round(r.ms / 100) / 10}s</span>` : ''}
          </div>
          <div class="row-mid"><span class="mono">ID: ${esc(shortId(r.clientId))}</span></div>
          ${promptHtml(r)}
          ${r.err ? `<div class="err" title="${esc(r.err)}">${esc(r.err)}</div>` : ''}
          <div class="row-actions">
            <a class="btn btn-sm btn-ghost" data-dl="${esc(r.id)}" data-kind="in" ${r.hasIn ? '' : 'disabled'}>存原图</a>
            <a class="btn btn-sm btn-ghost" data-dl="${esc(r.id)}" data-kind="out" ${r.hasOut ? '' : 'disabled'}>存结果</a>
          </div>
        </div>
      </div>`;
  }

  function showLightbox(src, title) {
    const wrap = document.createElement('div');
    wrap.className = 'research-lightbox';
    wrap.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-card">
        <div class="lb-head"><strong>${esc(title)}</strong><button class="lb-close" type="button">✕</button></div>
        <img src="${src}" alt="${esc(title)}">
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.lb-close').addEventListener('click', close);
    wrap.querySelector('.lb-backdrop').addEventListener('click', close);
  }

  function bind() {
    view.querySelector('#rf-apply').addEventListener('click', () => {
      filters.clientId = view.querySelector('#rf-client').value.trim();
      filters.cat = view.querySelector('#rf-cat').value;
      filters.provider = view.querySelector('#rf-provider').value.trim();
      filters.ok = view.querySelector('#rf-ok').value;
      viewResearch(view);
    });
    view.querySelector('#rf-clear').addEventListener('click', async () => {
      if (!confirm('确定清空全部研究数据（含图片）？此操作不可恢复。')) return;
      const j = await api('research/clear', { method: 'POST' }).catch(() => null);
      toast(j && j.ok ? `已清空 ${j.removed || 0} 条` : '清空失败', j && j.ok ? '' : 'err');
      viewResearch(view);
    });
    view.querySelectorAll('.prompt-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const box = btn.closest('.prompt');
        const txt = box.querySelector('.prompt-text');
        const full = box.dataset.promptFull || '';
        const isShort = (txt.textContent || '').length <= 63;
        txt.textContent = isShort ? full : (full.slice(0, 60) + '…');
        btn.textContent = isShort ? '收起' : '展开';
      });
    });
    view.querySelectorAll('[data-dl]').forEach(a => a.addEventListener('click', async e => {
      e.preventDefault();
      if (a.hasAttribute('disabled')) return;
      const { dl: id, kind } = a.dataset;
      const j = await api(`research/${id}/${kind}`).catch(() => null);
      if (!j || !j.ok || !j.data) { toast('图片获取失败', 'err'); return; }
      const link = document.createElement('a');
      link.href = j.data;
      link.download = `${kind === 'in' ? 'input' : 'output'}-${id}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }));
    view.querySelectorAll('.research-thumb[data-id]').forEach(el => {
      el.addEventListener('click', async () => {
        const { id, kind } = el.dataset;
        const j = await api(`research/${id}/${kind}`).catch(() => null);
        if (!j || !j.ok || !j.data) { toast('图片获取失败', 'err'); return; }
        showLightbox(j.data, kind === 'in' ? '用户上传图' : '生成结果');
      });
    });
  }

  /* 缩略图惰性加载（IntersectionObserver），降低一次拉太多大图的开销 */
  function lazyThumbs() {
    const imgs = [...view.querySelectorAll('.research-thumb img')];
    const load = el => {
      if (el.dataset.loaded) return;
      el.dataset.loaded = '1';
      const row = el.closest('.research-thumb');
      const { id, kind } = row.dataset;
      api(`research/${id}/${kind}`)
        .then(j => { if (j && j.ok && j.data) el.src = j.data; })
        .catch(() => {});
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) { load(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: '300px' });
      imgs.forEach(img => io.observe(img));
    } else {
      imgs.forEach(load);
    }
  }

  rows = await load();
  if (!rows) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const listHtml = rows.length
    ? rows.map(rowHtml).join('')
    : '<p class="desc">还没有研究数据——用户每次生成会自动记录上传图、结果与提示词。</p>';

  view.innerHTML = `
    <div class="card">
      <h2>🔬 研究数据</h2>
      <p class="desc">自动记录每次生成的用户上传图、AI 结果与提示词（保留最近 ${rows.length} 条，上限 100），用于算法研究。</p>
      <div class="research-filters">
        <input id="rf-client" placeholder="用户 ID" value="${esc(filters.clientId)}">
        <select id="rf-cat">
          <option value="">全部分类</option>
          <option value="nail" ${filters.cat === 'nail' ? 'selected' : ''}>美甲</option>
          <option value="hairColor" ${filters.cat === 'hairColor' ? 'selected' : ''}>发色</option>
          <option value="hairStyle" ${filters.cat === 'hairStyle' ? 'selected' : ''}>发型</option>
        </select>
        <input id="rf-provider" placeholder="引擎" value="${esc(filters.provider)}">
        <select id="rf-ok">
          <option value="">全部状态</option>
          <option value="1" ${filters.ok === '1' ? 'selected' : ''}>成功</option>
          <option value="0" ${filters.ok === '0' ? 'selected' : ''}>失败</option>
        </select>
        <button class="btn btn-sm btn-primary" id="rf-apply">筛选</button>
        <button class="btn btn-sm btn-ghost danger" id="rf-clear">清空全部</button>
      </div>
      <div class="research-list">${listHtml}</div>
    </div>`;

  bind();
  lazyThumbs();
}

const VIEWS = { overview: viewOverview, personas: viewPersonas, keys: viewKeys, users: viewUsers, events: viewEvents, research: viewResearch, settings: viewSettings };

/* ---------- 启动 ---------- */
window.addEventListener('hashchange', () => { if (getToken()) renderApp(); });
if (getToken()) renderApp();
else renderLogin();
