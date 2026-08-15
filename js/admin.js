/* 管理后台：登录 / 概览 / 密钥与引擎 / 用户 / 生成日志 / 设置 */
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
  { id: 'overview', label: '概览' },
  { id: 'keys', label: '密钥与引擎' },
  { id: 'users', label: '用户' },
  { id: 'events', label: '生成日志' },
  { id: 'settings', label: '站点设置' }
];

function renderApp() {
  const tab = (location.hash.replace('#', '') || 'overview');
  if (!TABS.some(t => t.id === tab)) { location.hash = '#overview'; return renderApp(); }
  app.innerHTML = `
    <header class="topbar">
      <span class="brand">
        <svg width="26" height="26" viewBox="0 0 64 64" fill="none" stroke="#5C4A42" stroke-width="3" aria-hidden="true"><path d="M20 18h24l-3 8v26a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8V26z" fill="#FF9BB3"/><circle cx="32" cy="38" r="7" fill="#FFF8F2"/></svg>
        莓好灵感屋 <span class="sub">管理后台</span>
      </span>
      <span class="spacer"></span>
      <a class="site-link" href="/" target="_blank" rel="noopener">用户端 ↗</a>
      <button class="logout" id="btn-logout">退出</button>
    </header>
    <div class="layout">
      <nav class="sidenav" aria-label="后台导航">
        ${TABS.map(t => `<a href="#${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</a>`).join('')}
      </nav>
      <main id="view" class="view"></main>
    </div>`;
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
        ${e.ready ? '<span class="chip mint">可用</span>' : '<span class="chip plain">未启用</span>'}
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
      <table><thead><tr><th>引擎</th><th>成功</th><th>失败</th><th style="width:40%">占比</th><th>成功率</th></tr></thead>
      <tbody>${byProvider}</tbody></table>
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
          ${e.ready ? '<span class="chip mint">已配置</span>' : '<span class="chip plain">未配置</span>'}
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
      toast(j.ok ? '已保存' : (j.message || '保存失败'), j.ok ? '' : 'err');
    } else {
      for (const v of values) {
        if (!v.value) continue;
        const j = await api('keys', { method: 'POST', body: v }).catch(e => ({ ok: false, message: e.message }));
        if (!j.ok) { toast(j.message || '保存失败', 'err'); return; }
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
    toast(j.ok ? '已保存，下一次生成即用 kontext' : (j.message || '保存失败'), j.ok ? '' : 'err');
    if (j.ok) viewKeys(view);
  });

  /* imgbb */
  document.getElementById('save-imgbb').addEventListener('click', async () => {
    const v = document.getElementById('k-imgbb').value.trim();
    if (!v) return toast('先填入 imgbb 密钥', 'err');
    const j = await api('keys', { method: 'POST', body: { field: 'imgbb', value: v } }).catch(e => ({ ok: false, message: e.message }));
    toast(j.ok ? '已保存' : (j.message || '保存失败'), j.ok ? '' : 'err');
    if (j.ok) viewKeys(view);
  });
}

/* ================= 用户 ================= */
async function viewUsers(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const j = await api('users').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const rows = j.users.map(u => `
    <tr class="${u.blocked ? 'blocked' : ''}">
      <td class="mono">${esc(shortId(u.id))}</td>
      <td class="num">${u.day === new Date().toISOString().slice(0, 10) ? u.dayCount : 0} / ${j.dailyLimit}</td>
      <td class="num">${u.total || 0}</td>
      <td class="num">${esc(fmtTime(u.last))}</td>
      <td>${u.blocked ? '<span class="chip danger">已封禁</span>' : '<span class="chip mint">正常</span>'}</td>
      <td><button class="btn btn-sm ${u.blocked ? 'btn-mint' : 'btn-danger'}" data-block="${esc(u.id)}" data-to="${u.blocked ? '0' : '1'}">${u.blocked ? '解封' : '封禁'}</button></td>
    </tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">还没有用户使用过</td></tr>';

  view.innerHTML = `
    <div class="card">
      <h2>用户管理</h2>
      <p class="desc">用户为匿名身份（浏览器本地生成 ID，无需注册）。封禁后该用户将无法生成，已有历史不受影响（历史仅存于用户本地）。每人每日额度在「站点设置」调整。</p>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>用户</th><th>今日额度</th><th>累计生成</th><th>最近活跃</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  view.querySelectorAll('[data-block]').forEach(btn => btn.addEventListener('click', async () => {
    const j2 = await api('users/block', { method: 'POST', body: { clientId: btn.dataset.block, blocked: btn.dataset.to === '1' } }).catch(e => ({ ok: false }));
    if (j2 && j2.ok) { toast(btn.dataset.to === '1' ? '已封禁' : '已解封'); viewUsers(view); }
    else toast('操作失败', 'err');
  }));
}

/* ================= 生成日志 ================= */
async function viewEvents(view) {
  view.innerHTML = '<div class="card"><p class="desc">加载中…</p></div>';
  const j = await api('events').catch(() => null);
  if (!j || !j.ok) { view.innerHTML = '<div class="card"><p class="desc">加载失败，刷新重试</p></div>'; return; }

  const items = j.events.map(e => `
    <div class="event-item">
      <span class="t">${esc(fmtTime(e.t))}</span>
      <span class="${e.ok ? 'ok' : 'fail'}">${e.ok ? '✓ 成功' : '✗ 失败'}</span>
      <span>${esc(e.provider || '-')}</span>
      <span class="mono">${esc(shortId(e.clientId))}</span>
      <span class="num">${e.ms ? Math.round(e.ms / 100) / 10 + 's' : ''}</span>
      <span class="err">${esc(e.err || '')}</span>
    </div>`).join('') || '<p class="desc">还没有生成记录</p>';

  view.innerHTML = `
    <div class="card">
      <h2>生成日志</h2>
      <p class="desc">最近 ${j.events.length} 条（服务器只保留最近 200 条，不含任何照片内容）</p>
      ${items}
    </div>`;
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

const VIEWS = { overview: viewOverview, keys: viewKeys, users: viewUsers, events: viewEvents, settings: viewSettings };

/* ---------- 启动 ---------- */
window.addEventListener('hashchange', () => { if (getToken()) renderApp(); });
if (getToken()) renderApp();
else renderLogin();
