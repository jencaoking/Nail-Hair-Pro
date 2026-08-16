/* =========================================================
   全局暗黑模式 (Dark Mode) 管理模块
   支持：浅色 (light) / 暗黑 (dark) / 跟随系统 (auto)
   ========================================================= */
import { toast } from './toast.js';

const STORAGE_KEY = 'theme_mode';
const listeners = new Set();

/**
 * 获取当前存储的主题模式：'light' | 'dark' | 'auto'
 */
export function getTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') {
      return saved;
    }
  } catch (e) {}
  return 'auto';
}

/**
 * 获取当前计算生效的实际主题：'light' | 'dark'
 */
export function getResolvedTheme() {
  const mode = getTheme();
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * 应用并保存主题
 * @param {'light' | 'dark' | 'auto'} mode
 * @param {boolean} [notifyUser=false]
 */
export function setTheme(mode, notifyUser = false) {
  if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') {
    mode = 'auto';
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (e) {}

  applyTheme(mode);

  if (notifyUser) {
    const resolved = getResolvedTheme();
    const names = {
      light: '浅色明亮模式 ☀️',
      dark: '漫画暗黑模式 🌙',
      auto: `跟随系统主题 (${resolved === 'dark' ? '暗黑 🌙' : '浅色 ☀️'})`
    };
    try {
      toast(`已切换至：${names[mode] || mode}`);
    } catch (e) {}
  }
}

/**
 * 切换主题：三态循环 light → dark → auto → light
 * 之前的实现只做 light<->dark 二态切换，会把「跟随系统(auto)」用户悄悄切换成固定主题，
 * 退出跟随系统状态。改成三态循环后 auto 仍是可达状态，不会丢失。
 * @param {boolean} [notifyUser=true]
 */
export function toggleTheme(notifyUser = true) {
  const mode = getTheme();
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light';
  setTheme(next, notifyUser);
  return next;
}

/**
 * 订阅主题变更事件
 * @param {(mode: string, resolved: string) => void} fn
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 实际应用样式属性至 documentElement 与 body
 */
function applyTheme(mode) {
  const resolved = getResolvedTheme();
  const root = document.documentElement;

  if (mode === 'auto') {
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-setting', 'auto');
  } else {
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-setting', mode);
  }

  // 同步 body class 以防部分特定 CSS 框架选择器需要
  if (document.body) {
    document.body.classList.toggle('dark', resolved === 'dark');
    document.body.classList.toggle('dark-theme', resolved === 'dark');
  }

  // 通知所有订阅者更新 UI（例如按钮图标、选项高亮）
  listeners.forEach(fn => {
    try { fn(mode, resolved); } catch (err) { console.error('Theme listener error:', err); }
  });
}

/**
 * 初始化全局主题监听器
 */
export function initTheme() {
  const current = getTheme();
  applyTheme(current);

  // 监听操作系统系统级暗黑模式切换
  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getTheme() === 'auto') {
        applyTheme('auto');
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', handler);
    } else if (media.addListener) {
      media.addListener(handler);
    }
  }

  // 监听跨标签页 storage 同步
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      applyTheme(getTheme());
    }
  });
}

/**
 * 绑定通用切换按钮
 * @param {HTMLElement} btn
 */
export function bindThemeToggleBtn(btn) {
  if (!btn) return;
  const updateBtn = () => {
    const mode = getTheme();
    const resolved = getResolvedTheme();
    const icon = resolved === 'dark' ? '🌙' : '☀️';
    const text = mode === 'auto' ? `跟随系统 (${resolved === 'dark' ? '暗黑' : '浅色'})` : (mode === 'dark' ? '暗黑模式' : '浅色明亮');
    btn.innerHTML = `<span class="theme-icon" aria-hidden="true">${icon}</span><span class="sr-only">${text}</span>`;
    btn.setAttribute('title', `当前：${text}，点击切换主题（浅色 → 暗黑 → 跟随系统）`);
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme(true);
    updateBtn();
  });

  onThemeChange(() => updateBtn());
  updateBtn();
}

