/* 数据持久化：密钥 / 用户 / 统计 / 站点设置 / 管理员口令
 *
 * 双后端存储：
 *   - 本地开发：单文件 server/data.json（临时文件 + rename，尽量原子）
 *   - Vercel Serverless：Vercel KV（Upstash Redis REST，零依赖、仅 fetch）
 *
 * Vercel 的 Serverless 函数无状态、文件系统只读，且多实例间不共享磁盘，
 * 因此部署到 Vercel 时（运行时自动注入 VERCEL=1）改用 KV 持久化。
 * 若部署到 Vercel 但未配置 KV 环境变量，则优雅降级为「仅内存态」——
 * 数据不落盘、不崩溃，仅重启/冷启动后丢失。
 *
 * 对外 API 与旧版完全兼容：
 *   - load() 仍为同步（读内存快照，顶层 await 已初始化）
 *   - save() 仍为同步签名（本地同步写文件；Vercel fire-and-forget 写 KV）
 *   - 新增 flush()：强制落地脏数据并等待在途写完成（Vercel 函数收尾调用） */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'data.json');
const TMP = FILE + '.tmp';

export const DEFAULT_PASSWORD = 'admin123';

/* ---------- Vercel KV 后端检测 ---------- */
const KV_URL = String(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const KV_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '');
const IS_VERCEL = !!process.env.VERCEL;
const KV_KEY = 'nhi:data';

const DEFAULTS = () => ({
  version: 1,
  admin: null,                                     // { salt, hash }，首启用默认口令
  settings: {
    preferred: 'auto',                             // auto | 引擎 id
    dailyLimit: 20,                                // 每用户每日生成上限
    announcement: '',                              // 公告（可选，展示在用户端）
    recommendation: {
      preset: 'balanced',
      personalWeight: 0.45,
      hotnessWeight: 0.20,
      freshnessWeight: 0.15,
      exploreWeight: 0.20,
      decayHalfLifeDays: 7,
      categoryBoost: 0.15
    }
  },
  keys: {
    pollinations: process.env.POLLINATIONS_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    siliconflow: process.env.SILICONFLOW_API_KEY || '',
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      token: process.env.CLOUDFLARE_API_TOKEN || ''
    },
    huggingface: process.env.HUGGINGFACE_API_KEY || '',
    imgbb: process.env.IMGBB_API_KEY || ''
  },
  users: {},                                       // clientId → 记录
  stats: { total: 0, ok: 0, fail: 0, byProvider: {}, events: [] }
});

let cache = null;

/* 把磁盘/KV 里的原始 JSON 与默认值做深度合并（空密钥回退到环境变量） */
function mergeRaw(raw) {
  const def = DEFAULTS();
  const r = raw || {};
  return {
    ...def,
    ...r,
    settings: { ...def.settings, ...(r.settings || {}) },
    keys: {
      ...def.keys,
      ...(r.keys || {}),
      gemini: (r.keys && r.keys.gemini) || def.keys.gemini,
      pollinations: (r.keys && r.keys.pollinations) || def.keys.pollinations,
      siliconflow: (r.keys && r.keys.siliconflow) || def.keys.siliconflow,
      huggingface: (r.keys && r.keys.huggingface) || def.keys.huggingface,
      imgbb: (r.keys && r.keys.imgbb) || def.keys.imgbb,
      cloudflare: {
        accountId: (r.keys && r.keys.cloudflare && r.keys.cloudflare.accountId) || def.keys.cloudflare.accountId,
        token: (r.keys && r.keys.cloudflare && r.keys.cloudflare.token) || def.keys.cloudflare.token
      }
    },
    stats: { ...def.stats, ...(r.stats || {}) }
  };
}

/* ---------- KV 读写（Upstash Redis REST，零依赖） ---------- */
async function kvGet() {
  const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
    headers: { 'Authorization': `Bearer ${KV_TOKEN}` }
  });
  if (!res.ok) throw new Error('KV get HTTP ' + res.status);
  const j = await res.json().catch(() => null);
  return j && typeof j.result === 'string' ? j.result : null;
}

