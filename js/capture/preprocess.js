/* 图片预处理：EXIF 纠向 + 长边压缩 + 自适应质量/主体裁剪/光照归一化 + base64 工具
 * 增强模式（enhance）下会在 canvas 上做二次处理：
 *   1) 边缘信息熵 → 动态 JPEG 质量（0.7~0.95）
 *   2) 肤色主体检测（美甲）→ 自动裁剪手部 ROI，聚焦指甲
 *   3) 亮度直方图 → 偏暗/过曝伽马校正
 * 全部纯 JS、零依赖；增强模式默认关闭以保性能与包体积稳定。 */
import {
  adaptiveQuality,
  detectSkinRegion,
  analyzeLuminance,
  gammaFor,
  applyGamma,
  cropToRegion,
  phash
} from './analyze.js';

/* ---------- 增强处理 Web Worker（懒创建、单例复用、可降级） ----------
 * enhance 模式下的 Sobel 边缘熵 + 肤色 BFS 泛洪 + 亮度直方图是多次全图像素遍历，
 * 同步跑在主线程会让「拍照/确认」后界面卡死。交给 Worker 后主线程在 await 期间空闲，
 * toast/loading 能正常渲染；Worker 创建失败或超时则退回主线程同步计算（行为同旧版）。 */
let enhanceWorker = null;
let workerReqSeq = 0;

function getEnhanceWorker() {
  if (enhanceWorker) return enhanceWorker;
  try {
    enhanceWorker = new Worker(new URL('./enhance.worker.js', import.meta.url), { type: 'module' });
    enhanceWorker.onerror = () => { enhanceWorker = null; };   // 出错则置空，下次重建
  } catch (e) {
    enhanceWorker = null;
  }
  return enhanceWorker;
}

/* 用 Worker 执行增强重计算；成功返回 { ok, phash, quality, width, height, data }，
 * 不可用或超时返回 null（由调用方退回主线程同步）。传副本并 transfer 其 buffer，
 * 保留主线程原始 imageData 供降级路径继续使用。 */
function enhanceInWorker(imageData, subject) {
  return new Promise((resolve) => {
    const w = getEnhanceWorker();
    if (!w) return resolve(null);
    const id = ++workerReqSeq;
    const copy = new Uint8ClampedArray(imageData.data);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; w.removeEventListener('message', onmsg); resolve(null); }
    }, 5000);
    function onmsg(e) {
      if (!e.data || e.data.id !== id) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', onmsg);
      resolve(e.data.ok ? e.data : null);
    }
    w.addEventListener('message', onmsg);
    try {
      w.postMessage(
        { id, data: copy, width: imageData.width, height: imageData.height, subject },
        [copy.buffer]
      );
    } catch (e) {
      clearTimeout(timer);
      w.removeEventListener('message', onmsg);
      resolve(null);
    }
  });
}

export async function toJpegBlob(source, {
  maxEdge = 896,
  quality = 0.82,
  enhance = false,
  subject = 'auto' // 'auto' | 'skin' | 'none'，仅 enhance 时生效
} = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch (e) {
    bitmap = await loadViaImgEl(source);
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  let outCanvas = canvas;
  let outQuality = quality;
  let pHash = null;

  if (enhance) {
    const imageData = ctx.getImageData(0, 0, w, h);

    // 优先把重计算交给 Worker；不可用/超时则退回主线程同步（行为同旧版）
    const wr = await enhanceInWorker(imageData, subject);
    if (wr && wr.ok) {
      pHash = wr.phash;
      outQuality = wr.quality;
      const oc = document.createElement('canvas');
      oc.width = wr.width;
      oc.height = wr.height;
      oc.getContext('2d').putImageData(new ImageData(wr.data, wr.width, wr.height), 0, 0);
      outCanvas = oc;
    } else {
      // 同步降级
      let d = imageData;
      // 感知哈希基于「缩放后的整图」计算，与增强处理（裁剪/伽马/质量）解耦，
      // 保证同一张原图在增强开关两种模式下产生相同 pHash，缓存才能真正跨模式命中。
      try { pHash = phash(d); } catch (e) { pHash = null; }

      // 1) 光照归一化：先在校正前的原始像素上计算亮度
      const lum = analyzeLuminance(d);
      const gamma = gammaFor(lum.mean, lum.darkRatio, lum.brightRatio);
      if (gamma !== 1.0) {
        applyGamma(d, gamma);
        ctx.putImageData(d, 0, 0);
        d = ctx.getImageData(0, 0, w, h); // 重新取数，供后续熵/肤色使用
      }

      // 2) 主体裁剪：美甲/手部场景做肤色 ROI（纯 JS，无 WASM）
      if (subject !== 'none') {
        const region = detectSkinRegion(d);
        if (region && region.w > 40 && region.h > 40) {
          const cropped = cropToRegion(ctx, region);
          if (cropped) {
            outCanvas = cropped;
            d = cropped.getContext('2d').getImageData(0, 0, cropped.width, cropped.height);
          }
        }
      }

      // 3) 自适应质量：基于最终画布内容的边缘信息熵
      outQuality = adaptiveQuality(d, { minQ: 0.7, maxQ: 0.95 });
    }
  } else {
    // 非增强：pHash 基于缩放整图计算，与增强处理解耦
    try { pHash = phash(ctx.getImageData(0, 0, w, h)); } catch (e) { pHash = null; }
  }

  const blob = await new Promise(r => outCanvas.toBlob(r, 'image/jpeg', outQuality));
  if (!blob) throw new Error('图片处理失败');
  return { blob, phash: pHash };
}

function loadViaImgEl(source) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

/* Blob → 纯 base64（不带 data: 前缀） */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
