/* 我的：用户卡（匿名身份 + 今日额度） + 试戴记录（IndexedDB 本地保存）
 * 引擎与密钥由站长在管理后台统一配置，用户端零门槛
 */
import { listHistory, deleteHistory, clearHistory } from '../store/db.js';
import { get as getSettings, set as setSettings } from '../store/settings.js';
import { fetchConfig } from '../ai/registry.js';
import { getTheme, setTheme, onThemeChange } from '../ui/theme.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { renderCompare } from '../ui/compare.js';
import { toast } from '../ui/toast.js';

const CAT_LABEL = { nail: '美甲', hairColor: '发色', hairStyle: '发型' };
let currentHistoryFilter = 'all';

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
        <span class="avatar" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 64 64" fill="none" stroke="#F43F6E" stroke-width="2.6" stroke-linecap="round"><circle cx="32" cy="24" r="12" fill="#FFE4EC"/><path d="M14 54c2-11 9-16 18-16s16 5 18 16" fill="#F3E8FF"/></svg>
        </span>
        <div class="who">
          <strong>小莓友 <span class="chip plain uid">${shortId}</span></strong>
          <span class="quota-line">服务正在连接中…</span>
        </div>
      </div>`;
    return;
  }

  const used = config.usedToday || 0;
  const limit = config.dailyLimit || 0;
  const bonus = config.bonusQuota || 0;
  const isCustom = !!config.isCustomLimit;
  const remain = Math.max(0, limit - used);
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const engine = config.primary || '自动优化';

  const bonusBadge = bonus > 0 ? `<span class="chip" style="background:#e6fffa;color:#234e52;border-color:#319795;font-size:0.75rem;padding:2px 6px">🎁 赠送 +${bonus}次</span>` : '';
  const customBadge = isCustom ? `<span class="chip" style="background:#feebc8;color:#9c4221;border-color:#dd6b20;font-size:0.75rem;padding:2px 6px">⭐ 专属配额</span>` : '';

  box.innerHTML = `
    <div class="user-row">
      <span class="avatar" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 64 64" fill="none" stroke="#F43F6E" stroke-width="2.6" stroke-linecap="round"><circle cx="32" cy="24" r="12" fill="#FFE4EC"/><path d="M14 54c2-11 9-16 18-16s16 5 18 16" fill="#F3E8FF"/></svg>
      </span>
      <div class="who">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <strong>小莓友 <span class="chip plain uid">ID: ${shortId}</span></strong>
          ${customBadge}
          ${bonusBadge}
        </div>
        <span class="quota-line">今日剩余试戴 <b>${remain}</b> 次 / 共 ${limit} 次</span>
      </div>
      <span class="chip mint engine-chip" title="首选 AI 引擎">✨ ${engine}</span>
    </div>
    <div class="quota-track" role="progressbar" aria-label="今日已用额度" aria-valuenow="${used}" aria-valuemin="0" aria-valuemax="${limit}">
      <div class="quota-bar" style="width:${pct}%"></div>
    </div>
    ${config.announcement ? `<p class="announce">📌 ${config.announcement}</p>` : ''}
    <div style="margin-top:16px;padding-top:14px;border-top:2px dashed var(--border-ink)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span style="font-family:var(--font-title);font-size:0.92rem;font-weight:900;color:var(--ink-strong)">🎨 外观主题模式</span>
        <span style="font-size:0.78rem;font-weight:700;color:var(--muted)">实时生效并自动保存</span>
      </div>
      <div class="theme-selector-group" id="mine-theme-selector">
        <button type="button" class="theme-option-btn ${getTheme() === 'light' ? 'active' : ''}" data-theme-val="light">
          <span>☀️</span> 浅色明亮
        </button>
        <button type="button" class="theme-option-btn ${getTheme() === 'dark' ? 'active' : ''}" data-theme-val="dark">
          <span>🌙</span> 漫画暗黑
        </button>
        <button type="button" class="theme-option-btn ${getTheme() === 'auto' ? 'active' : ''}" data-theme-val="auto">
          <span>🌓</span> 跟随系统
        </button>
      </div>
    </div>
    <label class="enhance-row" style="display:flex;align-items:center;gap:10px;margin-top:14px;font-size:0.88rem;color:var(--ink);cursor:pointer">
      <input type="checkbox" id="enhance-toggle" ${s.enhance ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--primary)">
      <span><strong>画质增强模式</strong>（自动进行主体聚焦、边缘信息熵补偿与自适应光照校正）</span>
    </label>`;

  const themeGroup = box.querySelector('#mine-theme-selector');
  if (themeGroup) {
    const updateOptionActive = (currentVal) => {
      themeGroup.querySelectorAll('.theme-option-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.themeVal === currentVal);
      });
    };

    themeGroup.addEventListener('click', e => {
      const btn = e.target.closest('[data-theme-val]');
      if (!btn) return;
      const val = btn.dataset.themeVal;
      setTheme(val, true);
      updateOptionActive(val);
    });

    onThemeChange((mode) => {
      updateOptionActive(mode);
    });
  }

  box.querySelector('#enhance-toggle').addEventListener('change', e => {
    setSettings({ enhance: e.target.checked });
    toast(e.target.checked ? '已开启画质增强模式' : '已关闭画质增强模式');
  });

  if (remain === 0 && limit > 0) {
    box.querySelector('.quota-line').innerHTML = '今天的试戴额度已用完，明天 0 点自动刷新 🍓';
  }
}

/* ---------- 历史记录 ---------- */
async function renderHistory() {
  const box = document.getElementById('mine-history');
  if (!box) return;
  const rawList = await listHistory();

  let list = rawList;
  if (currentHistoryFilter === 'nail') {
    list = rawList.filter(r => r.cat === 'nail');
  } else if (currentHistoryFilter === 'hair') {
    list = rawList.filter(r => r.cat === 'hairColor' || r.cat === 'hairStyle');
  }

  if (!rawList.length) {
    box.innerHTML = `
      <div class="empty-state">
        <svg class="art" width="90" height="90" viewBox="0 0 90 90" fill="none" stroke="#F43F6E" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="10" y="14" width="54" height="54" rx="14" fill="#FFE4EC"/><path d="M30 40h16M30 50h10" stroke="#7E6F75"/><path d="M72 64c-6-2-8-8-6-14 2-5 8-7 12-4 3 3 3 9-1 12" fill="#D1FAE5"/></svg>
        <p class="msg">暂无试戴记录</p>
        <p class="sub-msg">去挑选一个喜欢的款式，体验 AI 试戴的魅力吧！</p>
        <a class="btn btn-primary" href="#/nails">去试美甲 ✨</a>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="subtabs" style="margin-bottom:0">
        <button type="button" class="${currentHistoryFilter === 'all' ? 'active' : ''}" data-hfilter="all" aria-selected="${currentHistoryFilter === 'all'}">全部 (${rawList.length})</button>
        <button type="button" class="${currentHistoryFilter === 'nail' ? 'active' : ''}" data-hfilter="nail" aria-selected="${currentHistoryFilter === 'nail'}">美甲</button>
        <button type="button" class="${currentHistoryFilter === 'hair' ? 'active' : ''}" data-hfilter="hair" aria-selected="${currentHistoryFilter === 'hair'}">美发</button>
      </div>
      <button class="btn btn-sm btn-ghost" data-hact="clear" style="color:var(--danger)">清空所有记录</button>
    </div>
    <div class="history-grid"></div>
  `;

  const tabs = box.querySelector('.subtabs');
  tabs.addEventListener('click', e => {
    const btn = e.target.closest('[data-hfilter]');
    if (!btn || btn.dataset.hfilter === currentHistoryFilter) return;
    currentHistoryFilter = btn.dataset.hfilter;
    renderHistory();
  });

  const grid = box.querySelector('.history-grid');
  list.forEach(rec => {
    const afterUrl = URL.createObjectURL(rec.afterBlob);
    const card = document.createElement('div');
    card.className = 'history-card';
    const d = new Date(rec.createdAt);
    const dateStr = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    card.innerHTML = `
      <div class="pic" title="点击查看前后对比">
        <img alt="${rec.title}试戴结果" loading="lazy" decoding="async">
      </div>
      <div class="meta">
        <span style="min-width:0">
          <span class="chip plain" style="margin-right:4px">${CAT_LABEL[rec.cat] || rec.cat}</span>
          <span class="t">${rec.title}</span>
          <span class="d" style="display:block">${dateStr}${rec.provider ? ' · ' + rec.provider : ''}</span>
        </span>
        <div style="display:flex;align-items:center;gap:4px">
          <a class="del" download="tryon-${rec.id}.jpg" href="${afterUrl}" title="下载效果图" style="color:var(--primary)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </a>
          <button class="del" aria-label="删除这条记录" title="删除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l1 13h9l1-13"/></svg>
          </button>
        </div>
      </div>`;

    const img = card.querySelector('img');
    img.src = afterUrl;

    card.querySelector('.pic').addEventListener('click', () => {
      const beforeUrl = URL.createObjectURL(rec.beforeBlob);
      openModal({
        title: `对比效果：${rec.title}`,
        body: '<div class="cmp-slot" style="aspect-ratio:4/3;border-radius:12px;overflow:hidden"></div>',
        actions: [{ key: 'close', label: '关闭', cls: 'btn-primary' }]
      });
      const slot = document.querySelector('#modal-root .cmp-slot');
      if (slot) {
        renderCompare(slot, beforeUrl, afterUrl, 'slider');
      }
    });

    card.querySelector('button.del').addEventListener('click', async e => {
      e.stopPropagation();
      await deleteHistory(rec.id);
      toast('已删除该记录');
      renderHistory();
    });

    grid.appendChild(card);
  });

  box.querySelector('[data-hact="clear"]').addEventListener('click', () => {
    confirmModal({
      title: '清空试戴记录？',
      message: '本地所有的试戴记录将被彻底删除且无法找回，确认要清空吗？',
      confirmLabel: '确认清空',
      danger: true,
      onConfirm: async () => {
        await clearHistory();
        renderHistory();
        toast('所有记录已清空');
      }
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
