/* 莓好灵感屋 · 服务端（零依赖，Node 18+）
 * 启动：node server.mjs   （默认 3000 端口，PORT 环境变量可改）
 *   - 静态托管 index.html / admin.html / css / js / assets
 *   - /api/tryon        用户生成入口（限流 + 封禁 + 引擎降级链）
 *   - /api/config       用户端配置（可用引擎、今日额度）
 *   - /api/admin/*      管理后台（口令登录，密钥永不下发原文）
 * 数据落 server/data.json，首启管理员口令 admin123，登录后请立即修改。 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

import * as store from './server/store.mjs';
import { tryOn, buildChain, providers, byId, AIError, normalizeError, initNet } from './server/providers.mjs';
import * as cache from './server/cache.mjs';

/* ---------- 管理员会话（内存态，重启失效） ---------- */
const sessions = new Map();
const SESSION_MS = 12 * 60 * 60 * 1000;
function newSession() {
  const t = crypto.randomUUID();
  sessions.set(t, Date.now() + SESSION_MS);
  return t;
}
function checkSession(req) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
import crypto from 'node:crypto';

/* ---------- 小工具 ---------- */
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req, limit = 15 * 1024 * 1024) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > limit) { reject(new AIError('Network', '请求体过大')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});
const parseDataUrl = s => {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(s || ''));
  if (!m) return null;
  return { mime: 'image/' + m[1], b64: m[2] };
};
const safeClientId = s => /^[A-Za-z0-9_-]{6,64}$/.test(String(s || '')) ? String(s) : null;

/* ---------- 用户端 API ---------- */
async function handleConfig(req, res, url) {
  const clientId = safeClientId(url.searchParams.get('clientId'));
  const d = store.load();
  const chain = buildChain(d.keys, d.settings.preferred);
  const u = clientId ? store.getUser(clientId) : null;
  const dayCount = u && u.day === store.today() ? u.dayCount : 0;
  json(res, 200, {
    ok: true,
    server: true,
    engines: chain.map(p => ({ id: p.id, label: p.label })),
    primary: chain[0] ? chain[0].label : '',
    dailyLimit: d.settings.dailyLimit,
    usedToday: dayCount,
    announcement: d.settings.announcement || ''
  });
}

async function handleTryon(req, res) {
  const t0 = Date.now();
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { ok: false, error: { type: 'Network', message: '请求格式不正确' } }); }

  const clientId = safeClientId(body.clientId);
  if (!clientId) return json(res, 400, { ok: false, error: { type: 'Network', message: '缺少有效的 clientId' } });
  const img = parseDataUrl(body.image);
  if (!img || img.b64.length < 100) return json(res, 400, { ok: false, error: { type: 'Network', message: '照片缺失或格式不支持' } });
  if (!body.prompt || String(body.prompt).length > 600) return json(res, 400, { ok: false, error: { type: 'Network', message: '描述不合法' } });

  const d = store.load();
  const u = store.touchUser(clientId);
  if (u.blocked) return json(res, 403, { ok: false, error: { type: 'Blocked', message: '访问已被站长限制' } });
  const used = u.day === store.today() ? u.dayCount : 0;
  if (used >= d.settings.dailyLimit) {
    return json(res, 429, { ok: false, error: { type: 'Limit', message: `今天的 ${d.settings.dailyLimit} 次免费额度已用完，明天再来吧` } });
  }

  const width = Math.min(1440, Math.max(256, Number(body.width) || 1024));
  const height = Math.min(1440, Math.max(256, Number(body.height) || 768));
  const blobIn = new Blob([Buffer.from(img.b64, 'base64')], { type: img.mime });
  const prompt = String(body.prompt);

  /* 结果缓存：感知哈希 + prompt 去重，命中直接返回，跳过 API 调用 */
  const phashHex = typeof body.phash === 'string' && /^[0-9a-f]{16}$/i.test(body.phash) ? body.phash.toLowerCase() : null;
  if (phashHex) {
    const hit = cache.lookup(phashHex, prompt);
    if (hit.hit) {
      store.recordEvent({ clientId, provider: hit.entry.provider || 'cache', ok: true, ms: Date.now() - t0, err: hit.exact ? 'cache-hit' : `cache-fuzzy(${hit.dist})` });
      store.save();
      return json(res, 200, {
        ok: true,
        image: `data:${hit.entry.mime || 'image/png'};base64,${hit.entry.image}`,
        provider: { id: hit.entry.provider || 'cache', label: hit.entry.provider || '缓存' },
        cached: true,
        ms: Date.now() - t0
      });
    }
  }

  let providerUsed = '';
  try {
    const { blob, provider } = await tryOn({
      imageBlob: blobIn,
      prompt,
      width, height,
      ctx: { keys: d.keys, settings: d.settings },
      onEngine: ({ provider }) => { providerUsed = provider.id; }
    });
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const mime = blob.type || 'image/png';
    // 写入缓存（含 pHash，供后续模糊匹配）
    if (phashHex) {
      cache.store(phashHex, prompt, b64, mime, provider.id);
    }
    store.touchUser(clientId, { count: 1 });
    store.recordEvent({ clientId, provider: provider.id, ok: true, ms: Date.now() - t0 });
    store.save();
    return json(res, 200, { ok: true, image: `data:${mime};base64,${b64}`, provider: { id: provider.id, label: provider.label }, cached: false, ms: Date.now() - t0 });
  } catch (err) {
    const e = normalizeError(err);
    store.recordEvent({ clientId, provider: providerUsed, ok: false, ms: Date.now() - t0, err: e.message });
    store.save();
    const code = e.type === 'Content' ? 422 : e.type === 'Quota' ? 503 : 502;
    return json(res, code, { ok: false, error: { type: e.type, message: e.message } });
  }
}

