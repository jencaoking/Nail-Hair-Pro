/* 首页：探索 52 款灵感 + 智能画像专属推荐 + 类别标签过滤 + 实时搜索 + 新人引导 */
import { inspirations, dailyPicks, renderInspCard } from '../data/inspirations.js';
import { get as getSettings, set as setSettings } from '../store/settings.js';
import { trackBehavior, getCachedPersona, fetchPersonalizedRecommendations } from '../store/userLearning.js';
import { openModal } from '../ui/modal.js';
import { go } from '../router.js';
import nailsPage from './nails.js';
import hairPage from './hair.js';

let currentFilter = 'all';
let searchQuery = '';
let rendered = false;

const FILTER_TAGS = [
  { key: 'all', label: '全部精选 (52)' },
  { key: 'rec', label: '🎯 算法推荐' },
  { key: 'hot', label: '🔥 热门必试' },
  { key: 'nail', label: '💅 美甲款式 (24)' },
  { key: 'hairColor', label: '🎨 潮流发色 (16)' },
  { key: 'hairStyle', label: '💇 流行发型 (12)' },
  { key: '显白', label: '✨ 显白气质' },
  { key: '清透', label: '💧 日系清透' },
  { key: '秋冬', label: '🍂 秋冬复古' },
  { key: '温柔', label: '🌸 温柔少女' }
];

async function getFilteredList() {
  if (currentFilter === 'rec') {
    return await fetchPersonalizedRecommendations({ limit: 18 });
  }

  let list = inspirations;
  if (currentFilter === 'hot') {
    list = list.filter(i => i.hot);
  } else if (currentFilter === 'nail' || currentFilter === 'hairColor' || currentFilter === 'hairStyle') {
    list = list.filter(i => i.cat === currentFilter);
  } else if (currentFilter !== 'all') {
    list = list.filter(i => i.tags && i.tags.includes(currentFilter));
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.tags && i.tags.some(t => t.toLowerCase().includes(q))) ||
      i.prompt.toLowerCase().includes(q)
    );
  }

  return list;
}

async function renderPersonaBanner() {
  const banner = document.getElementById('home-persona-banner');
  const badgeEl = document.getElementById('home-persona-badge');
  const titleEl = document.getElementById('home-persona-title');
  const confEl = document.getElementById('home-persona-conf');
  const descEl = document.getElementById('home-persona-desc');
  const recsBox = document.getElementById('home-persona-recs');

  if (!banner || !recsBox) return;

  const recs = await fetchPersonalizedRecommendations({ limit: 4 });
  const persona = getCachedPersona();

  if (recs && recs.length > 0) {
    banner.hidden = false;
    badgeEl.textContent = persona.personaBadge || '✨ 灵感推荐';
    titleEl.textContent = persona.confidence > 25
      ? `为你量身定制的专属款式（${persona.personaName}）`
      : '今日精选灵感款式推荐';
    confEl.textContent = persona.confidence > 0 ? `画像匹配度 ${persona.confidence}%` : '初次体验中';
    descEl.textContent = persona.personaDesc || '推荐算法基于你的浏览与试戴偏好实时计算最佳搭配';

    recsBox.innerHTML = '';
    recs.forEach(item => {
      const card = renderInspCard(item);
      card.addEventListener('click', () => {
        trackBehavior({ type: 'view_insp', inspId: item.id, cat: item.cat, tags: item.tags });
        if (item.cat === 'nail') {
          go('nails');
          setTimeout(() => nailsPage.selectInsp(item.id), 50);
        } else {
          go('hair');
          setTimeout(() => hairPage.selectInsp(item.id), 50);
        }
      });
      recsBox.appendChild(card);
    });
  }
}

async function renderInspirations() {
  const grid = document.getElementById('home-picks');
  if (!grid) return;
  grid.innerHTML = '';

  const list = await getFilteredList();
  if (list.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 16px;color:var(--muted)">
        <p style="font-size:1.05rem;font-weight:600;color:var(--ink-strong)">没有找到匹配的灵感款式</p>
        <p style="font-size:0.88rem;margin-top:4px">换个关键词搜搜看，或者切换分类标签～</p>
      </div>`;
    return;
  }

  list.forEach(item => {
    const card = renderInspCard(item);
    card.addEventListener('click', () => {
      trackBehavior({ type: 'view_insp', inspId: item.id, cat: item.cat, tags: item.tags });
      // 路由并自动选中对应灵感
      if (item.cat === 'nail') {
        go('nails');
        setTimeout(() => nailsPage.selectInsp(item.id), 50);
      } else {
        go('hair');
        setTimeout(() => hairPage.selectInsp(item.id), 50);
      }
    });
    grid.appendChild(card);
  });
}

function setupFilterBar() {
  const filterBox = document.getElementById('home-filter-tags');
  const searchInput = document.getElementById('home-search-input');
  if (!filterBox) return;

  filterBox.innerHTML = FILTER_TAGS.map(f =>
    `<button type="button" class="home-filter-chip ${f.key === currentFilter ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
  ).join('');

  filterBox.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    trackBehavior({ type: 'search_tag', query: currentFilter });
    filterBox.querySelectorAll('.home-filter-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
    renderInspirations();
  });

  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        if (searchQuery.trim().length > 1) {
          trackBehavior({ type: 'search_tag', query: searchQuery.trim() });
        }
        renderInspirations();
      }, 300);
    });
  }
}

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

export default {
  onEnter() {
    if (!rendered) {
      setupFilterBar();
      rendered = true;
    }
    renderPersonaBanner();
    renderInspirations();
    maybeGuide();
  }
};

