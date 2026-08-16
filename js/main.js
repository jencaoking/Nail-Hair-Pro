/* 入口：注册路由 / 更新引擎徽章 / 启动 */
import { registerRoutes, start, go } from './router.js';
import { fetchConfig, badgeText } from './ai/registry.js';
import { initTheme, bindThemeToggleBtn } from './ui/theme.js';
import { get as getSettings, set as setSettings } from './store/settings.js';
import { openModal } from './ui/modal.js';
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

/* 新人引导：放在全局入口而非仅首页 onEnter，确保用户首次通过分享链接直接进入
 * 试戴页（#/nails、#/hair）等任意路由时都能看到引导，而不是只有首页才触发。 */
function maybeGuide() {
  const s = getSettings();
  if (s.seenGuide) return;
  openModal({
    title: '✨ 欢迎来到莓好灵感屋',
    body: `
      <div style="display:grid;gap:14px;padding:4px 0">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span class="chip" style="flex-shrink:0;margin-top:2px">第 1 步</span>
          <div><strong>拍摄或上传照片</strong>：拍一张手部或面部清晰照片，也支持从相册选择或一键试用模特照片。</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span class="chip lav" style="flex-shrink:0;margin-top:2px">第 2 步</span>
          <div><strong>挑选心仪款式</strong>：点击 52 款精选灵感（猫眼、法式、锁骨发等），或自由输入文字描述。</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span class="chip mint" style="flex-shrink:0;margin-top:2px">第 3 步</span>
          <div><strong>查看前后对比</strong>：左右拖动滑块或并排查看试戴效果，喜欢即可一键保存。</div>
        </div>
        <p style="font-size:0.82rem;color:var(--muted);margin-top:6px;background:var(--bg-subtle);padding:8px 12px;border-radius:var(--r-s)">
          🔒 免登录、免配置，每日提供免费试戴体验。
        </p>
      </div>`,
    actions: [
      {
        key: 'go',
        label: '立即开启体验 ✨',
        cls: 'btn-primary',
        onClick: () => {
          setSettings({ seenGuide: true });
          go('nails');
        }
      }
    ],
    onClose: () => setSettings({ seenGuide: true })
  });
}

updateBadge();
start();
maybeGuide();
