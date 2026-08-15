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
    announcement: ''                               // 公告（可选，展示在用户端）
  },
  keys: {
    pollinations: '',                               // 可选：Pollinations Token（解锁 kontext）
    gemini: '',
    siliconflow: '',
    cloudflare: { accountId: '', token: '' },
    huggingface: '',
    imgbb: ''
  },
  users: {},                                       // clientId → 记录
  stats: { total: 0, ok: 0, fail: 0, byProvider: {}, events: [] }
});

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = { ...DEFAULTS(), ...raw, settings: { ...DEFAULTS().settings, ...(raw.settings || {}) }, keys: { ...DEFAULTS().keys, ...(raw.keys || {}) }, stats: { ...DEFAULTS().stats, ...(raw.stats || {}) } };
  } catch {
    cache = DEFAULTS();
  }
  return cache;
}

export function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(TMP, JSON.stringify(cache, null, 2));
  fs.renameSync(TMP, FILE);
}

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

export function touchUser(clientId, { count = 0 } = {}) {
  const d = load();
  const now = new Date().toISOString();
  let u = d.users[clientId];
  if (!u) {
    u = d.users[clientId] = { first: now, last: now, total: 0, day: today(), dayCount: 0, blocked: false, note: '' };
  }
  u.last = now;
  if (u.day !== today()) { u.day = today(); u.dayCount = 0; }
  if (count > 0) { u.total += count; u.dayCount += count; }
  return u;
}

export function getUser(clientId) { return load().users[clientId] || null; }

export function markUser(clientId, patch) {
  const d = load();
  if (!d.users[clientId]) touchUser(clientId);
  Object.assign(d.users[clientId], patch || {});
  return d.users[clientId];
}

export function listUsers() {
  const d = load();
  return Object.entries(d.users)
    .map(([id, u]) => ({ id, ...u }))
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
