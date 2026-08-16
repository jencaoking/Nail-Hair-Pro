/* 通用试戴流程工厂（美甲页默认实例；hair.js 复用）
 * 状态机：empty → camera / photo → generating → result / error
 */
import { cameraSupported, createCamera, explainCameraError } from '../capture/camera.js';
import { toJpegBlob } from '../capture/preprocess.js';
import { isEnhance, getEngine, set as setSettings } from '../store/settings.js';
import { renderInspCard, byId, byCat } from '../data/inspirations.js';
import { buildPrompt, genSize } from '../data/prompts.js';
import { detectStructure } from '../ai/landmarks.js';
import { getSamplePhoto } from '../data/samples.js';
import { tryOn } from '../ai/api.js';
import { normalizeError, copyFor } from '../ai/errors.js';
import { bumpUsage, fetchConfig } from '../ai/registry.js';
import { renderCompare } from '../ui/compare.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { addHistory, updateHistory } from '../store/db.js';
import { trackBehavior } from '../store/userLearning.js';
import { go } from '../router.js';

const HEART_SVG = `<svg width="48" height="48" viewBox="0 0 24 24" fill="#F43F6E" stroke="#FFFFFF" stroke-width="1.8" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;

/* HTML 转义：renderError 透出服务端原因时使用，防止文案中的特殊字符破坏结构 */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PROMPT_SUGGESTIONS = {
  nail: ['✨ 爆闪碎钻', '🎀 法式白边', '🍑 蜜桃渐变', '🌙 极光猫眼', '🍓 草莓小手绘', '🍫 焦糖奶茶'],
  hairColor: ['☕ 奶茶灰棕', '🍷 浓郁波尔多红', '🌊 蓝灰挑染', '🌸 樱花粉', '🍂 枫叶红铜', '🍯 蜜糖金'],
  hairStyle: ['💇 慵懒法式卷', '✨ 气质锁骨发', '🎀 减龄八字刘海', '🌊 温柔大波浪', '⚡ 利落短BOB', '🐎 元气高马尾']
};

export function createTryOnPage(opts) {
  const { cat, aspect, phrases, emptyTip, customPlaceholder, getCat } = opts;
  const sourceEl = document.querySelector(opts.sourceEl);
  const resultEl = document.querySelector(opts.resultEl);
  const stripEl = document.querySelector(opts.stripEl);

  let photoBlob = null;
  let photoUrl = null;
  let photoPhash = null;
  let photoStructure = null;   // 关键点检测结果（hand/face），未就绪为 null
  let structurePromise = null; // 进行中的检测 promise
  let selectedInspId = null;
  let camera = null;
  let abortCtrl = null;
  let phraseTimer = null;
  let lastResultUrl = null;   // 最近一次生成结果的 objectURL，下次生成前回收，避免「生成→换款→再生成」高频泄漏

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const detectSubject = () => (currentCategory() === 'nail' ? 'hand' : 'face');

  const currentCategory = () => (getCat ? getCat() : cat);

  /* ---------- 源面板 DOM ---------- */
  sourceEl.innerHTML = `
    <div class="photo-zone" id="photo-zone-${cat}">
      <div class="zone-empty">
        <div class="art">
          <svg width="68" height="68" viewBox="0 0 80 80" fill="none" stroke="#A89B9F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="10" y="24" width="46" height="46" rx="12" fill="#FFE4EC" stroke="#F43F6E"/>
            <path d="M56 34l14-10" stroke="#F43F6E"/>
            <circle cx="70" cy="24" r="4" fill="#F43F6E"/>
            <path d="M24 44h18M24 54h12" stroke="#F43F6E"/>
          </svg>
        </div>
        <p class="tip">${emptyTip}</p>
        <div class="btns">
          <button class="btn btn-primary" data-act="camera">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            拍照试戴
          </button>
          <button class="btn btn-ghost" data-act="upload">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            相册上传
          </button>
        </div>
        <div class="sample-bar">
          <span class="sample-label">没有照片？</span>
          <button type="button" class="sample-btn" data-act="sample-photo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            试用模特示例照
          </button>
        </div>
      </div>
      <video hidden playsinline muted></video>
      <img class="captured" hidden alt="已选照片">
      <span class="chip detect-badge" hidden aria-live="polite"></span>
      <span class="chip cam-tip" hidden>✨ 把${cat === 'nail' ? '手指' : '脸部'}置于画面中心</span>
      <button class="btn btn-sm btn-ghost retake" hidden data-act="retake">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        重新选择
      </button>
      <div class="cam-ctrl" hidden>
        <button class="btn btn-sm btn-ghost" data-act="flip" aria-label="翻转摄像头">🔄 翻转</button>
        <button class="shutter" data-act="shutter" aria-label="拍照"></button>
        <button class="btn btn-sm btn-ghost" data-act="cam-cancel" aria-label="关闭相机">关闭</button>
      </div>
    </div>

    <!-- 选中灵感胶囊 -->
    <div class="selected-capsule" hidden id="capsule-${cat}">
      <div class="cap-left">
        <span class="chip" id="capsule-tag-${cat}">已选款式</span>
        <span class="cap-title" id="capsule-title-${cat}">-</span>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" data-act="clear-insp" style="padding:4px 10px;min-height:30px;font-size:0.78rem">取消所选</button>
    </div>

    <div class="custom-row">
      <label class="sr-only" for="custom-${cat}">自定义描述</label>
      <input id="custom-${cat}" type="text" maxlength="120" placeholder="${customPlaceholder}">
      <div class="prompt-chips" id="chips-${cat}"></div>
    </div>

    <div class="engine-picker-row" hidden>
      <label for="engine-${cat}">⚙️ 生成引擎</label>
      <select id="engine-${cat}" data-engine-select>
        <option value="auto">自动（推荐）</option>
      </select>
    </div>

    <div class="gen-row">
      <button class="btn btn-primary btn-block btn-lg" data-act="generate">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        <span>生成试戴效果</span>
      </button>
      <button class="btn btn-ghost" data-act="cancel" hidden>取消</button>
    </div>

    <div class="engine-progress" hidden>
      <div class="track"><div class="bar"></div></div>
      <p class="cap">AI 施法中 · 正在进行特征对齐与色彩融合…</p>
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
  const detectBadge = q('.detect-badge');
  const fileInput = q('input[type="file"]');
  const generateBtn = q('[data-act="generate"]');
  const cancelBtn = q('[data-act="cancel"]');
  const engineBox = q('.engine-progress');
  const engineBar = engineBox.querySelector('.bar');
  const engineCap = engineBox.querySelector('.cap');
  const customInput = q('input[type="text"]');
  const capsule = q(`#capsule-${cat}`);
  const capsuleTitle = q(`#capsule-title-${cat}`);
  const chipsBox = q(`#chips-${cat}`);
  const enginePickerRow = q('.engine-picker-row');
  const engineSelect = q('[data-engine-select]');

  camera = createCamera(video);

  const show = el => { if (!el) return; el.hidden = false; el.classList.remove('is-hidden'); };
  const hide = el => { if (!el) return; el.hidden = true;  el.classList.add('is-hidden'); };

  /* ---------- 生成引擎选择器：拉取服务端已配置引擎，用户可选，持久化到 settings ---------- */
  async function initEnginePicker() {
    if (!enginePickerRow || !engineSelect) return;
    const config = await fetchConfig().catch(() => null);
    const engines = (config && config.engines) || [];
    // 只有至少 2 个可用引擎（自动 + ≥1 具体）才展示选择器，避免对单一引擎用户造成困惑
    if (engines.length < 2) { hide(enginePickerRow); return; }

    const saved = getEngine();
    const cur = engines.some(e => e.id === saved) ? saved : 'auto';
    engineSelect.innerHTML = '<option value="auto">自动（推荐）</option>' +
      engines.map(e => `<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('');
    engineSelect.value = cur;
    engineSelect.addEventListener('change', () => {
      setSettings({ engine: engineSelect.value });
      toast(engineSelect.value === 'auto' ? '已切换为自动引擎' : `已选择引擎：${engineSelect.selectedOptions[0]?.textContent || engineSelect.value}`);
    });
    show(enginePickerRow);
  }

  /* ---------- 渲染快捷提示词 ---------- */
  function renderPromptChips() {
    const list = PROMPT_SUGGESTIONS[currentCategory()] || PROMPT_SUGGESTIONS[cat] || [];
    chipsBox.innerHTML = list.map(text => `<span class="prompt-chip" data-chip="${text}">${text}</span>`).join('');
  }
  renderPromptChips();

  chipsBox.addEventListener('click', e => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const val = chip.dataset.chip.replace(/^[^\s]+\s*/, ''); // 去除前面的 emoji
    if (customInput.value.includes(val)) return;
    customInput.value = (customInput.value.trim() ? customInput.value.trim() + '，' : '') + val;
    toast(`已添加标签：${val}`);
    customInput.focus();
  });

  /* ---------- 拖拽与粘贴支持 ---------- */
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await handleFile(file);
    }
  });

  const onPaste = async e => {
    if (sourceEl.offsetParent === null) return; // 页面未激活时不处理
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const blob = item.getAsFile();
        await handleFile(blob);
        toast('已从剪贴板读取照片');
        break;
      }
    }
  };
  // paste 监听器随页面激活/离开对称绑定与解绑，避免 window 上累积永久监听器
  let pasteBound = false;
  const bindPaste = () => { if (!pasteBound) { pasteBound = true; window.addEventListener('paste', onPaste); } };
  const unbindPaste = () => { if (pasteBound) { pasteBound = false; window.removeEventListener('paste', onPaste); } };

  /* ---------- 源面板事件委托 ---------- */
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
      if (act === 'clear-insp') clearSelectedInsp();
      if (act === 'sample-photo') await loadSamplePhoto();
    } catch (err) {
      // 只有相机类操作才用相机错误解释；生成/上传等操作应显示真实原因，避免误报「相机出了点状况」
      const cameraActs = ['camera', 'shutter', 'flip'];
      const msg = cameraActs.includes(act)
        ? explainCameraError(err)
        : (err && (err.message || err.type)) || '操作失败，请重试';
      toast(msg, 'err');
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) await handleFile(file);
  });

  async function handleFile(file) {
    try {
      toast('正在优化照片…');
      const { blob, phash } = await toJpegBlob(file, {
        enhance: isEnhance(),
        subject: cat === 'nail' ? 'skin' : 'none'
      });
      setPhoto(blob, phash);
      toast('照片准备好啦，点击下方灵感即可一键试戴', 'ok');
    } catch (e) {
      toast('这张图片读取失败了，请换一张试试', 'err');
    }
  }

  async function loadSamplePhoto() {
    try {
      toast('正在加载模特示例照…');
      const sampleBlob = await getSamplePhoto(cat === 'nail' ? 'nail' : 'face');
      const { blob, phash } = await toJpegBlob(sampleBlob, {
        enhance: isEnhance(),
        subject: cat === 'nail' ? 'skin' : 'none'
      });
      setPhoto(blob, phash);
      toast('示例照片已加载，选个灵感试试吧！', 'ok');
    } catch (e) {
      toast('示例照片加载失败', 'err');
    }
  }

  async function startCamera() {
    if (!cameraSupported()) {
      openModal({
        title: '当前环境不支持相机',
        body: '<p>相机调用需要安全环境（HTTPS 或 Localhost）。您可以直接从相册上传或点击试用模特照片。</p>',
        actions: [
          { key: 'upload', label: '从相册选', cls: 'btn-primary', onClick: () => { fileInput.click(); } },
          { key: 'sample', label: '试用示例照', cls: 'btn-lav', onClick: () => { loadSamplePhoto(); } }
        ]
      });
      return;
    }
    try {
      await camera.start();
      zone.classList.add('has-media');
      hide(zoneEmpty);
      show(video);
      hide(capturedImg);
      hide(retakeBtn);
      show(camCtrl);
      show(camTip);
    } catch (err) {
      openModal({
        title: '相机没能打开',
        body: `<p>${explainCameraError(err)}</p>`,
        actions: [
          { key: 'upload', label: '从相册上传', cls: 'btn-primary', onClick: () => { fileInput.click(); } },
          { key: 'close', label: '知道了' }
        ]
      });
    }
  }

  async function takeShot() {
    let blob;
    try {
      blob = await camera.capture();
    } catch (e) {
      toast(explainCameraError(e), 'err');
      return;
    }
    let phash = null;
    stopCameraUI();
    toast('正在优化照片…');
    try {
      const r = await toJpegBlob(blob, {
        enhance: isEnhance(),
        subject: cat === 'nail' ? 'skin' : 'none'
      });
      blob = r.blob;
      phash = r.phash;
    } catch (e) { }
    setPhoto(blob, phash);
    toast('拍到啦，选个款式马上试戴', 'ok');
  }

  function stopCameraUI() {
    camera.stop();
    hide(video);
    hide(camCtrl);
    hide(camTip);
    if (photoBlob) showPhoto();
    else { zone.classList.remove('has-media'); show(zoneEmpty); }
  }

  function setPhoto(blob, phash = null) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoBlob = blob;
    photoPhash = phash;
    photoUrl = URL.createObjectURL(blob);
    showPhoto();
    updateGenerateLabel();
    runDetection(blob);
  }

  /* ---------- 关键点检测预处理：异步识别手部/面部结构，注入生成 prompt ---------- */
  function runDetection(blob) {
    const subject = detectSubject();
    const myBlob = blob;   // 捕获本次检测对应的照片，用于乱序返回时比对丢弃过期结果
    photoStructure = null;
    structurePromise = null;
    updateDetectBadge('detecting', subject);

    // 加超时兜底：MediaPipe 模型加载/推理若超时（CDN 慢、模型下载慢），静默降级为无结构信息，
    // 避免「识别中」徽标永久卡住，也避免生成流程被检测拖住
    structurePromise = Promise.race([
      detectStructure(blob, subject),
      delay(5000).then(() => null)
    ])
      .then(structure => {
        // 照片已更换：这次检测结果是「上一张照片」的，丢弃，避免错误结构注入 prompt
        if (photoBlob !== myBlob) return null;
        photoStructure = structure;
        updateDetectBadge(structure ? 'done' : 'none', subject, structure);
        return structure;
      })
      .catch(() => {
        if (photoBlob !== myBlob) return null;
        photoStructure = null;
        updateDetectBadge('none', subject);
        return null;
      });
  }

  function updateDetectBadge(state, subject, structure) {
    if (!detectBadge) return;
    if (state === 'detecting') {
      detectBadge.textContent = subject === 'hand' ? '🔍 AI 识别手部中…' : '🔍 AI 识别面部中…';
      show(detectBadge);
      return;
    }
    if (state === 'done' && structure) {
      detectBadge.textContent = structure.kind === 'hand'
        ? `✓ 已识别手部 · ${structure.fingers} 指`
        : `✓ 已识别 · ${faceShapeLabel(structure.faceShape)}脸型`;
      show(detectBadge);
      // 3 秒后自动淡出，避免常驻遮挡
      delay(3000).then(() => { if (photoStructure === structure) hide(detectBadge); });
      return;
    }
    hide(detectBadge);
  }

  function faceShapeLabel(shape) {
    return ({ round: '圆', square: '方', oval: '鹅蛋', heart: '心形', long: '长' })[shape] || shape;
  }

  function showPhoto() {
    capturedImg.src = photoUrl;
    show(capturedImg);
    zone.classList.add('has-media');
    hide(zoneEmpty);
    hide(video);
    show(retakeBtn);
  }

  function resetPhoto() {
    photoBlob = null;
    photoPhash = null;
    photoStructure = null;
    structurePromise = null;
    if (detectBadge) hide(detectBadge);
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    hide(capturedImg);
    capturedImg.removeAttribute('src');
    hide(retakeBtn);
    zone.classList.remove('has-media');
    show(zoneEmpty);
    updateGenerateLabel();
  }

  function selectInsp(inspId) {
    selectedInspId = inspId;
    const insp = byId(inspId);
    if (insp) {
      capsuleTitle.textContent = insp.title;
      show(capsule);
      trackBehavior({
        type: 'select_insp',
        inspId: insp.id,
        cat: insp.cat,
        tags: insp.tags
      });
    } else {
      hide(capsule);
    }
    if (stripEl) {
      stripEl.querySelectorAll('.insp-card').forEach(c => {
        const isMatch = c.dataset.inspId === inspId;
        c.classList.toggle('selected', isMatch);
        c.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });
    }
    updateGenerateLabel();
  }

  function clearSelectedInsp() {
    selectedInspId = null;
    hide(capsule);
    if (stripEl) {
      stripEl.querySelectorAll('.insp-card').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
      });
    }
    updateGenerateLabel();
  }

  function updateGenerateLabel() {
    const insp = selectedInspId ? byId(selectedInspId) : null;
    const labelSpan = generateBtn.querySelector('span');
    if (labelSpan) {
      if (insp) labelSpan.textContent = `生成「${insp.title}」效果`;
      else if (customInput.value.trim()) labelSpan.textContent = '生成自定义效果';
      else labelSpan.textContent = '生成试戴效果';
    }
  }

  customInput.addEventListener('input', updateGenerateLabel);

  /* ---------- 灵感卡生成与交互 ---------- */
  function makeCard(item) {
    const card = renderInspCard(item, { selected: item.id === selectedInspId });
    card.addEventListener('click', () => {
      selectInsp(item.id);
      if (!photoBlob) {
        toast(`已选择「${item.title}」，请先拍照或上传照片`);
        return;
      }
      generate();
    });
    return card;
  }

  /* ---------- AI 生成核心（后台模式：立即回「我的」，AI 后台完成后更新记录） ---------- */
  let bgBusy = false;

  async function generate() {
    if (bgBusy) { toast('已有一次生成在进行中，请稍候', 'err'); return; }
    if (!photoBlob) {
      openModal({
        title: '请先提供照片',
        body: '<p>拍一张手部或头部照片，或者一键加载示例模特照片，AI 就能为您施法试戴～</p>',
        actions: [
          { key: 'sample', label: '使用示例照', cls: 'btn-lav', onClick: () => { loadSamplePhoto(); } },
          { key: 'upload', label: '从相册上传', cls: 'btn-primary', onClick: () => { fileInput.click(); } }
        ]
      });
      return;
    }
    if (!selectedInspId && !customInput.value.trim()) {
      toast('请在下方挑选一个灵感款式，或填写自定义描述', 'err');
      return;
    }

    const catKey = currentCategory();
    // 等待关键点检测就绪（最多 1.5s）；未就绪则降级为无结构 prompt，不阻塞生成
    let structure = photoStructure;
    if (!structure && structurePromise) {
      structure = await Promise.race([structurePromise, delay(1500).then(() => null)]);
    }
    const prompt = buildPrompt(catKey, selectedInspId, customInput.value, { structure });
    const { width, height } = genSize(aspect);
    const insp = selectedInspId ? byId(selectedInspId) : null;
    const title = insp ? insp.title : (customInput.value.trim().slice(0, 18) || '自定义款式');

    // 1) 先写一条「生成中」占位记录（后台完成后原地更新）
    let recId;
    try {
      recId = await addHistory({
        cat: catKey,
        title,
        beforeBlob: photoBlob,
        afterBlob: null,
        provider: '',
        status: 'generating',
        createdAt: Date.now()
      });
    } catch (e) {
      toast('保存记录失败，请重试', 'err');
      return;
    }

    // 2) 留在当前页：结果区原地展示生成中状态，AI 在后台继续生成
    toast('✨ 已提交生成，AI 正在处理…');
    renderLoading();

    // 3) 后台生成：不阻塞页面，完成后原地渲染结果；失败则原地显示错误；历史记录照常更新
    bgBusy = true;
    (async () => {
      try {
        const { blob, provider } = await tryOn({
          imageBlob: photoBlob,
          prompt,
          width,
          height,
          cat: catKey,
          engine: getEngine(),
          phash: photoPhash
        });
        await updateHistory(recId, { afterBlob: blob, provider: provider.label, status: 'done' });
        trackBehavior({ type: 'tryon_generate', cat: catKey, inspId: selectedInspId, tags: insp ? insp.tags : [] });
        bumpUsage();
        renderResult(blob, provider);
        toast('试戴完成！已保存到「我的」记录', 'ok');
      } catch (err) {
        const e = normalizeError(err);
        const copy = copyFor(e);
        await updateHistory(recId, { status: 'error', error: e.message || copy.msg }).catch(() => {});
        renderError(e);
        toast(copy.msg, 'err');
      } finally {
        bgBusy = false;
      }
    })();
  }

  /* ---------- 结果状态渲染 ---------- */
  function renderIdle() {
    resultEl.innerHTML = `
      <div class="result-state">
        ${HEART_SVG}
        <p class="cap">拍照或选择灵感款式后<br>在此处实时预览 AI 试戴效果与高清对比</p>
      </div>`;
  }

  function renderLoading() {
    resultEl.innerHTML = `
      <div class="result-state">
        <div class="heart-spin">
          ${HEART_SVG}
          <p class="txt">${phrases[0]}</p>
        </div>
      </div>`;
  }

  function renderError(e) {
    const copy = copyFor(e);
    // 服务端会下发具体原因（如「临时图床都连不上」「生成超时」），透出给用户便于排查
    const detail = e && e.message && e.message !== copy.msg && e.message !== e.type ? e.message : '';
    resultEl.innerHTML = `
      <div class="result-state error-card">
        <div class="emoji-face">${copy.face || '🪄'}</div>
        <p class="msg">${copy.msg}</p>
        <p class="sub">${copy.sub}</p>
        ${detail ? `<p class="sub" style="font-size:.78rem;opacity:.75">原因：${esc(detail)}</p>` : ''}
        <div class="result-actions">
          <button class="btn btn-primary btn-sm" data-ract="retry">🔄 重新生成</button>
          <button class="btn btn-ghost btn-sm" data-ract="quota">查看今日额度</button>
        </div>
      </div>`;
  }

  function renderResult(blob, provider) {
    // 回收上一次结果图的 objectURL：blob URL 底层数据只有显式 revoke 或刷新才释放，
    // 「生成→换款→再生成」是核心主循环，不回收会持续累积几 MB 的内存泄漏
    if (lastResultUrl) URL.revokeObjectURL(lastResultUrl);
    const afterUrl = URL.createObjectURL(blob);
    lastResultUrl = afterUrl;
    const insp = selectedInspId ? byId(selectedInspId) : null;
    resultEl.innerHTML = `
      <div class="result-figure">
        <div class="cmp-slot"></div>
        <div class="result-actions">
          <a class="btn btn-primary btn-sm" download="tryon-${Date.now()}.jpg" href="${afterUrl}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            保存高清效果图
          </a>
          <button class="btn btn-lav btn-sm" data-ract="again">🔄 换个款式</button>
          <button class="btn btn-ghost btn-sm" data-ract="newphoto">📸 换张照片</button>
        </div>
        <p class="result-meta">由 ${esc(provider.label)} 渲染${insp ? ' · 款式「' + esc(insp.title) + '」' : ''} · 仅供参考</p>
      </div>`;

    const slot = resultEl.querySelector('.cmp-slot');
    if (slot) {
      renderCompare(slot, photoUrl, afterUrl, 'slider');
      slot.style.aspectRatio = aspect === 'portrait' ? '3 / 4' : '4 / 3';
    }
  }

  resultEl.addEventListener('click', e => {
    const downloadLink = e.target.closest('a[download]');
    if (downloadLink) {
      const insp = selectedInspId ? byId(selectedInspId) : null;
      trackBehavior({
        type: 'tryon_save',
        cat: currentCategory(),
        inspId: selectedInspId,
        tags: insp ? insp.tags : []
      });
    }
    const ract = e.target.closest('[data-ract]')?.dataset.ract;
    if (ract === 'retry' || ract === 'again') {
      if (ract === 'again') {
        toast('请在下方挑选新的款式，照片将自动保留');
      } else {
        generate();
      }
    }
    if (ract === 'quota') go('mine');
    if (ract === 'newphoto') { resetPhoto(); renderIdle(); }
  });

  renderIdle();

  return {
    makeCard,
    selectInsp,
    renderPromptChips,
    onEnter() {
      updateGenerateLabel();
      renderPromptChips();
      initEnginePicker();
      bindPaste();
    },
    onLeave() {
      stopCameraUI();
      unbindPaste();
    }
  };
}

/* 美甲页默认实例 */
const page = createTryOnPage({
  cat: 'nail',
  sourceEl: '#nails-source',
  resultEl: '#nails-result',
  stripEl: '#nails-strip',
  aspect: 'landscape',
  phrases: ['正在识别手部与指甲边缘…', 'AI 魔法涂装中…', '正在渲染自然水光泽感…', '马上就好啦…'],
  emptyTip: '拍一张手部照片，或选相册照片试戴',
  customPlaceholder: '输入想试的款式，例如：极光猫眼加珍珠碎钻'
});

(function renderStrip() {
  const strip = document.querySelector('#nails-strip');
  if (!strip) return;
  byCat('nail').forEach(item => strip.appendChild(page.makeCard(item)));
})();

export default {
  onEnter: page.onEnter,
  onLeave: page.onLeave,
  selectInsp: page.selectInsp
};