async function kvSet(jsonStr) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', KV_KEY, jsonStr]])
  });
  if (!res.ok) throw new Error('KV set HTTP ' + res.status);
}

/* ---------- 内存快照初始化 ----------
 * 本地：模块加载时同步读文件（load() 立即可用）
 * Vercel：异步从 KV 加载，由 ensureLoaded() 触发（handler 开头 await）。
 * 不用顶层 await，避免 @vercel/node 打包时的不兼容。 */
if (!IS_VERCEL) {
  try {
    cache = mergeRaw(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    cache = DEFAULTS();
  }
}

let readyPromise = null;

export function ensureLoaded() {
  if (cache) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = (async () => {
      if (KV_URL && KV_TOKEN) {
        try {
          cache = mergeRaw(JSON.parse((await kvGet()) || '{}'));
          return;
        } catch (e) {
          console.error('[store] KV 读取失败，改用内存态', e.message);
        }
      } else {
        console.error('[store] 已部署到 Vercel 但未配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN，数据将不持久化');
      }
      cache = DEFAULTS();
    })();
  }
  return readyPromise;
}

export function load() {
  if (!cache) cache = DEFAULTS();
  return cache;
}

/* ---------- 写回：本地同步写文件；Vercel fire-and-forget 写 KV ---------- */
let pendingWrites = [];

export function save() {
  dirty = false;
  if (IS_VERCEL) {
    if (!KV_URL || !KV_TOKEN) return;   // 未配 KV，仅内存态
    const p = kvSet(JSON.stringify(cache))
      .catch(err => console.error('[store] KV 写入失败', err.message))
      .finally(() => { pendingWrites = pendingWrites.filter(x => x !== p); });
    pendingWrites.push(p);
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(TMP, JSON.stringify(cache, null, 2));
  fs.renameSync(TMP, FILE);
}

/* 强制落地：本地由 exit 钩子兜底；Vercel 由函数收尾调用，确保在途写完成 */
export async function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (dirty) { dirty = false; save(); }
  if (pendingWrites.length) {
    await Promise.allSettled(pendingWrites.slice());
  }
}

/* ---------- 防抖写入：合并高频改动，降低磁盘 I/O 与序列化开销 ----------
 * 高频路径（试戴计数 / 统计 / 行为上报）用 saveDebounced()：
 *   首次调用立即排程，窗口内后续调用仅标记 dirty，到期一次性落盘。
 * 关键操作（改密钥 / 改口令 / 封禁 / 改设置）仍走 save() 即时写，
 *   且会把已累积的脏改动一并写盘并清除 dirty 标记，不会重复写。
 * 进程退出（含 SIGINT/SIGTERM）时强制 flush，避免丢失最后窗口内的改动。 */
let saveTimer = null;
let dirty = false;

export function saveDebounced(delay = 800) {
  dirty = true;
  if (saveTimer) return;               // 已排程，仅标记脏，到期统一写
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) save();
  }, delay);
  if (saveTimer.unref) saveTimer.unref();   // 不阻止进程退出，退出时由 flushOnExit 兜底
}

function flushOnExit() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (dirty) save();
}
process.on('exit', flushOnExit);
process.on('SIGINT', () => { flushOnExit(); process.exit(0); });
process.on('SIGTERM', () => { flushOnExit(); process.exit(0); });

/* ---------- 管理员口令 ---------- */
export function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

export function initAdmin() {
  const d = load();
  if (!d.admin || !d.admin.hash) {
    const salt = crypto.randomBytes(8).toString('hex');
    d.admin = { salt, hash: sha256(salt + DEFAULT_PASSWORD) };
    save();
    return { firstRun: true };
  }
  return { firstRun: false };
}

export function checkPassword(pw) {
  const d = load();
  return !!pw && d.admin && sha256(d.admin.salt + pw) === d.admin.hash;
}