/* ---------- 管理端 API ---------- */
async function handleAdmin(req, res, url) {
  const op = url.pathname.replace(/^\/api\/admin\/?/, '') || (url.pathname.endsWith('/admin') || url.pathname === '/api/admin' ? 'login' : '');

  /* 登录 / 登出不需要 token */
  if (req.method === 'POST' && (op === 'login')) {
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    /* 简单防爆：同 IP 5 秒内最多 8 次 */
    const ip = req.socket.remoteAddress || '?';
    const now = Date.now();
    loginHits = loginHits.filter(t => now - t.t < 5000 && t.ip === ip);
    loginHits.push({ ip, t: now });
    if (loginHits.length > 8) return json(res, 429, { ok: false, message: '尝试太频繁，稍后再试' });

    if (!store.checkPassword(body.password || '')) return json(res, 401, { ok: false, message: '口令不对哦' });
    return json(res, 200, { ok: true, token: newSession() });
  }
  if (req.method === 'POST' && op === 'logout') {
    const h = req.headers['authorization'] || '';
    if (h.startsWith('Bearer ')) sessions.delete(h.slice(7));
    return json(res, 200, { ok: true });
  }

  if (!checkSession(req)) return json(res, 401, { ok: false, message: '请先登录' });

  /* 总览 */
  if (req.method === 'GET' && op === 'overview') {
    const d = store.load();
    const chain = buildChain(d.keys, d.settings.preferred);
    return json(res, 200, {
      ok: true,
      stats: { total: d.stats.total, ok: d.stats.ok, fail: d.stats.fail, byProvider: d.stats.byProvider },
      engines: providers.map(p => ({
        id: p.id, label: p.label, requiresKey: p.requiresKey, notes: p.notes, docsUrl: p.docsUrl,
        ready: chain.includes(p), primary: chain[0] && chain[0].id === p.id,
        keyShape: p.keyShape || null
      })),
      settings: d.settings,
      userCount: Object.keys(d.users).length,
      todayUsers: Object.values(d.users).filter(u => u.day === store.today()).length,
      todayGens: Object.values(d.users).reduce((s, u) => s + (u.day === store.today() ? u.dayCount : 0), 0)
    });
  }

  /* 密钥（脱敏读 / 明文写） */
  if (req.method === 'GET' && op === 'keys') return json(res, 200, { ok: true, keys: store.maskedKeys() });
  if (req.method === 'POST' && op === 'keys') {
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const okSet = store.setKey(body.field, body.value);
    if (!okSet) return json(res, 400, { ok: false, message: '未知密钥字段' });
    store.save();
    return json(res, 200, { ok: true, keys: store.maskedKeys() });
  }
  if (req.method === 'POST' && op === 'keys/verify') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const p = byId(body.provider);
    if (!p || !p.verify) return json(res, 400, { ok: false, message: '该引擎不支持验证' });
    const d = store.load();
    if (p.requiresKey) {
      const k = d.keys[p.id];
      const empty = typeof k === 'string' ? !k.trim() : !(k && k.token && k.token.trim());
      if (empty) return json(res, 400, { ok: false, message: '还没有填写密钥' });
    }
    try {
      const msg = await p.verify({ keys: d.keys, settings: d.settings });
      return json(res, 200, { ok: true, message: msg });
    } catch (err) {
      return json(res, 200, { ok: false, message: err.message || '验证失败' });
    }
  }

  /* 用户 */
  if (req.method === 'GET' && op === 'users') return json(res, 200, { ok: true, users: store.listUsers(), dailyLimit: store.load().settings.dailyLimit });
  if (req.method === 'POST' && op === 'users/block') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    if (!safeClientId(body.clientId)) return json(res, 400, { ok: false, message: 'clientId 不合法' });
    store.markUser(body.clientId, { blocked: !!body.blocked });
    store.save();
    return json(res, 200, { ok: true, users: store.listUsers() });
  }

  /* 事件流 */
  if (req.method === 'GET' && op === 'events') return json(res, 200, { ok: true, events: store.load().stats.events.slice(0, 100) });

  /* 站点设置 */
  if (req.method === 'POST' && op === 'settings') {
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const d = store.load();
    if (body.dailyLimit != null) {
      const n = Number(body.dailyLimit);
      if (!Number.isInteger(n) || n < 1 || n > 500) return json(res, 400, { ok: false, message: '每日额度需为 1–500 的整数' });
      d.settings.dailyLimit = n;
    }
    if (body.preferred != null) {
      if (body.preferred !== 'auto' && !byId(body.preferred)) return json(res, 400, { ok: false, message: '未知引擎' });
      d.settings.preferred = body.preferred;
    }
    if (typeof body.announcement === 'string') d.settings.announcement = body.announcement.slice(0, 140);
    store.save();
    return json(res, 200, { ok: true, settings: d.settings });
  }

  /* 改口令 */
  if (req.method === 'POST' && op === 'password') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    if (body.next !== undefined && !/^[ -~]{6,64}$/.test(body.next || '')) return json(res, 400, { ok: false, message: '新口令需 6–64 位字符' });
    const ok = store.changePassword(body.current || '', body.next || '');
    if (!ok) return json(res, 400, { ok: false, message: '当前口令不对，或新口令太短（至少 6 位）' });
    sessions.clear();
    return json(res, 200, { ok: true, message: '口令已更新，请重新登录', relogin: true });
  }

  return json(res, 404, { ok: false, message: '未知接口' });
}
let loginHits = [];

/* ---------- 静态资源 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
  /* 禁止越界 / 保护服务端文件 */
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes('..') || decoded.startsWith('/server') || decoded === '/data.json' || decoded.startsWith('/.')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  const file = path.join(ROOT, decoded);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- 入口 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/config') return await handleConfig(req, res, url);
    if (url.pathname === '/api/tryon') return await handleTryon(req, res);
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) return await handleAdmin(req, res, url);
    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, message: '未知接口' });
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[http]', err);
    return json(res, 500, { ok: false, message: '服务内部错误' });
  }
});

const boot = store.initAdmin();
await initNet();
server.listen(PORT, () => {
  console.log('');
  console.log(`  莓好灵感屋 已启动 → http://localhost:${PORT}`);
  console.log(`  用户端     → ${'http://localhost:' + PORT + '/'}`);
  console.log(`  管理后台   → ${'http://localhost:' + PORT + '/admin'}`);
  if (boot.firstRun) {
    console.log(`  初始管理口令：${store.DEFAULT_PASSWORD}（登录后台后请立即修改）`);
  }
  console.log('');
});
