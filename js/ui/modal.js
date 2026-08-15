/* 通用弹窗：确认框 / 自定义内容 */
let root = null;

function ensureRoot() {
  if (!root) root = document.getElementById('modal-root');
  return root;
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

  let html = '';
  if (title) html += `<h3>${title}</h3>`;
  if (closable) html += `<button class="modal-x" aria-label="关闭" title="关闭">×</button>`;
  html += `<div class="modal-body">${body}</div>`;
  if (actions && actions.length) {
    html += '<div class="modal-actions">' + actions.map(a =>
      `<button class="btn ${a.cls || 'btn-ghost'}" data-act="${a.key}">${a.label}</button>`
    ).join('') + '</div>';
  }
  modal.innerHTML = html;

  mask.appendChild(modal);
  r.appendChild(mask);

  let lastFocus = document.activeElement;

  function close() {
    mask.remove();
    document.removeEventListener('keydown', onKey);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    onClose && onClose();
  }

  function onKey(e) {
    if (e.key === 'Escape' && closable) close();
  }
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
    body: `<p>${message}</p>`,
    actions: [
      { key: 'cancel', label: cancelLabel, cls: 'btn-ghost' },
      { key: 'ok', label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: () => { onConfirm && onConfirm(); } }
    ]
  });
}