export function changePassword(current, next) {
  if (!checkPassword(current)) return false;
  if (!next || next.length < 6) return false;
  const d = load();
  const salt = crypto.randomBytes(8).toString('hex');
  d.admin = { salt, hash: sha256(salt + next) };
  save();
  return true;
}

/* ---------- 用户 ---------- */
export const today = () => new Date().toISOString().slice(0, 10);

export function touchUser(clientId, { count = 0, ip = '', userAgent = '', device = '' } = {}) {
  const d = load();
  const now = new Date().toISOString();
  let u = d.users[clientId];
  if (!u) {
    u = d.users[clientId] = {
      first: now,
      last: now,
      total: 0,
      day: today(),
      dayCount: 0,
      blocked: false,
      note: '',
      lastIp: ip || '',
      ips: ip ? [ip] : [],
      lastDevice: device || '',
      lastUserAgent: userAgent || '',
      devices: device ? [device] : [],
      customDailyLimit: null,
      bonusQuota: 0,
      behaviorEvents: []
    };
  }
  u.last = now;
  if (ip) {
    u.lastIp = ip;
    if (!Array.isArray(u.ips)) u.ips = [];
    if (!u.ips.includes(ip)) {
      u.ips.unshift(ip);
      if (u.ips.length > 10) u.ips.length = 10;
    }
  }
  if (userAgent) {
    u.lastUserAgent = userAgent;
  }
  if (device) {
    u.lastDevice = device;
    if (!Array.isArray(u.devices)) u.devices = [];
    if (!u.devices.includes(device)) {
      u.devices.unshift(device);
      if (u.devices.length > 5) u.devices.length = 5;
    }
  }
  if (u.day !== today()) {
    u.day = today();
    u.dayCount = 0;
  }
  if (count > 0) {
    u.total += count;
    u.dayCount += count;
  }
  return u;
}

export function getUser(clientId) { return load().users[clientId] || null; }

export function getUserQuotaInfo(u, globalDailyLimit = 20) {
  if (!u) {
    return {
      dailyLimit: globalDailyLimit,
      isCustomLimit: false,
      bonusQuota: 0,
      dayCount: 0,
      effectiveLimit: globalDailyLimit,
      remainingToday: globalDailyLimit
    };
  }
  const isCustomLimit = u.customDailyLimit != null && Number.isInteger(u.customDailyLimit);
  const baseLimit = isCustomLimit ? u.customDailyLimit : globalDailyLimit;
  const bonus = Math.max(0, Number(u.bonusQuota) || 0);
  const effectiveLimit = Math.max(0, baseLimit + bonus);
  const isToday = u.day === today();
  const dayCount = isToday ? (u.dayCount || 0) : 0;
  const remainingToday = Math.max(0, effectiveLimit - dayCount);

  return {
    dailyLimit: baseLimit,
    isCustomLimit,
    bonusQuota: bonus,
    dayCount,
    effectiveLimit,
    remainingToday
  };
}

export function markUser(clientId, patch) {
  const d = load();
  if (!d.users[clientId]) touchUser(clientId);
  Object.assign(d.users[clientId], patch || {});
  return d.users[clientId];
}

export function updateUserQuota(clientId, { customDailyLimit, bonusQuota, resetToday, note, blocked }) {
  const d = load();
  let u = d.users[clientId];
  if (!u) u = touchUser(clientId);

  if (customDailyLimit !== undefined) {
    if (customDailyLimit === null || customDailyLimit === '' || customDailyLimit === 'default') {
      u.customDailyLimit = null;
    } else {
      const n = Number(customDailyLimit);
      if (Number.isInteger(n) && n >= 0 && n <= 10000) {
        u.customDailyLimit = n;
      }
    }
  }

  if (bonusQuota !== undefined) {
    const b = Number(bonusQuota);
    if (!Number.isNaN(b) && b >= 0 && b <= 10000) {
      u.bonusQuota = Math.round(b);
    }
  }

  if (resetToday) {
    u.day = today();
    u.dayCount = 0;
  }

  if (note !== undefined) {
    u.note = String(note || '').slice(0, 200);
  }

  if (blocked !== undefined) {
    u.blocked = !!blocked;
  }

  return u;
}

