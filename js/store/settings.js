/* 用户本地存储：匿名 clientId（服务端记账用）+ 引导标记
 * 引擎密钥已全部移到服务端，浏览器不再保存任何密钥 */
const KEY = 'ti.settings.v2';

function genId() {
  try {
    const u = crypto.randomUUID ? crypto.randomUUID() : null;
    if (u) return 'u' + u.replace(/-/g, '').slice(0, 20);
  } catch { /* 老浏览器走随机数 */ }
  return 'u' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

const DEFAULTS = { clientId: '', seenGuide: false, enhance: false };

export function get() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...structuredClone(DEFAULTS), ...saved };
    if (!s.clientId) {
      s.clientId = genId();
      localStorage.setItem(KEY, JSON.stringify(s));
    }
    return s;
  } catch {
    return { ...structuredClone(DEFAULTS), clientId: genId() };
  }
}

export function set(patch) {
  const next = { ...get(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const getClientId = () => get().clientId;
export const isEnhance = () => !!get().enhance;
