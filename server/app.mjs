/* 莓好灵感屋 · 请求处理核心（本地 node server.mjs 与 Vercel Serverless 共用）
 *   - /api/tryon        用户生成入口（限流 + 封禁 + 引擎降级链）
 *   - /api/config       用户端配置（可用引擎、今日额度）
 *   - /api/admin/*      管理后台（口令登录，密钥永不下发原文）
 *   - 其余路径          静态托管（仅本地开发使用；Vercel 上由平台静态托管接管）
 * 数据落 server/data.json（本地）/ Vercel KV（Serverless），首启管理员口令 admin123。
 * 导出 handler(req, res) 供 http.createServer 与 Vercel 函数共用。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as store from './store.mjs';
import { tryOn, buildChain, providers, byId, AIError, normalizeError, initNet } from './providers.mjs';
import * as cache from './cache.mjs';
import { parseIp, parseUserAgent } from './device.mjs';
import {
  computeUserPersona,
  recommendInspirations,
  aggregateUserPersonas,
  DEFAULT_REC_SETTINGS,
  REC_PRESETS
} from './userLearning.mjs';

/* 项目根目录（本文件位于 server/ 下，上溯一级） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 懒初始化（避免模块顶层 await，兼容 @vercel/node 打包） ---------- */
let readyPromise = null;
let boot = { firstRun: false };

export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await store.ensureLoaded();   // Vercel 下从 KV 加载；本地已同步就绪
      await initNet();              // 检测代理环境，切换出网通道
      boot = store.initAdmin();     // 数据就绪后再初始化管理员口令
      return boot;
    })();
  }
  return readyPromise;
}

/* ---------- 管理员会话（无状态签名 token：跨实例/冷启动不失效） ----------
 * Vercel Serverless 多实例 + 频繁冷启动，内存 Map 会话会在实例切换后随机 401 掉登录。
 * 改为 HMAC 签名 token：payload 内嵌过期时间，任何实例凭持久化的密钥即可验证，
 * 无需共享内存状态。签名密钥优先取环境变量 ADMIN_SESSION_SECRET，
 * 否则由持久化的管理员 salt+hash 派生（所有实例从 KV/文件读到同一值）。
 * 退出登录无需服务端作废：客户端清除 token 即可，token 本身 12h 过期。 */
const SESSION_MS = 12 * 60 * 60 * 1000;
let loginHits = [];

function sessionSecret() {
  const env = process.env.ADMIN_SESSION_SECRET;
  if (env) return env;
  const d = store.load();
  if (d.admin && d.admin.salt) {
    return crypto.createHash('sha256').update('nhi:session:' + d.admin.salt + ':' + d.admin.hash).digest('hex');
  }
  return '';
}

function signToken(t, exp) {
  return crypto.createHmac('sha256', sessionSecret()).update(t + '.' + exp).digest('hex');
}

function newSession() {
  const t = crypto.randomUUID();
  const exp = Date.now() + SESSION_MS;
  return `${t}.${exp}.${signToken(t, exp)}`;
}
function checkSession(req) {
  const h = req.headers['authorization'] || '';
  const raw = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = String(raw).split('.');
  if (parts.length !== 3) return false;
  const [t, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!t || !exp || exp < Date.now()) return false;
  const expect = signToken(t, exp);
  if (expect.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig));
}

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
  const ip = parseIp(req);
  const ua = req.headers['user-agent'] || '';
  const dev = parseUserAgent(ua);

  let u = null;
  if (clientId) {
    u = store.touchUser(clientId, { ip, userAgent: ua, device: dev.summary });
    store.saveDebounced();   // 新用户/访问记录也要落盘，否则重启/冷启动后档案丢失
  }

  const quota = store.getUserQuotaInfo(u, d.settings.dailyLimit);

  json(res, 200, {
    ok: true,
    server: true,
    engines: chain.map(p => ({ id: p.id, label: p.label })),
    primary: chain[0] ? chain[0].label : '',
    dailyLimit: quota.dailyLimit,
    effectiveLimit: quota.effectiveLimit,
    usedToday: quota.dayCount,
    remainingToday: quota.remainingToday,
    isCustomLimit: quota.isCustomLimit,
    bonusQuota: quota.bonusQuota,
    announcement: d.settings.announcement || '',
    recSettings: store.getRecommendationSettings()
  });
}

