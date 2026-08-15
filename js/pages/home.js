/* 首页：今日推荐 + 新人引导 */
import { dailyPicks, renderInspCard } from '../data/inspirations.js';
import { get as getSettings, set as setSettings } from '../store/settings.js';
import { openModal } from '../ui/modal.js';
import { go } from '../router.js';

let rendered = false;

function renderPicks() {
  if (rendered) return;
  const grid = document.getElementById('home-picks');
  if (!grid) return;
  dailyPicks(6).forEach(item => {
    const card = renderInspCard(item);
    card.addEventListener('click', () => {
      /* 首页卡片：跳到对应试戴页（美甲 / 美发） */
      go(item.cat === 'nail' ? 'nails' : 'hair');
    });
    grid.appendChild(card);
  });
  rendered = true;
}

function maybeGuide() {
  const s = getSettings();
  if (s.seenGuide) return;
  openModal({
    title: '欢迎来到莓好灵感屋',
    body: `
      <div style="display:grid;gap:12px">
        <div><span class="chip">第 1 步</span> 拍一张手部或头部照片（相册上传也行）</div>
        <div><span class="chip lav">第 2 步</span> 点一个灵感款式，或自己写描述</div>
        <div><span class="chip mint">第 3 步</span> 等 AI 施魔法，左右拖动对比效果，喜欢就保存</div>
        <p style="font-size:.8rem;color:var(--muted);margin-top:4px">免登录、免密钥，每天有免费试戴额度；引擎与额度由站长统一维护。</p>
      </div>`,
    actions: [{ key: 'go', label: '开始变美', cls: 'btn-primary', onClick: () => { setSettings({ seenGuide: true }); go('nails'); } }],
    onClose: () => setSettings({ seenGuide: true })
  });
}

export default {
  onEnter() {
    renderPicks();
    maybeGuide();
  }
};
