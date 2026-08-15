/* 服务端配置拉取：可用引擎 / 今日额度（密钥永不离开服务端） */
import { getClientId } from '../store/settings.js';

let cache = null;
let inflight = null;

export function fetchConfig({ force = false } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/config?clientId=' + encodeURIComponent(getClientId()))
    .then(r => r.json())
    .then(j => {
      cache = j && j.ok ? j : null;
      return cache;
    })
    .catch(() => null)
    .finally(() => { inflight = null; });
  return inflight;
}

export function badgeText(config) {
  if (!config) return '服务未连接';
  if (!config.engines || !config.engines.length) return '引擎配置中';
  const rawLabel = config.engines[0].label || 'AI 引擎';
  const cleanName = rawLabel.replace(/[\(（][^)]*?[\)）]/g, '').trim();
  return '自动 · ' + (cleanName || rawLabel);
}

/* 生成成功后刷新额度缓存（今日 +1） */
export function bumpUsage() {
  if (cache && typeof cache.usedToday === 'number') cache.usedToday += 1;
}
