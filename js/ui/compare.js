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
  modeBar.innerHTML = `
    <button type="button" class="${defaultMode === 'slider' ? 'active' : ''}" data-mode="slider">滑块对比</button>
    <button type="button" class="${defaultMode === 'side' ? 'active' : ''}" data-mode="side">左右并排</button>
    <button type="button" class="${defaultMode === 'hold' ? 'active' : ''}" data-mode="hold">长按看原图</button>
  `;

  const viewArea = document.createElement('div');
  viewArea.className = 'cmp-view-area';

  wrapper.appendChild(modeBar);
  wrapper.appendChild(viewArea);
  containerEl.appendChild(wrapper);

  let currentMode = defaultMode;
  let sliderCleanup = null;

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
    viewArea.innerHTML = `
      <div class="cmp-side-by-side">
        <div class="side-box">
          <span class="side-label">试戴前</span>
          <img src="${beforeUrl}" alt="原图" decoding="async">
        </div>
        <div class="side-box">
          <span class="side-label" style="background:var(--primary-deep)">✨ 试戴后</span>
          <img src="${afterUrl}" alt="效果图" decoding="async">
        </div>
      </div>
    `;
  }

  function renderHoldMode() {
    viewArea.innerHTML = `
      <div class="cmp hold-cmp" style="cursor:pointer;position:relative">
        <img class="hold-img" src="${afterUrl}" alt="试戴效果" style="width:100%;height:100%;object-fit:cover">
        <span class="cmp-tag after" style="top:14px;right:14px">按住屏幕查看原图</span>
      </div>
    `;
    const holdBox = viewArea.querySelector('.hold-cmp');
    const holdImg = viewArea.querySelector('.hold-img');
    const tag = viewArea.querySelector('.cmp-tag');

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

    holdBox.addEventListener('pointerdown', showBefore);
    window.addEventListener('pointerup', showAfter);
    window.addEventListener('pointercancel', showAfter);
  }

  function switchMode(mode) {
    if (sliderCleanup) { sliderCleanup(); sliderCleanup = null; }
    currentMode = mode;
    modeBar.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
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
