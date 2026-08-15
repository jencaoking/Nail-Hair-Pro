/* 数据持久化：server/data.json（密钥 / 用户 / 统计 / 站点设置 / 管理员口令）
 * 写入采用 临时文件 + rename，尽量原子 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'data.json');
const TMP = FILE + '.tmp';

export const DEFAULT_PASSWORD = 'admin123';

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

export function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const def = DEFAULTS();
    cache = {
      ...def,
      ...raw,
      settings: { ...def.settings, ...(raw.settings || {}) },
      keys: {
        ...def.keys,
        ...(raw.keys || {}),
        gemini: (raw.keys && raw.keys.gemini) || def.keys.gemini,
        pollinations: (raw.keys && raw.keys.pollinations) || def.keys.pollinations,
        siliconflow: (raw.keys && raw.keys.siliconflow) || def.keys.siliconflow,
        huggingface: (raw.keys && raw.keys.huggingface) || def.keys.huggingface,
        imgbb: (raw.keys && raw.keys.imgbb) || def.keys.imgbb,
        cloudflare: {
          accountId: (raw.keys && raw.keys.cloudflare && raw.keys.cloudflare.accountId) || def.keys.cloudflare.accountId,
          token: (raw.keys && raw.keys.cloudflare && raw.keys.cloudflare.token) || def.keys.cloudflare.token
        }
      },
      stats: { ...def.stats, ...(raw.stats || {}) }
    };
  } catch {
    cache = DEFAULTS();
  }
  return cache;
}

export function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(TMP, JSON.stringify(cache, null, 2));
  fs.renameSync(TMP, FILE);
  dirty = false;
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

