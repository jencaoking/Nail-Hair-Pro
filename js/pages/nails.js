/* 通用试戴流程工厂（美甲页默认实例；hair.js 复用）
 * 状态机：empty → camera / photo → generating → result / error */
import { cameraSupported, createCamera, explainCameraError } from '../capture/camera.js';
import { toJpegBlob } from '../capture/preprocess.js';
import { isEnhance } from '../store/settings.js';
import { renderInspCard, byId, byCat } from '../data/inspirations.js';
import { buildPrompt, genSize } from '../data/prompts.js';
import { tryOn } from '../ai/api.js';
import { normalizeError, copyFor } from '../ai/errors.js';
import { bumpUsage } from '../ai/registry.js';
import { renderCompare } from '../ui/compare.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { addHistory } from '../store/db.js';
import { go } from '../router.js';

const HEART_SVG = `<svg width="44" height="44" viewBox="0 0 24 24" fill="#FF9BB3" stroke="#5C4A42" stroke-width="1.6" aria-hidden="true"><path d="M12 20.5C7 16.5 3.5 13.4 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3 .8 4 2.1C13 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.8-3.5 6.9-8.5 10.9z"/></svg>`;

export function createTryOnPage(opts) {
  const { cat, aspect, phrases, emptyTip, customPlaceholder, getCat } = opts;
  const sourceEl = document.querySelector(opts.sourceEl);
  const resultEl = document.querySelector(opts.resultEl);
  const stripEl = document.querySelector(opts.stripEl);

  let photoBlob = null;
  let photoUrl = null;
  let selectedInspId = null;
  let camera = null;
  let abortCtrl = null;
  let phraseTimer = null;
  let lastGenArgs = null;

  /* ---------- 源面板 DOM ---------- */
  sourceEl.innerHTML = `
    <div class="photo-zone">
      <div class="zone-empty">
        <div class="art"><svg width="72" height="72" viewBox="0 0 80 80" fill="none" stroke="#9A857B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="26" width="44" height="44" rx="8" fill="#FFE3EA"/><path d="M52 34l18-12" /><circle cx="72" cy="20" r="5" fill="#FF9BB3"/><path d="M22 44h16M22 54h10"/></svg></div>
        <p class="tip">${emptyTip}</p>
        <div class="btns">
          <button class="btn btn-primary" data-act="camera">拍照</button>
          <button class="btn btn-ghost" data-act="upload">从相册选</button>
        </div>
      </div>
      <video hidden playsinline muted></video>
      <img class="captured" hidden alt="已选照片">
      <span class="chip cam-tip" hidden>把${cat === 'nail' ? '手' : '脸'}放进取景框</span>
      <button class="btn btn-sm btn-ghost retake" hidden data-act="retake">重拍</button>
      <div class="cam-ctrl" hidden>
        <button class="btn btn-sm btn-ghost" data-act="flip" aria-label="翻转摄像头">翻转</button>
        <button class="shutter" data-act="shutter" aria-label="拍照"></button>
        <button class="btn btn-sm btn-ghost" data-act="cam-cancel" aria-label="关闭相机">关闭</button>
      </div>
    </div>
    <div class="custom-row">
      <label class="sr-only" for="custom-${cat}">自定义描述</label>
      <input id="custom-${cat}" type="text" maxlength="120" placeholder="${customPlaceholder}">
    </div>
    <div class="gen-row">
      <button class="btn btn-primary btn-block" data-act="generate">生成试戴</button>
      <button class="btn btn-ghost" data-act="cancel" hidden>取消</button>
    </div>
    <div class="engine-progress" hidden>
      <div class="track"><div class="bar"></div></div>
      <p class="cap"></p>
    </div>
    <input type="file" accept="image/*" class="sr-only" data-act="file">
  `;

  const q = sel => sourceEl.querySelector(sel);
  const zone = q('.photo-zone');
  const zoneEmpty = q('.zone-empty');
  const video = q('video');
  const capturedImg = q('img.captured');
  const retakeBtn = q('.retake');
  const camCtrl = q('.cam-ctrl');
  const camTip = q('.cam-tip');
  const fileInput = q('input[type="file"]');
  const generateBtn = q('[data-act="generate"]');
  const cancelBtn = q('[data-act="cancel"]');
  const engineBox = q('.engine-progress');
  const engineBar = engineBox.querySelector('.bar');
  const engineCap = engineBox.querySelector('.cap');
  const customInput = q('input[type="text"]');

  camera = createCamera(video);

  /* ---------- 源面板交互 ---------- */
  sourceEl.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    try {
      if (act === 'camera') await startCamera();
      if (act === 'upload') fileInput.click();
      if (act === 'retake') resetPhoto();
      if (act === 'flip') await camera.flip();
      if (act === 'cam-cancel') stopCameraUI();
      if (act === 'shutter') await takeShot();
      if (act === 'generate') await generate();
      if (act === 'cancel') abortCtrl && abortCtrl.abort();
    } catch (err) {
      toast(explainCameraError(err), 'err');
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const blob = await toJpegBlob(file, {
        enhance: isEnhance(),
        subject: cat === 'nail' ? 'skin' : 'none'
      });
      setPhoto(blob);
      toast('照片准备好啦，选个款式试试');
    } catch (e) {
      toast('这张图片读取失败了，换一张试试', 'err');
    }
  });

  async function startCamera() {
    if (!cameraSupported()) {
      openModal({
        title: '当前环境不支持相机',
        body: '<p>相机需要 HTTPS 网络环境（本地 localhost 也可以）。不着急，从相册选一张照片同样可以试戴。</p>',
        actions: [{ key: 'upload', label: '从相册选', cls: 'btn-primary', onClick: () => { fileInput.click(); } }]
      });
      return;
    }
    try {
      await camera.start();
      zone.classList.add('has-media');
      zoneEmpty.hidden = true;
      video.hidden = false;
      capturedImg.hidden = true;
      retakeBtn.hidden = true;
      camCtrl.hidden = false;
      camTip.hidden = false;
    } catch (err) {
      openModal({
        title: '相机没能打开',
        body: `<p>${explainCameraError(err)}</p>`,
        actions: [
          { key: 'upload', label: '改用上传', cls: 'btn-primary', onClick: () => { fileInput.click(); } },
          { key: 'close', label: '知道了' }
        ]
      });
    }
  }

  async function takeShot() {
    let blob = await camera.capture();
    stopCameraUI();
    // 拍照路径同样经过增强预处理（主体裁剪/光照/自适应质量）
    try {
      blob = await toJpegBlob(blob, {
        enhance: isEnhance(),
        subject: cat === 'nail' ? 'skin' : 'none'
      });
    } catch (e) { /* 增强失败则退回原始照片 */ }
    setPhoto(blob);
    toast('拍到啦');
  }

  function stopCameraUI() {
    camera.stop();
    video.hidden = true;
    camCtrl.hidden = true;
    camTip.hidden = true;
    if (photoBlob) showPhoto();
    else { zone.classList.remove('has-media'); zoneEmpty.hidden = false; }
  }

  function setPhoto(blob) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoBlob = blob;
    photoUrl = URL.createObjectURL(blob);
    showPhoto();
    updateGenerateLabel();
  }

  function showPhoto() {
    capturedImg.src = photoUrl;
    capturedImg.hidden = false;
    zone.classList.add('has-media');
    zoneEmpty.hidden = true;
    video.hidden = true;
    retakeBtn.hidden = false;
  }

  function resetPhoto() {
    photoBlob = null;
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    capturedImg.hidden = true;
    capturedImg.removeAttribute('src');
    retakeBtn.hidden = true;
    zone.classList.remove('has-media');
    zoneEmpty.hidden = false;
    updateGenerateLabel();
  }

  function updateGenerateLabel() {
    const insp = selectedInspId ? byId(selectedInspId) : null;
    if (photoBlob && insp) generateBtn.textContent = `试戴「${insp.title}」`;
    else generateBtn.textContent = '生成试戴';
  }

  /* ---------- 灵感卡 ---------- */
  function makeCard(item) {
    const card = renderInspCard(item, { selected: item.id === selectedInspId });
    card.addEventListener('click', () => {
      if (selectedInspId === item.id) return;
      selectedInspId = item.id;
      stripEl.querySelectorAll('.insp-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.inspId === item.id);
        c.setAttribute('aria-pressed', c.dataset.inspId === item.id ? 'true' : 'false');
      });
      updateGenerateLabel();
      if (!photoBlob) {
        toast('款式已选好，先拍张照片或上传一张');
        return;
      }
      generate(); /* 已拍照：点击卡片直接生成 */
    });
    return card;
  }

  /* ---------- 生成 ---------- */
  async function generate() {
    if (abortCtrl) return;
    if (!photoBlob) {
      openModal({
        title: '还没有照片哦',
        body: '<p>先拍一张照片或从相册选一张，AI 才能帮你试戴～</p>',
        actions: [
          { key: 'camera', label: '拍照', cls: 'btn-primary', onClick: () => { startCamera(); } },
          { key: 'upload', label: '从相册选', onClick: () => { fileInput.click(); } }
        ]
      });
      return;
    }
    if (!selectedInspId && !customInput.value.trim()) {
      toast('先在下面选一个灵感款式，或填写自定义描述', 'err');
      return;
    }

    lastGenArgs = { inspId: selectedInspId, custom: customInput.value };
    const catKey = getCat ? getCat() : cat;
    const prompt = buildPrompt(catKey, selectedInspId, customInput.value);
    const { width, height } = genSize(aspect);

    abortCtrl = new AbortController();
    generateBtn.disabled = true;
    cancelBtn.hidden = false;
    engineBox.hidden = false;
    renderLoading();
    let phraseIdx = 0;
    phraseTimer = setInterval(() => {
      const cap = resultEl.querySelector('.heart-spin .txt');
      if (cap) cap.textContent = phrases[++phraseIdx % phrases.length];
    }, 2600);

    try {
      const { blob, provider } = await tryOn({
        imageBlob: photoBlob,
        prompt,
        width,
        height,
        signal: abortCtrl.signal,
        onEngine: ({ index, total, provider: p }) => {
          engineBar.style.width = '62%';
          engineCap.textContent = `AI 施法中 · ${p.label}`;
        }
      });
      renderResult(blob, provider, catKey);
      const insp = selectedInspId ? byId(selectedInspId) : null;
      await addHistory({
        cat: catKey,
        title: insp ? insp.title : (customInput.value.trim().slice(0, 18) || '自定义'),
        beforeBlob: photoBlob,
        afterBlob: blob,
        provider: provider.label,
        createdAt: Date.now()
      });
      bumpUsage();
      toast('试戴完成，拖动中间的小圆点左右对比', 'ok');
    } catch (err) {
      const e = normalizeError(err);
      if (e.type === 'UserCancel') {
        renderIdle();
        toast('已取消这次生成');
      } else {
        renderError(e);
      }
    } finally {
      clearInterval(phraseTimer);
      abortCtrl = null;
      generateBtn.disabled = false;
      cancelBtn.hidden = true;
      engineBox.hidden = true;
      engineBar.style.width = '20%';
    }
  }

  /* ---------- 结果面板状态 ---------- */
  function renderIdle() {
    resultEl.innerHTML = `
      <div class="result-state">
        ${HEART_SVG}
        <p class="cap">${emptyTip}<br>生成后在这里对比效果</p>
      </div>`;
  }

  function renderLoading() {
    resultEl.innerHTML = `
      <div class="result-state">
        <div class="heart-spin">${HEART_SVG}<p class="txt">${phrases[0]}</p></div>
      </div>`;
  }

  function renderError(e) {
    const copy = copyFor(e);
    resultEl.innerHTML = `
      <div class="result-state error-card">
        <div class="emoji-face">${copy.face}</div>
        <p class="msg">${copy.msg}</p>
        <p class="sub">${copy.sub}</p>
        <div class="result-actions" style="justify-content:center">
          <button class="btn btn-primary btn-sm" data-ract="retry">再试一次</button>
          <button class="btn btn-ghost btn-sm" data-ract="quota">查看额度</button>
        </div>
      </div>`;
  }

  function renderResult(blob, provider) {
    const afterUrl = URL.createObjectURL(blob);
    const insp = selectedInspId ? byId(selectedInspId) : null;
    resultEl.innerHTML = `
      <div class="result-figure">
        <div class="cmp-slot"></div>
        <div class="result-actions">
          <a class="btn btn-primary btn-sm" download="tryon-${Date.now()}.jpg" href="${afterUrl}">保存图片</a>
          <button class="btn btn-lav btn-sm" data-ract="again">再试一次</button>
          <button class="btn btn-ghost btn-sm" data-ract="newphoto">换张照片</button>
        </div>
        <p class="result-meta">由 ${provider.label} 生成${insp ? ' · ' + insp.title : ''} · 仅供参考</p>
      </div>`;
    const slot = resultEl.querySelector('.cmp-slot');
    if (slot) {
      renderCompare(slot, photoUrl, afterUrl);
      slot.style.aspectRatio = aspect === 'portrait' ? '3 / 4' : '4 / 3';
    }
  }

  resultEl.addEventListener('click', e => {
    const ract = e.target.closest('[data-ract]')?.dataset.ract;
    if (ract === 'retry' || ract === 'again') generate();
    if (ract === 'quota') go('mine');
    if (ract === 'newphoto') { resetPhoto(); renderIdle(); }
  });

  renderIdle();

  return {
    makeCard,
    onEnter() { updateGenerateLabel(); },
    onLeave() { stopCameraUI(); }
  };
}

/* 美甲页默认实例 */
const page = createTryOnPage({
  cat: 'nail',
  sourceEl: '#nails-source',
  resultEl: '#nails-result',
  stripEl: '#nails-strip',
  aspect: 'landscape',
  phrases: ['正在分析手部…', '魔法上色中…', '快好了，再等等…'],
  emptyTip: '拍一张手部照片，选个款式就能试',
  customPlaceholder: '想试的款式，例如：蓝色猫眼加碎钻'
});

(function renderStrip() {
  const strip = document.querySelector('#nails-strip');
  if (!strip) return;
  byCat('nail').forEach(item => strip.appendChild(page.makeCard(item)));
})();

export default { onEnter: page.onEnter, onLeave: page.onLeave };
