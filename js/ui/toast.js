/* toast 提示 */
let root = null;

function ensureRoot() {
  if (!root) root = document.getElementById('toast-root');
  return root;
}

export function toast(message, type = '') {
  const r = ensureRoot();
  if (!r) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  r.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

export const ok = m => toast(m, 'ok');
export const err = m => toast(m, 'err');
