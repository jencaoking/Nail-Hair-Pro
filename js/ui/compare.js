/* before / after 对比滑块：拖拽 + 键盘可达 */
export function renderCompare(el, beforeUrl, afterUrl) {
  if (!el) return null;
  el.innerHTML = '';
  el.classList.add('cmp');

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
  knob.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6 3 12l6 6M15 6l6 6-6 6"/></svg>';

  const tagB = document.createElement('span');
  tagB.className = 'cmp-tag before';
  tagB.textContent = '原来';
  const tagA = document.createElement('span');
  tagA.className = 'cmp-tag after';
  tagA.textContent = '试戴后';

  el.append(imgBefore, imgAfter, line, knob, tagB, tagA);

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
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setPos(((clientX - rect.left) / rect.width) * 100);
  }

  let dragging = false;
  el.addEventListener('pointerdown', e => {
    dragging = true;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  el.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  el.addEventListener('pointerup', () => { dragging = false; });
  el.addEventListener('pointercancel', () => { dragging = false; });

  knob.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { setPos(pos - 4); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setPos(pos + 4); e.preventDefault(); }
  });

  return { setPos };
}
