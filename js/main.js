/* 入口：注册路由 / 更新引擎徽章 / 启动 */
import { registerRoutes, start } from './router.js';
import { fetchConfig, badgeText } from './ai/registry.js';
import { initTheme, bindThemeToggleBtn } from './ui/theme.js';
import home from './pages/home.js';
import nails from './pages/nails.js';
import hair from './pages/hair.js';
import mine from './pages/mine.js';

// 初始化全局暗黑/浅色主题
initTheme();
const themeBtn = document.getElementById('header-theme-toggle');
if (themeBtn) {
  bindThemeToggleBtn(themeBtn);
}

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

// 悬浮回到顶部按钮逻辑
const backToTopBtn = document.getElementById('btn-back-to-top');
if (backToTopBtn) {
  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        const shouldShow = window.scrollY > 200;
        backToTopBtn.classList.toggle('visible', shouldShow);
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }, { passive: true });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

registerRoutes({
  home: { el: document.getElementById('view-home'), page: home },
  nails: { el: document.getElementById('view-nails'), page: nails },
  hair: { el: document.getElementById('view-hair'), page: hair },
  mine: { el: document.getElementById('view-mine'), page: mine }
});

updateBadge();
start();
