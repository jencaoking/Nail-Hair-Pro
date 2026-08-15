/* 美发试戴页：复用试戴工厂，含「发色 / 发型」子标签 */
import { createTryOnPage } from './nails.js';
import { byCat } from '../data/inspirations.js';

let currentSub = 'hairColor';

const page = createTryOnPage({
  cat: 'hairColor',
  getCat: () => currentSub,
  sourceEl: '#hair-source',
  resultEl: '#hair-result',
  stripEl: '#hair-strip',
  aspect: 'portrait',
  phrases: ['正在分析发型…', '魔法换色中…', '快好了，再等等…'],
  emptyTip: '拍一张头部照片，发色发型随心试',
  customPlaceholder: '想试的样子，例如：奶茶灰大波浪'
});

/* 子标签：发色 / 发型 */
const head = document.querySelector('#view-hair .page-head');
const tabs = document.createElement('div');
tabs.className = 'subtabs';
tabs.setAttribute('role', 'tablist');
tabs.setAttribute('aria-label', '发色或发型');
tabs.innerHTML = `
  <button role="tab" aria-selected="true" data-sub="hairColor">发色</button>
  <button role="tab" aria-selected="false" data-sub="hairStyle">发型</button>`;
head.appendChild(tabs);

const stripEl = document.querySelector('#hair-strip');
function renderStrip() {
  stripEl.innerHTML = '';
  byCat(currentSub).forEach(item => stripEl.appendChild(page.makeCard(item)));
}
renderStrip();

tabs.addEventListener('click', e => {
  const btn = e.target.closest('[data-sub]');
  if (!btn || btn.dataset.sub === currentSub) return;
  currentSub = btn.dataset.sub;
  tabs.querySelectorAll('[data-sub]').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.sub === currentSub)));
  renderStrip();
});

export default { onEnter: page.onEnter, onLeave: page.onLeave };