export function listUsers() {
  const d = load();
  const globalDailyLimit = d.settings.dailyLimit || 20;
  return Object.entries(d.users)
    .map(([id, u]) => {
      const quota = getUserQuotaInfo(u, globalDailyLimit);
      return {
        id,
        ...u,
        ...quota
      };
    })
    .sort((a, b) => (b.last || '').localeCompare(a.last || ''));
}

/* ---------- 统计 ---------- */
export function recordEvent({ clientId, provider, ok, ms, err }) {
  const d = load();
  d.stats.total++;
  ok ? d.stats.ok++ : d.stats.fail++;
  if (provider) {
    const p = d.stats.byProvider[provider] || (d.stats.byProvider[provider] = { ok: 0, fail: 0 });
    ok ? p.ok++ : p.fail++;
  }
  d.stats.events.unshift({ t: Date.now(), clientId, provider, ok, ms: ms || 0, err: err || '' });
  if (d.stats.events.length > 200) d.stats.events.length = 200;
}

/* 密钥脱敏：只告诉后台“配了什么”，不回传原文 */
export function maskedKeys() {
  const d = load();
  const mask = v => !v ? '' : v.length <= 6 ? '***' : v.slice(0, 3) + '…' + v.slice(-4);
  const out = { imgbb: mask(d.keys.imgbb || ''), pollinations: mask(d.keys.pollinations || '') };
  for (const k of ['gemini', 'siliconflow', 'huggingface']) out[k] = mask(d.keys[k] || '');
  out.cloudflare = {
    accountId: d.keys.cloudflare.accountId || '',
    token: mask(d.keys.cloudflare.token || '')
  };
  return out;
}

export function setKey(field, value) {
  const d = load();
  if (field === 'cloudflare') {
    d.keys.cloudflare = { ...d.keys.cloudflare, ...(value || {}) };
  } else if (field in d.keys) {
    d.keys[field] = String(value || '').trim();
  } else {
    return false;
  }
  return true;
}

/* ---------- 用户行为与学习数据持久化 ---------- */
export function recordUserBehavior(clientId, eventList = []) {
  if (!clientId || !Array.isArray(eventList) || eventList.length === 0) return;
  const d = load();
  let u = d.users[clientId];
  if (!u) u = touchUser(clientId);
  if (!u.behaviorEvents) u.behaviorEvents = [];

  const now = Date.now();
  for (const ev of eventList) {
    if (!ev || !ev.type) continue;
    u.behaviorEvents.unshift({
      t: ev.t || now,
      type: String(ev.type).slice(0, 32),
      cat: ev.cat ? String(ev.cat).slice(0, 16) : null,
      inspId: ev.inspId ? String(ev.inspId).slice(0, 16) : null,
      tags: Array.isArray(ev.tags) ? ev.tags.slice(0, 6).map(t => String(t).slice(0, 16)) : [],
      query: ev.query ? String(ev.query).slice(0, 40) : null
    });
  }
  // 保持每个用户最近 100 条行为序列
  if (u.behaviorEvents.length > 100) u.behaviorEvents.length = 100;
  u.last = new Date().toISOString();
}

export function getUserEvents(clientId) {
  const u = getUser(clientId);
  return (u && u.behaviorEvents) || [];
}

export function getRecommendationSettings() {
  const d = load();
  return d.settings.recommendation || {
    preset: 'balanced',
    personalWeight: 0.45,
    hotnessWeight: 0.20,
    freshnessWeight: 0.15,
    exploreWeight: 0.20,
    decayHalfLifeDays: 7,
    categoryBoost: 0.15
  };
}

export function updateRecommendationSettings(patch = {}) {
  const d = load();
  if (!d.settings.recommendation) {
    d.settings.recommendation = getRecommendationSettings();
  }
  Object.assign(d.settings.recommendation, patch);
  return d.settings.recommendation;
}
