/* 入口：注册路由 / 更新引擎徽章 / 启动 */
import { registerRoutes, start } from './router.js';
import { fetchConfig, badgeText } from './ai/registry.js';
import home from './pages/home.js';
import nails from './pages/nails.js';
import hair from './pages/hair.js';
import mine from './pages/mine.js';

export async function updateBadge() {
  const text = document.getElementById('provider-badge-text');
  const dot = document.querySelector('#provider-badge .dot');
  if (!text) return;
  const config = await fetchConfig({ force: true });
  text.textContent = badgeText(config);
  if (dot) dot.classList.toggle('down', !config || !config.ok);
}

document.getElementById('provider-badge').addEventListener('click', () => {
  location.hash = '#/mine';
});

registerRoutes({
  home: { el: document.getElementById('view-home'), page: home },
  nails: { el: document.getElementById('view-nails'), page: nails },
  hair: { el: document.getElementById('view-hair'), page: hair },
  mine: { el: document.getElementById('view-mine'), page: mine }
});

updateBadge();
start();