async function handleUserBehavior(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
  const clientId = safeClientId(body.clientId);
  if (!clientId) return json(res, 400, { ok: false, message: '缺少有效 clientId' });

  const ip = parseIp(req);
  const ua = req.headers['user-agent'] || '';
  const dev = parseUserAgent(ua);
  store.touchUser(clientId, { ip, userAgent: ua, device: dev.summary });

  if (Array.isArray(body.events) && body.events.length > 0) {
    store.recordUserBehavior(clientId, body.events);
    store.saveDebounced();
  }

  const events = store.getUserEvents(clientId);
  const recSettings = store.getRecommendationSettings();
  const persona = computeUserPersona(events, recSettings);

  return json(res, 200, { ok: true, persona });
}

async function handleRecommendations(req, res, url) {
  const clientId = safeClientId(url.searchParams.get('clientId'));
  const cat = url.searchParams.get('cat') || 'all';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 12));

  const events = clientId ? store.getUserEvents(clientId) : [];
  const recSettings = store.getRecommendationSettings();
  const persona = computeUserPersona(events, recSettings);

  const recommendations = recommendInspirations(persona, {
    cat,
    limit,
    customWeights: recSettings
  });

  return json(res, 200, {
    ok: true,
    persona: {
      type: persona.personaType,
      name: persona.personaName,
      badge: persona.personaBadge,
      confidence: persona.confidence,
      topTags: persona.topTags
    },
    recommendations
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

  const ip = parseIp(req);
  const ua = req.headers['user-agent'] || '';
  const dev = parseUserAgent(ua);

  const d = store.load();
  const u = store.touchUser(clientId, { ip, userAgent: ua, device: dev.summary });
  if (u.blocked) return json(res, 403, { ok: false, error: { type: 'Blocked', message: '访问已被站长限制' } });

  const quota = store.getUserQuotaInfo(u, d.settings.dailyLimit);
  if (quota.remainingToday <= 0) {
    return json(res, 429, { ok: false, error: { type: 'Limit', message: `今天的 ${quota.effectiveLimit} 次额度已用完，明天再来或联系站长增加额度吧` } });
  }

  const width = Math.min(1440, Math.max(256, Number(body.width) || 1024));
  const height = Math.min(1440, Math.max(256, Number(body.height) || 768));
  const blobIn = new Blob([Buffer.from(img.b64, 'base64')], { type: img.mime });
  const prompt = String(body.prompt);

  // 记录学习行为
  store.recordUserBehavior(clientId, [{
    t: Date.now(),
    type: 'tryon_generate',
    cat: body.cat || null,
    inspId: body.inspId || null,
    tags: Array.isArray(body.tags) ? body.tags : []
  }]);

  /* 结果缓存：感知哈希 + prompt 去重，命中直接返回，跳过 API 调用 */
  const phashHex = typeof body.phash === 'string' && /^[0-9a-f]{16}$/i.test(body.phash) ? body.phash.toLowerCase() : null;
  if (phashHex) {
    const hit = cache.lookup(phashHex, prompt);
    if (hit.hit) {
      store.recordEvent({ clientId, provider: hit.entry.provider || 'cache', ok: true, ms: Date.now() - t0, err: hit.exact ? 'cache-hit' : `cache-fuzzy(${hit.dist})` });
      store.touchUser(clientId, { count: 1, ip, userAgent: ua, device: dev.summary });
      store.recordResearch({ clientId, cat: body.cat, prompt, provider: hit.entry.provider || 'cache', ok: true, ms: Date.now() - t0, inputB64: img.b64, outputB64: hit.entry.image });
      store.saveDebounced();
      const updatedQuota = store.getUserQuotaInfo(store.getUser(clientId), d.settings.dailyLimit);
      return json(res, 200, {
        ok: true,
        image: `data:${hit.entry.mime || 'image/png'};base64,${hit.entry.image}`,
        provider: { id: hit.entry.provider || 'cache', label: hit.entry.provider || '缓存' },
        cached: true,
        remainingToday: updatedQuota.remainingToday,
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
    store.touchUser(clientId, { count: 1, ip, userAgent: ua, device: dev.summary });
    store.recordEvent({ clientId, provider: provider.id, ok: true, ms: Date.now() - t0 });
    store.recordResearch({ clientId, cat: body.cat, prompt, provider: provider.id, ok: true, ms: Date.now() - t0, inputB64: img.b64, outputB64: b64 });
    store.saveDebounced();
    const updatedQuota = store.getUserQuotaInfo(store.getUser(clientId), d.settings.dailyLimit);
    return json(res, 200, {
      ok: true,
      image: `data:${mime};base64,${b64}`,
      provider: { id: provider.id, label: provider.label },
      cached: false,
      remainingToday: updatedQuota.remainingToday,
      ms: Date.now() - t0
    });
  } catch (err) {
    const e = normalizeError(err);
    store.recordEvent({ clientId, provider: providerUsed, ok: false, ms: Date.now() - t0, err: e.message });
    store.recordResearch({ clientId, cat: body.cat, prompt, provider: providerUsed, ok: false, ms: Date.now() - t0, err: e.message, inputB64: img.b64 });
    store.saveDebounced();
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
    // 无状态 token 无需服务端作废：客户端清除本地 token 即可
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
  if (req.method === 'GET' && op === 'keys') {
    await store.maybeRefresh(true);   // 读前强制拉最新 KV，避免热实例缓存旧配置
    return json(res, 200, { ok: true, keys: store.maskedKeys() });
  }
  if (req.method === 'POST' && op === 'keys') {
    let body;
    try { body = JSON.parse(await readBody(req, 64 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const okSet = store.setKey(body.field, body.value);
    if (!okSet) return json(res, 400, { ok: false, message: '未知密钥字段' });
    store.save();
    await store.flush().catch(() => {});   // 等在途 KV 写完成，再判断是否持久化成功
    const writeError = store.getWriteError();
    const resp = { ok: true, keys: store.maskedKeys() };
    if (writeError) resp.warning = writeError;
    return json(res, 200, resp);
  }
  if (req.method === 'POST' && op === 'keys/verify') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const p = byId(body.provider);
    if (!p || !p.verify) return json(res, 400, { ok: false, message: '该引擎不支持验证' });
    await store.maybeRefresh(true);   // 验证前强制拉最新 KV，保证读到刚保存的密钥
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

  /* 用户管理与单独设置 */
  if (req.method === 'GET' && op === 'users') {
    const d = store.load();
    const recSettings = store.getRecommendationSettings();
    const userList = store.listUsers().map(u => {
      const events = u.behaviorEvents || [];
      const persona = computeUserPersona(events, recSettings);
      return {
        ...u,
        persona: {
          name: persona.personaName,
          badge: persona.personaBadge,
          type: persona.personaType,
          confidence: persona.confidence
        }
      };
    });
    return json(res, 200, {
      ok: true,
      users: userList,
      globalDailyLimit: d.settings.dailyLimit
    });
  }

  if (req.method === 'GET' && op === 'users/detail') {
    const clientId = safeClientId(url.searchParams.get('clientId'));
    if (!clientId) return json(res, 400, { ok: false, message: 'clientId 不合法' });
    const d = store.load();
    const u = d.users[clientId];
    if (!u) return json(res, 404, { ok: false, message: '未找到该用户' });

    const recSettings = store.getRecommendationSettings();
    const events = u.behaviorEvents || [];
    const persona = computeUserPersona(events, recSettings);
    const quota = store.getUserQuotaInfo(u, d.settings.dailyLimit);

    // 筛选与该用户相关的生成日志
    const userEvents = (d.stats.events || []).filter(e => e.clientId === clientId).slice(0, 30);

    return json(res, 200, {
      ok: true,
      user: {
        id: clientId,
        ...u,
        ...quota
      },
      persona,
      generationHistory: userEvents,
      behaviorEvents: events.slice(0, 30),
      globalDailyLimit: d.settings.dailyLimit
    });
  }

  if (req.method === 'POST' && op === 'users/update') {
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const clientId = safeClientId(body.clientId);
    if (!clientId) return json(res, 400, { ok: false, message: 'clientId 不合法' });

    store.updateUserQuota(clientId, {
      customDailyLimit: body.customDailyLimit,
      bonusQuota: body.bonusQuota,
      resetToday: !!body.resetToday,
      note: body.note,
      blocked: body.blocked
    });
    store.save();

    const d = store.load();
    const u = store.getUser(clientId);
    const quota = store.getUserQuotaInfo(u, d.settings.dailyLimit);

    return json(res, 200, {
      ok: true,
      message: '用户配置已更新',
      user: {
        id: clientId,
        ...u,
        ...quota
      }
    });
  }

  if (req.method === 'POST' && op === 'users/reset-today') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const clientId = safeClientId(body.clientId);
    if (!clientId) return json(res, 400, { ok: false, message: 'clientId 不合法' });

    store.updateUserQuota(clientId, { resetToday: true });
    store.save();
    return json(res, 200, { ok: true, message: '今日使用量已重置为 0' });
  }

  if (req.method === 'POST' && op === 'users/block') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const clientId = safeClientId(body.clientId);
    if (!clientId) return json(res, 400, { ok: false, message: 'clientId 不合法' });
    store.markUser(clientId, { blocked: !!body.blocked });
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

  /* 用户画像全景与画像详情 */
  if (req.method === 'GET' && op === 'personas') {
    const d = store.load();
    const recSettings = store.getRecommendationSettings();
    const aggregate = aggregateUserPersonas(d.users, recSettings);
    const usersPersonaList = Object.entries(d.users).map(([clientId, u]) => {
      const events = u.behaviorEvents || [];
      const persona = computeUserPersona(events, recSettings);
      return {
        id: clientId,
        first: u.first,
        last: u.last,
        total: u.total,
        dayCount: u.dayCount,
        blocked: !!u.blocked,
        persona
      };
    }).sort((a, b) => (b.persona.stats.totalEvents || 0) - (a.persona.stats.totalEvents || 0));

    return json(res, 200, {
      ok: true,
      aggregate,
      users: usersPersonaList,
      presets: REC_PRESETS,
      currentSettings: recSettings
    });
  }

  if (req.method === 'GET' && op === 'personas/detail') {
    const clientId = safeClientId(url.searchParams.get('clientId'));
    const d = store.load();
    const u = clientId ? d.users[clientId] : null;
    if (!u) return json(res, 404, { ok: false, message: '用户不存在' });

    const recSettings = store.getRecommendationSettings();
    const events = u.behaviorEvents || [];
    const persona = computeUserPersona(events, recSettings);
    const recommendations = recommendInspirations(persona, { limit: 12, customWeights: recSettings });

    return json(res, 200, {
      ok: true,
      user: { id: clientId, ...u },
      persona,
      events: events.slice(0, 50),
      recommendations
    });
  }

  /* 推荐算法配置读取与修改 */
  if (req.method === 'GET' && op === 'recommendation-settings') {
    return json(res, 200, {
      ok: true,
      settings: store.getRecommendationSettings(),
      presets: REC_PRESETS
    });
  }

  if (req.method === 'POST' && op === 'recommendation-settings') {
    let body;
    try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const patch = {};
    if (body.preset && REC_PRESETS[body.preset]) patch.preset = body.preset;
    if (body.personalWeight != null) patch.personalWeight = Math.min(1, Math.max(0, Number(body.personalWeight) || 0));
    if (body.hotnessWeight != null) patch.hotnessWeight = Math.min(1, Math.max(0, Number(body.hotnessWeight) || 0));
    if (body.freshnessWeight != null) patch.freshnessWeight = Math.min(1, Math.max(0, Number(body.freshnessWeight) || 0));
    if (body.exploreWeight != null) patch.exploreWeight = Math.min(1, Math.max(0, Number(body.exploreWeight) || 0));
    if (body.decayHalfLifeDays != null) patch.decayHalfLifeDays = Math.min(60, Math.max(1, Number(body.decayHalfLifeDays) || 7));
    if (body.categoryBoost != null) patch.categoryBoost = Math.min(0.5, Math.max(0, Number(body.categoryBoost) || 0.15));

    const updated = store.updateRecommendationSettings(patch);
    store.save();
    return json(res, 200, { ok: true, settings: updated });
  }

  /* 推荐算法在线实时模拟对比 */
  if (req.method === 'POST' && op === 'simulate-recommendation') {
    let body;
    try { body = JSON.parse(await readBody(req, 32 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    const clientId = safeClientId(body.clientId);
    const d = store.load();
    const u = clientId ? d.users[clientId] : null;
    const events = (u && u.behaviorEvents) || (body.customEvents || []);

    const weights = {
      preset: body.preset || 'balanced',
      personalWeight: Number(body.personalWeight) ?? 0.45,
      hotnessWeight: Number(body.hotnessWeight) ?? 0.20,
      freshnessWeight: Number(body.freshnessWeight) ?? 0.15,
      exploreWeight: Number(body.exploreWeight) ?? 0.20,
      decayHalfLifeDays: Number(body.decayHalfLifeDays) ?? 7,
      categoryBoost: Number(body.categoryBoost) ?? 0.15
    };

    const persona = computeUserPersona(events, weights);
    const results = recommendInspirations(persona, {
      cat: body.cat || 'all',
      limit: Number(body.limit) || 12,
      customWeights: weights
    });

    return json(res, 200, {
      ok: true,
      persona,
      results
    });
  }

  /* 改口令 */
  if (req.method === 'POST' && op === 'password') {
    let body;
    try { body = JSON.parse(await readBody(req, 8 * 1024)); } catch { return json(res, 400, { ok: false, message: '请求格式不正确' }); }
    if (body.next !== undefined && !/^[ -~]{6,64}$/.test(body.next || '')) return json(res, 400, { ok: false, message: '新口令需 6–64 位字符' });
    const ok = store.changePassword(body.current || '', body.next || '');
    if (!ok) return json(res, 400, { ok: false, message: '当前口令不对，或新口令太短（至少 6 位）' });
    // 口令变更后 salt/hash 改变，由 salt 派生的会话密钥随之改变，旧 token 自动全部失效
    return json(res, 200, { ok: true, message: '口令已更新，请重新登录', relogin: true });
  }

  /* 研究数据：列表（筛选）/ 单图 / 清空 */
  if (req.method === 'GET' && op === 'research') {
    const q = url.searchParams;
    const list = store.listResearch({
      limit: q.get('limit') || 100,
      clientId: q.get('clientId') || '',
      cat: q.get('cat') || '',
      provider: q.get('provider') || '',
      ok: q.get('ok') === '1' ? true : q.get('ok') === '0' ? false : null
    });
    return json(res, 200, { ok: true, research: list });
  }
  const imgMatch = /^research\/([A-Za-z0-9_-]+)\/(in|out)$/.exec(op);
  if (req.method === 'GET' && imgMatch) {
    const [, id, kind] = imgMatch;
    const b64 = await store.getResearchImage(id, kind);
    if (!b64) return json(res, 404, { ok: false, message: '图片不存在' });
    return json(res, 200, { ok: true, id, kind, data: `data:image/jpeg;base64,${b64}` });
  }
  if (req.method === 'POST' && op === 'research/clear') {
    const removed = await store.clearResearch();
    return json(res, 200, { ok: true, removed });
  }

  return json(res, 404, { ok: false, message: '未知接口' });
}

/* ---------- 静态资源（仅本地开发；Vercel 上由平台静态托管接管） ---------- */
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

/* ---------- 请求入口（本地与 Vercel 共用） ---------- */
export async function handler(req, res) {
  await ready();
  // Vercel 多实例场景：后台改密钥/设置后，热实例 30s 内重新拉取 KV，避免读到旧配置
  await store.maybeRefresh().catch(() => {});
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/config') return await handleConfig(req, res, url);
    if (url.pathname === '/api/tryon') return await handleTryon(req, res);
    if (url.pathname === '/api/user/behavior') return await handleUserBehavior(req, res);
    if (url.pathname === '/api/recommendations') return await handleRecommendations(req, res, url);
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) return await handleAdmin(req, res, url);
    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, message: '未知接口' });
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[http]', err);
    return json(res, 500, { ok: false, message: '服务内部错误' });
  }
}
