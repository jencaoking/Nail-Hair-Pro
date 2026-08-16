/* before / after 对比展示组件：
 * 支持 3 种对比模式：
 * 1) 经典滑块 (Slider)
 * 2) 左右并排 (Side-by-side)
 * 3) 长按对比 (Hold to compare original)
 */

export function renderCompare(containerEl, beforeUrl, afterUrl, defaultMode = 'slider') {
  if (!containerEl) return null;
  containerEl.innerHTML = '';

  // 创建外层包裹与模式切换工具条
  const wrapper = document.createElement('div');
  wrapper.className = 'cmp-wrapper';

  const modeBar = document.createElement('div');
  modeBar.className = 'cmp-mode-bar';
  modeBar.setAttribute('role', 'tablist');
  modeBar.setAttribute('aria-label', '对比模式');
  const MODES = [
    { mode: 'slider', label: '滑块对比' },
    { mode: 'side', label: '左右并排' },
    { mode: 'hold', label: '长按看原图' }
  ];
  MODES.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = m.mode === defaultMode ? 'active' : '';
    b.dataset.mode = m.mode;
    b.textContent = m.label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', m.mode === defaultMode ? 'true' : 'false');
    modeBar.appendChild(b);
  });

  const viewArea = document.createElement('div');
  viewArea.className = 'cmp-view-area';
  viewArea.setAttribute('role', 'tabpanel');

  wrapper.appendChild(modeBar);
  wrapper.appendChild(viewArea);
  containerEl.appendChild(wrapper);

  let currentMode = defaultMode;
  let sliderCleanup = null;
  let holdCleanup = null;

  function renderSliderMode() {
    viewArea.innerHTML = '';
    const cmp = document.createElement('div');
    cmp.className = 'cmp';

    const imgBefore = document.createElement('img');
    imgBefore.src = beforeUrl;
    imgBefore.alt = '试戴前照片';
    imgBefore.decoding = 'async';

    const imgAfter = document.createElement('img');
    imgAfter.className = 'cmp-after';
    imgAfter.src = afterUrl;
    imgAfter.alt = 'AI 试戴后效果';
    imgAfter.decoding = 'async';

    const line = document.createElement('div');
    line.className = 'cmp-line';
    line.setAttribute('aria-hidden', 'true');

    const knob = document.createElement('div');
    knob.className = 'cmp-knob';
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', '对比位置');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', '100');
    knob.setAttribute('aria-valuenow', '50');
    knob.tabIndex = 0;
    knob.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7 3 12l5 5M16 7l5 5-5 5"/></svg>';

    const tagB = document.createElement('span');
    tagB.className = 'cmp-tag before';
    tagB.textContent = '原来';

    const tagA = document.createElement('span');
    tagA.className = 'cmp-tag after';
    tagA.textContent = '✨ 试戴后';

    cmp.append(imgBefore, imgAfter, line, knob, tagB, tagA);
    viewArea.appendChild(cmp);

    let pos = 50;
    function setPos(p) {
      pos = Math.max(0, Math.min(100, p));
      imgAfter.style.clipPath = `inset(0 0 0 ${pos}%)`;
      line.style.left = pos + '%';
      knob.style.left = pos + '%';
      knob.setAttribute('aria-valuenow', String(Math.round(pos)));
    }
    setPos(50);

    function fromEvent(e) {
      const rect = cmp.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      setPos(((clientX - rect.left) / rect.width) * 100);
    }

    let dragging = false;
    const onPointerDown = e => {
      dragging = true;
      cmp.setPointerCapture && cmp.setPointerCapture(e.pointerId);
      fromEvent(e);
    };
    const onPointerMove = e => { if (dragging) fromEvent(e); };
    const onPointerUp = () => { dragging = false; };
    const onPointerCancel = () => { dragging = false; };

    cmp.addEventListener('pointerdown', onPointerDown);
    cmp.addEventListener('pointermove', onPointerMove);
    cmp.addEventListener('pointerup', onPointerUp);
    cmp.addEventListener('pointercancel', onPointerCancel);

    const onKeyDown = e => {
      if (e.key === 'ArrowLeft') { setPos(pos - 5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { setPos(pos + 5); e.preventDefault(); }
    };
    knob.addEventListener('keydown', onKeyDown);

    sliderCleanup = () => {
      cmp.removeEventListener('pointerdown', onPointerDown);
      cmp.removeEventListener('pointermove', onPointerMove);
      cmp.removeEventListener('pointerup', onPointerUp);
      cmp.removeEventListener('pointercancel', onPointerCancel);
      knob.removeEventListener('keydown', onKeyDown);
    };
  }

  function renderSideMode() {
    viewArea.innerHTML = '';
    const side = document.createElement('div');
    side.className = 'cmp-side-by-side';

    const makeBox = (label, url, alt, isAfter) => {
      const box = document.createElement('div');
      box.className = 'side-box';
      const lbl = document.createElement('span');
      lbl.className = 'side-label';
      if (isAfter) lbl.style.background = 'var(--primary-deep)';
      lbl.textContent = label;
      const img = document.createElement('img');
      img.src = url;                  // 属性赋值，不经 HTML 解析（避免 URL 含引号触发注入）
      img.alt = alt;
      img.decoding = 'async';
      box.append(lbl, img);
      return box;
    };

    side.append(
      makeBox('试戴前', beforeUrl, '原图', false),
      makeBox('✨ 试戴后', afterUrl, '效果图', true)
    );
    viewArea.appendChild(side);
  }

  function renderHoldMode() {
    viewArea.innerHTML = '';
    const cmp = document.createElement('div');
    cmp.className = 'cmp hold-cmp';
    cmp.style.cursor = 'pointer';
    cmp.style.position = 'relative';

    const holdImg = document.createElement('img');
    holdImg.className = 'hold-img';
    holdImg.src = afterUrl;           // 属性赋值，不经 HTML 解析
    holdImg.alt = '试戴效果';
    holdImg.style.width = '100%';
    holdImg.style.height = '100%';
    holdImg.style.objectFit = 'cover';

    const tag = document.createElement('span');
    tag.className = 'cmp-tag after';
    tag.style.top = '14px';
    tag.style.right = '14px';
    tag.textContent = '按住屏幕查看原图';

    cmp.append(holdImg, tag);
    viewArea.appendChild(cmp);

    const showBefore = () => {
      holdImg.src = beforeUrl;
      tag.textContent = '👀 正在查看原图';
      tag.style.background = 'rgba(0,0,0,0.7)';
    };
    const showAfter = () => {
      holdImg.src = afterUrl;
      tag.textContent = '按住屏幕查看原图';
      tag.style.background = '';
    };

    cmp.addEventListener('pointerdown', showBefore);
    window.addEventListener('pointerup', showAfter);
    window.addEventListener('pointercancel', showAfter);

    // 关键修复：hold 模式绑定在 window 上的监听器必须清理，否则「滑块↔长按」来回切换
    // 会在 window 上累积 2N 个 pointerup/pointercancel，并持有已销毁 DOM 的引用导致内存泄漏。
    holdCleanup = () => {
      cmp.removeEventListener('pointerdown', showBefore);
      window.removeEventListener('pointerup', showAfter);
      window.removeEventListener('pointercancel', showAfter);
    };
  }

  function switchMode(mode) {
    if (sliderCleanup) { sliderCleanup(); sliderCleanup = null; }
    if (holdCleanup) { holdCleanup(); holdCleanup = null; }
    currentMode = mode;
    modeBar.querySelectorAll('button').forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (mode === 'slider') renderSliderMode();
    else if (mode === 'side') renderSideMode();
    else if (mode === 'hold') renderHoldMode();
  }

  modeBar.addEventListener('click', e => {
    const btn = e.target.closest('[data-mode]');
    if (btn && btn.dataset.mode) switchMode(btn.dataset.mode);
  });

  switchMode(defaultMode);

  return { switchMode };
}
