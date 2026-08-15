/* 关键点检测预处理：MediaPipe HandLandmarker / FaceLandmarker（懒加载，CDN）
 *
 * 在调用 AI 生成前识别手部 / 面部结构，把结构信息注入 prompt，让生成模型
 * 更准确地理解手部（指甲位置、手指角度、光照方向）与脸型（发型契合度）。
 *
 * 设计原则：
 *   - 懒加载：首次需要时才通过动态 import 拉取 MediaPipe（约数 MB），不拖慢首屏
 *   - 失败安全：任何加载 / 推理异常都返回 null，绝不阻断生成流程
 *   - 单例缓存：Vision 模块与 landmarker 实例全局复用，模型只初始化一次
 *   - GPU 优先，失败自动降级 CPU
 */

const TASKS_VERSION = '0.10.14';
const TASKS_ESM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs`;
const TASKS_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let visionModulePromise = null;
let handLandmarkerPromise = null;
let faceLandmarkerPromise = null;

function loadVision() {
  if (!visionModulePromise) {
    visionModulePromise = import(TASKS_ESM).catch(e => {
      visionModulePromise = null; // 失败后允许下次重试
      throw e;
    });
  }
  return visionModulePromise;
}

async function createLandmarker(kind) {
  const vision = await loadVision();
  const fileset = await vision.FilesetResolver.forVisionTasks(TASKS_WASM);
  const baseOptions = {
    modelAssetPath: kind === 'hand' ? HAND_MODEL : FACE_MODEL,
    delegate: 'GPU'
  };
  const make = () => kind === 'hand'
    ? vision.HandLandmarker.createFromOptions(fileset, { baseOptions, runningMode: 'IMAGE', numHands: 2 })
    : vision.FaceLandmarker.createFromOptions(fileset, { baseOptions, runningMode: 'IMAGE', numFaces: 1 });
  try {
    return await make();
  } catch (gpuErr) {
    baseOptions.delegate = 'CPU'; // 无 GPU 环境降级
    return await make();
  }
}

function getHandLandmarker() {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = createLandmarker('hand').catch(e => {
      handLandmarkerPromise = null;
      throw e;
    });
  }
  return handLandmarkerPromise;
}

function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = createLandmarker('face').catch(e => {
      faceLandmarkerPromise = null;
      throw e;
    });
  }
  return faceLandmarkerPromise;
}

/* ---------- 光照方向分析（纯 JS，降采样四象限亮度） ---------- */
function analyzeLightDirection(source) {
  const S = 16;
  const sc = document.createElement('canvas');
  sc.width = S; sc.height = S;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, S, S);
  const d = sctx.getImageData(0, 0, S, S).data;

  let tl = 0, tr = 0, bl = 0, br = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (x < S / 2 && y < S / 2) tl += lum;
      else if (x >= S / 2 && y < S / 2) tr += lum;
      else if (x < S / 2 && y >= S / 2) bl += lum;
      else br += lum;
    }
  }
  const n = (S * S) / 4;
  tl /= n; tr /= n; bl /= n; br /= n;

  const hDelta = (tr + br) / 2 - (tl + bl) / 2; // >0 光来自右侧
  const vDelta = (bl + br) / 2 - (tl + tr) / 2; // >0 光来自下方
  const T = 8; // 亮度差阈值（0~255 亮度空间）

  if (Math.abs(hDelta) < T && Math.abs(vDelta) < T) {
    return { dir: 'front', english: 'soft even frontal lighting' };
  }
  const hPart = hDelta > T ? 'right' : (hDelta < -T ? 'left' : '');
  const vPart = vDelta > T ? 'lower' : (vDelta < -T ? 'upper' : '');
  const dir = [vPart, hPart].filter(Boolean).join('-') || 'front';
  const english = {
    front: 'soft even frontal lighting',
    upper: 'soft top lighting',
    lower: 'soft bottom lighting',
    left: 'soft left-side lighting',
    right: 'soft right-side lighting',
    'upper-left': 'soft top-left lighting',
    'upper-right': 'soft top-right lighting',
    'lower-left': 'soft bottom-left lighting',
    'lower-right': 'soft bottom-right lighting'
  }[dir] || `soft light from the ${dir}`;
  return { dir, english };
}

/* ---------- 手部结构提取（21 关键点） ---------- */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function structureFromHand(res, light) {
  if (!res.landmarks || !res.landmarks.length) return null;
  const lm = res.landmarks[0];

  // 手指伸出判断：指尖到手腕距离 > 近端指节到手腕距离（伸直的手指指尖更远）
  const TIPS = [4, 8, 12, 16, 20];
  const PIPS = [3, 6, 10, 14, 18];
  let fingers = 0;
  for (let i = 0; i < 5; i++) {
    if (dist(lm[TIPS[i]], lm[0]) > dist(lm[PIPS[i]], lm[0]) * 1.08) fingers++;
  }

  // 左右手（MediaPipe handedness 字段）
  let handSide = null;
  const hh = res.handednesses && res.handednesses[0] && res.handednesses[0][0];
  if (hh && hh.score > 0.7) handSide = (hh.categoryName || '').toLowerCase();

  // 手在画面中的包围盒占比
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    kind: 'hand',
    fingers,
    handSide,
    coverage: Math.round((maxX - minX) * (maxY - minY) * 100) / 100,
    light
  };
}

/* ---------- 面部结构提取（478 关键点） ---------- */
function structureFromFace(res, light) {
  if (!res.faceLandmarks || !res.faceLandmarks.length) return null;
  const lm = res.faceLandmarks[0];

  const forehead = lm[10];   // 额头顶部（face oval 顶）
  const chin = lm[152];      // 下巴底部（face oval 底）
  const lCheek = lm[234];    // 左脸颊
  const rCheek = lm[454];    // 右脸颊
  const jawL = lm[172];      // 左下颚
  const jawR = lm[397];      // 右下颚
  const nose = lm[4];        // 鼻尖

  const faceW = Math.abs(rCheek.x - lCheek.x);
  const faceH = Math.abs(chin.y - forehead.y);
  const ratio = faceH > 0 ? faceW / faceH : 0;
  const jawW = Math.abs(jawR.x - jawL.x);

  // 脸型判断：宽高比 + 下颌相对宽度
  let faceShape;
  if (ratio > 0.88) faceShape = 'round';
  else if (ratio > 0.78) faceShape = 'square';
  else if (ratio > 0.68) faceShape = (jawW < faceW * 0.75) ? 'heart' : 'oval';
  else faceShape = 'long';

  // 朝向：左右脸颊到鼻尖的水平距离对称性
  const lToNose = Math.abs(nose.x - lCheek.x);
  const rToNose = Math.abs(rCheek.x - nose.x);
  const sym = Math.min(lToNose, rToNose) / Math.max(lToNose, rToNose, 1e-6);
  let orientation = 'front';
  if (sym < 0.6) orientation = 'profile';
  else if (sym < 0.8) orientation = 'slight side';

  // 面部包围盒占比
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    kind: 'face',
    faceShape,
    orientation,
    coverage: Math.round((maxX - minX) * (maxY - minY) * 100) / 100,
    light
  };
}

/**
 * 检测图片主体结构
 * @param {Blob} blob JPEG 图片
 * @param {'hand'|'face'} subject 主体类型
 * @returns {Promise<object|null>} 结构描述对象；任何失败返回 null
 */
export async function detectStructure(blob, subject) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    const light = analyzeLightDirection(canvas);

    let structure;
    if (subject === 'hand') {
      const lm = await getHandLandmarker();
      structure = structureFromHand(lm.detect(canvas), light);
    } else {
      const lm = await getFaceLandmarker();
      structure = structureFromFace(lm.detect(canvas), light);
    }

    if (bitmap.close) bitmap.close();
    return structure;
  } catch (e) {
    // 失败安全：模型未加载 / 无关键点 / 网络异常，均静默降级
    return null;
  }
}
