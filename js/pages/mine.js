/* 我的：用户卡（匿名身份 + 今日额度） + 试戴记录（IndexedDB 本地保存）
 * 引擎与密钥由站长在管理后台统一配置，用户端零密钥 */
import { listHistory, deleteHistory, clearHistory } from '../store/db.js';
import { get as getSettings } from '../store/settings.js';
import { fetchConfig } from '../ai/registry.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { renderCompare } from '../ui/compare.js';
import { toast } from '../ui/toast.js';

const CAT_LABEL = { nail: '美甲', hairColor: '发色', hairStyle: '发型' };

/* ---------- 用户卡 ---------- */
async function renderUserCard() {
  const box = document.getElementById('mine-user');
  if (!box) return;
  const s = getSettings();
  const shortId = s.clientId.slice(0, 10);
  const config = await fetchConfig({ force: true });

  if (!config || !config.ok) {
    box.innerHTML = `
      <div class="user-row">
        <span class="avatar" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 64 64" fill="none" stroke="#5C4A42" stroke-width="3" stroke-linecap="round"><circle cx="32" cy="24" r="12" fill="#FFD9E3"/><path d="M14 54c2-11 9-16 18-16s16 5 18 16" fill="#C9B8F0"/></svg></span>
        <div class="who">
          <strong>小莓友 <span class="chip plain uid">${shortId}</span></strong>
          <span class="quota-line">生成服务暂时没连上，稍后再看看</span>
        </div>
      </div>`;
    return;
  }

  const used = config.usedToday || 0;
  const limit = config.dailyLimit || 0;
  const remain = Math.max(0, limit - used);
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const engine = config.primary || '配置中';

  box.innerHTML = `
    <div class="user-row">
      <span class="avatar" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 64 64" fill="none" stroke="#5C4A42" stroke-width="3" stroke-linecap="round"><circle cx="32" cy="24" r="12" fill="#FFD9E3"/><path d="M14 54c2-11 9-16 18-16s16 5 18 16" fill="#C9B8F0"/></svg></span>
      <div class="who">
        <strong>小莓友 <span class="chip plain uid">${shortId}</span></strong>
        <span class="quota-line">今天还能试 <b>${remain}</b> 次 · 引擎由站长统一提供</span>
      </div>
      <span class="chip mint engine-chip" title="当前首选引擎">${engine}</span>
    </div>
    <div class="quota-track" role="progressbar" aria-label="今日已用额度" aria-valuenow="${used}" aria-valuemin="0" aria-valuemax="${limit}">
      <div class="quota-bar" style="width:${pct}%"></div>
    </div>
    ${config.announcement ? `<p class="announce">📌 ${config.announcement}</p>` : ''}`;

  if (remain === 0 && limit > 0) {
    box.querySelector('.quota-line').innerHTML = '今天的额度用完啦，明天再来 🍓';
  }
}

/* ---------- 历史记录 ---------- */
async function renderHistory() {
  const box = document.getElementById('mine-history');
  if (!box) return;
  const list = await listHistory();

  if (!list.length) {
    box.innerHTML = `
      <div class="empty-state">
        <svg class="art" width="90" height="90" viewBox="0 0 90 90" fill="none" stroke="#C9B8F0" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><rect x="10" y="14" width="52" height="52" rx="10" fill="#EFE9FC"/><path d="M28 40h16M28 50h10" stroke="#9A857B"/><path d="M70 62c-6-2-8-8-6-14 2-5 8-7 12-4 3 3 3 9-1 12" fill="#B8E6D2"/></svg>
        <p class="msg">还没有试戴记录，先去变美吧！</p>
        <a class="btn btn-primary" href="#/nails">去试美甲</a>
      </div>`;
    return;
  }

  box.innerHTML = `<p style="font-size:.82rem;color:var(--muted);margin-bottom:10px">记录只保存在你自己的浏览器里（最多 30 条） <button class="btn btn-sm btn-ghost" data-hact="clear" style="margin-left:8px">清空记录</button></p>
    <div class="history-grid"></div>`;
  const grid = box.querySelector('.history-grid');

  list.forEach(rec => {
    const afterUrl = URL.createObjectURL(rec.afterBlob);
    const card = document.createElement('div');
    card.className = 'history-card';
    const d = new Date(rec.createdAt);
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    card.innerHTML = `
      <div class="pic"><img alt="${rec.title}试戴结果" loading="lazy" decoding="async"></div>
      <div class="meta">
        <span style="min-width:0">
          <span class="chip plain" style="margin-right:4px">${CAT_LABEL[rec.cat] || rec.cat}</span>
          <span class="t">${rec.title}</span>
          <span class="d" style="display:block">${dateStr}${rec.provider ? ' · ' + rec.provider : ''}</span>
        </span>
        <button class="del" aria-label="删除这条记录"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l1 13h9l1-13"/></svg></button>
      </div>`;
    const img = card.querySelector('img');
    img.src = afterUrl;

    card.querySelector('.pic').addEventListener('click', () => {
      const beforeUrl = URL.createObjectURL(rec.beforeBlob);
      openModal({
        title: rec.title,
        body: '<div class="cmp-slot"></div>',
        actions: [{ key: 'close', label: '关闭', cls: 'btn-primary' }]
      });
      const slot = document.querySelector('#modal-root .cmp-slot');
      if (slot) {
        renderCompare(slot, beforeUrl, afterUrl);
        slot.querySelector('.cmp').style.aspectRatio = '4 / 3';
      }
    });
    card.querySelector('.del').addEventListener('click', async () => {
      await deleteHistory(rec.id);
      toast('已删除');
      renderHistory();
    });
    grid.appendChild(card);
  });

  box.querySelector('[data-hact="clear"]').addEventListener('click', () => {
    confirmModal({
      title: '清空试戴记录？',
      message: '所有记录会一起删掉，且无法恢复。',
      confirmLabel: '清空',
      danger: true,
      onConfirm: async () => { await clearHistory(); renderHistory(); toast('已清空'); }
    });
  });
}

export default {
  onEnter() {
    renderUserCard();
    renderHistory();
  },
  onLeave() { }
};
