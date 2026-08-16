/* toast 提示 */
let root = null;
const MAX_TOASTS = 4;   // 最大同时展示数量，超出时移除最早的一条，避免刷屏

function ensureRoot() {
  if (!root) root = document.getElementById('toast-root');
  return root;
}

export function toast(message, type = '') {
  const r = ensureRoot();
  if (!r) return;

  // 堆叠数量控制：超出上限先移除最早的一条
  while (r.children.length >= MAX_TOASTS) {
    r.firstElementChild.remove();
  }

  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;   // 纯文本赋值，不解析 HTML（防 XSS）
  r.appendChild(el);

  // 显示 2.6s 后触发淡出；淡出结束（transitionend）时移除，时长与 CSS 单一数据源。
  // 另设一个兜底 timer，防止个别环境不触发 transitionend 导致残留。
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

export const ok = m => toast(m, 'ok');
export const err = m => toast(m, 'err');
