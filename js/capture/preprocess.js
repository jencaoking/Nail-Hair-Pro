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

  // 感知哈希基于「缩放后的整图」计算，与增强处理（裁剪/伽马/质量）解耦，
  // 保证同一张原图在增强开关两种模式下产生相同 pHash，缓存才能真正跨模式命中。
  try {
    pHash = phash(ctx.getImageData(0, 0, w, h));
  } catch (e) { pHash = null; }

  if (enhance) {
    let imageData = ctx.getImageData(0, 0, w, h);

    // 1) 光照归一化：先在校正前的原始像素上计算亮度
    const lum = analyzeLuminance(imageData);
    const gamma = gammaFor(lum.mean, lum.darkRatio, lum.brightRatio);
    if (gamma !== 1.0) {
      applyGamma(imageData, gamma);
      ctx.putImageData(imageData, 0, 0);
      imageData = ctx.getImageData(0, 0, w, h); // 重新取数，供后续熵/肤色使用
    }

    // 2) 主体裁剪：美甲/手部场景做肤色 ROI（纯 JS，无 WASM）
    if (subject !== 'none') {
      const region = detectSkinRegion(imageData);
      if (region && region.w > 40 && region.h > 40) {
        const cropped = cropToRegion(ctx, region);
        if (cropped) {
          outCanvas = cropped;
          imageData = cropped.getContext('2d').getImageData(0, 0, cropped.width, cropped.height);
        }
      }
    }

    // 3) 自适应质量：基于最终画布内容的边缘信息熵
    outQuality = adaptiveQuality(imageData, { minQ: 0.7, maxQ: 0.95 });
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
