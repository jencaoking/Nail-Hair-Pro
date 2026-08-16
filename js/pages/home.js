/* 首页：探索 52 款灵感 + 智能画像专属推荐 + 类别标签过滤 + 实时搜索 + 新人引导 */
import { inspirations, dailyPicks, renderInspCard } from '../data/inspirations.js';
import { trackBehavior, getCachedPersona, fetchPersonalizedRecommendations } from '../store/userLearning.js';
import { go } from '../router.js';
import nailsPage from './nails.js';
import hairPage from './hair.js';

let currentFilter = 'all';
let searchQuery = '';
let rendered = false;

/* ⚠️ 注意：除 all/rec/hot/nail/hairColor/hairStyle 外的 key（显白/清透/秋冬/温柔）是「标签值」，
 * 必须与 data/inspirations.js 中灵感卡的 tags 字段字符串完全一致才能匹配。
 * 若运营修改了某灵感卡的标签措辞（如「显白」改「提亮显白」），对应筛选会悄悄失效，
 * 改动时请两处同步。 */
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
    // 算法推荐接口失败/超时降级为全量精选，避免筛选页静默空白
    try {
      return await fetchPersonalizedRecommendations({ limit: 18 });
    } catch (e) {
      console.warn('[home] 个性化推荐失败，降级为精选列表', e);
      return inspirations;
    }
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

  // 个性化推荐接口挂了不应让 banner 静默消失/报未捕获 rejection，降级隐藏即可
  let recs = null;
  try {
    recs = await fetchPersonalizedRecommendations({ limit: 4 });
  } catch (e) {
    console.warn('[home] 推荐 banner 加载失败', e);
    banner.hidden = true;
    return;
  }
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
      card.addEventListener('click', async () => {
        trackBehavior({ type: 'view_insp', inspId: item.id, cat: item.cat, tags: item.tags });
        if (item.cat === 'nail') {
          await go('nails');
          nailsPage.selectInsp(item.id);
        } else {
          await go('hair');
          hairPage.selectInsp(item.id);
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
    card.addEventListener('click', async () => {
      trackBehavior({ type: 'view_insp', inspId: item.id, cat: item.cat, tags: item.tags });
      // 路由并自动选中对应灵感
      if (item.cat === 'nail') {
        await go('nails');
        nailsPage.selectInsp(item.id);
      } else {
        await go('hair');
        hairPage.selectInsp(item.id);
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

export default {
  onEnter() {
    if (!rendered) {
      setupFilterBar();
      rendered = true;
    }
    renderPersonaBanner();
    renderInspirations();
  }
};

