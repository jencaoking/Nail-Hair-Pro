/* 图像增强 Worker：把 Sobel 边缘熵、肤色 BFS 泛洪、亮度直方图等全图像素遍历
 * 从主线程移出，避免「拍照/确认」后界面卡死、无 loading 反馈。
 *
 * 纯 TypedArray 运算，不触碰 DOM/Canvas；以 module worker 运行，复用 analyze.js 的纯函数。
 * 协议（data 通过 transferable buffer 双向零拷贝传递）：
 *   入参 { id, data: Uint8ClampedArray, width, height, subject }
 *   出参 { id, ok, phash, quality, width, height, data: Uint8ClampedArray }
 */
import {
  analyzeLuminance,
  gammaFor,
  applyGamma,
  detectSkinRegion,
  adaptiveQuality,
  phash
} from './analyze.js';

/* 裁剪主体 ROI（TypedArray 版，等价主线程 canvas 的 cropToRegion，但无需 canvas） */
function cropRegion(src, region) {
  const { x, y, w, h } = region;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    const s = ((y + row) * src.width + x) * 4;
    out.set(src.data.subarray(s, s + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}

self.onmessage = (e) => {
  const { id, data, width, height, subject } = e.data;

  // 1) pHash 基于原始缩放整图（与裁剪/伽马解耦，保证增强开关两种模式下缓存可跨模式命中）
  let pHash = null;
  try { pHash = phash({ data, width, height }); } catch { pHash = null; }

  const src = { data, width, height };

  // 2) 光照归一化（原地伽马校正）
  const lum = analyzeLuminance(src);
  const gamma = gammaFor(lum.mean, lum.darkRatio, lum.brightRatio);
  if (gamma !== 1.0) applyGamma(src, gamma);

  // 3) 主体裁剪（肤色 ROI，美甲/手部场景）
  let out = src;
  if (subject !== 'none') {
    const region = detectSkinRegion(src);
    if (region && region.w > 40 && region.h > 40) {
      out = cropRegion(src, region);
    }
  }

  // 4) 自适应 JPEG 质量（基于最终内容边缘熵）
  const quality = adaptiveQuality(out, { minQ: 0.7, maxQ: 0.95 });

  self.postMessage(
    { id, ok: true, phash: pHash, quality, width: out.width, height: out.height, data: out.data },
    [out.data.buffer]
  );
};
