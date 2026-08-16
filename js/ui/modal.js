/* 通用弹窗：确认框 / 自定义内容
 *
 * ⚠️ 安全约定（重要）：
 *   - title / message / a.label 均为「纯文本」字段，一律用 textContent 赋值，绝不拼进 innerHTML。
 *     历史教训：曾用 `<h3>${title}</h3>` 拼接，用户自定义描述经「历史记录 → 弹窗标题回显」
 *     可注入 `<img onerror=...>` 触发存储型 XSS。
 *   - body 是唯一允许富文本的字段（调用方传站内硬编码 HTML），用 innerHTML 插入——
 *     调用方必须自行保证 body 内容可信或已转义。
 *   - 提供焦点陷阱（Tab 循环）与弹窗栈（ESC 只关最上层），解决叠加弹窗互相干扰。 */

let root = null;
const modalStack = [];   // 弹窗栈：记录打开顺序，ESC 只作用于栈顶

function ensureRoot() {
  if (!root) root = document.getElementById('modal-root');
  return root;
}

/* HTML 转义：供 confirmModal 的 message 等纯文本字段在进入 body(富文本) 通道前使用 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function openModal({ title, body, actions, onClose, closable = true }) {
  const r = ensureRoot();
  if (!r) return null;

  const mask = document.createElement('div');
  mask.className = 'modal-mask';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title) modal.setAttribute('aria-label', title);

  // 标题：纯文本，textContent 安全赋值
  if (title) {
    const h3 = document.createElement('h3');
    h3.textContent = title;
    modal.appendChild(h3);
  }

  // 关闭按钮
  if (closable) {
    const xBtn = document.createElement('button');
    xBtn.className = 'modal-x';
    xBtn.setAttribute('aria-label', '关闭');
    xBtn.setAttribute('title', '关闭');
    xBtn.textContent = '×';
    modal.appendChild(xBtn);
  }

  // 正文：富文本字段，innerHTML 插入（调用方保证可信）
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  bodyEl.innerHTML = body || '';
  modal.appendChild(bodyEl);

  // 操作按钮：label 纯文本，textContent 安全赋值
  if (actions && actions.length) {
    const bar = document.createElement('div');
    bar.className = 'modal-actions';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.cls || 'btn-ghost');
      btn.dataset.act = a.key;
      btn.textContent = a.label;
      bar.appendChild(btn);
    });
    modal.appendChild(bar);
  }

  mask.appendChild(modal);
  r.appendChild(mask);

  const lastFocus = document.activeElement;

  /* 可聚焦元素列表（用于焦点陷阱），排除 disabled 与不可见元素 */
  const getFocusables = () => {
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return [...modal.querySelectorAll(sel)].filter(el => !el.disabled && el.offsetParent !== null);
  };

  let entry = null;

  function close() {
    const idx = modalStack.indexOf(entry);
    if (idx >= 0) modalStack.splice(idx, 1);
    document.removeEventListener('keydown', onKey);
    mask.remove();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    onClose && onClose();
  }

  function onKey(e) {
    // ESC：只让栈顶（最上层）弹窗响应，避免叠加时一次 ESC 关掉多个
    if (e.key === 'Escape') {
      if (modalStack[modalStack.length - 1] !== entry) return;
      if (closable) close();
      return;
    }
    // Tab：焦点陷阱，让焦点在弹窗内第一个/最后一个可聚焦元素间循环
    if (e.key === 'Tab') {
      const f = getFocusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !modal.contains(active)) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last || !modal.contains(active)) { e.preventDefault(); first.focus(); }
      }
    }
  }

  entry = { close };
  modalStack.push(entry);
  document.addEventListener('keydown', onKey);

  if (closable) mask.addEventListener('click', e => { if (e.target === mask) close(); });
  const xBtn = modal.querySelector('.modal-x');
  if (xBtn) xBtn.addEventListener('click', close);

  const buttons = {};
  (actions || []).forEach(a => {
    const btn = modal.querySelector(`[data-act="${a.key}"]`);
    if (btn) btn.addEventListener('click', () => {
      if (a.onClick) { const keep = a.onClick(close); if (keep === false) return; } else close();
    });
    buttons[a.key] = btn;
  });

  const firstBtn = modal.querySelector('button');
  if (firstBtn) firstBtn.focus();

  return { close, modal, buttons };
}

export function confirmModal({ title, message, confirmLabel = '确定', cancelLabel = '取消', danger = false, onConfirm }) {
  return openModal({
    title,
    // message 为纯文本：先 HTML 转义，再包进 <p>（body 富文本通道，但内容已安全）
    body: `<p>${esc(message)}</p>`,
    actions: [
      { key: 'cancel', label: cancelLabel, cls: 'btn-ghost' },
      { key: 'ok', label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => { onConfirm && onConfirm(); } }
    ]
  });
}
