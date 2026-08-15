/* 图像分析：边缘信息熵自适应压缩 + 肤色主体检测 + 光照归一化
 * 全部纯 JS 实现（无 WASM 依赖），在 canvas ImageData 上做二次处理。
 * 设计目标：在保持视觉质量的前提下减小上传体积，并让模型聚焦于主体（手部/脸部）。 */

/* ---------- 亮度与颜色空间工具 ---------- */
function toYcbCr(r, g, b) {
  // ITU-R BT.601 整型近似，避免浮点开销
  const y = 16 + (65.738 * r + 129.057 * g + 25.064 * b) / 256;
  const cb = 128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256;
  const cr = 128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256;
  return [y, cb, cr];
}

/* ---------- 1. 边缘信息熵自适应压缩 ----------
 * 用 Sobel 梯度幅值近似"边缘信息量"，熵越高质量越高；熵越低（如纯色背景）质量越低。
 * 输出 quality 夹在 [minQ, maxQ]，默认 0.7 ~ 0.95。 */
export function edgeEntropy(imageData, { step = 2 } = {}) {
  const { data, width, height } = imageData;
  // 抽样灰度
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const p = i >> 2;
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // Sobel 梯度幅值累加（抽样步长 step，降低计算量）
  let magSum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
        gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      magSum += Math.sqrt(gx * gx + gy * gy);
      n++;
    }
  }
  const meanMag = n ? magSum / n : 0;
  // 均值梯度归一化到 [0,1]：经验上边缘丰富的照片 meanMag 可达 60+，纯色 < 10
  const entropy = Math.min(1, meanMag / 48);
  return entropy;
}

export function adaptiveQuality(imageData, { minQ = 0.7, maxQ = 0.95 } = {}) {
  const e = edgeEntropy(imageData);
  // 熵 → 质量线性映射；低细节图给低质量以省体积，高细节图保质量
  return Math.round((minQ + e * (maxQ - minQ)) * 100) / 100;
}

/* ---------- 2. 肤色主体检测（YCbCr 空间 + 连通域分析） ----------
 * 返回主体包围盒 {x,y,w,h} 与占画面比例 ratio；无有效主体返回 null。
 * 用于美甲（手部）场景：自动裁剪出含肤色的手部 ROI，缩小输入范围。
 * 阈值采用经典 YCbCr 肤色区间：77<=Cb<=127, 133<=Cr<=173。 */
export function detectSkinRegion(imageData, { minRatio = 0.02, face = false } = {}) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const [, cb, cr] = toYcbCr(data[i], data[i + 1], data[i + 2]);
    mask[p] = (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) ? 1 : 0;
  }

  // 连通域标签（8 邻域，两遍法简化为 BFS 泛洪）
  const visited = new Uint8Array(width * height);
  let best = null; // 最大连通域
  const queue = new Int32Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || visited[p]) continue;
    // 泛洪
    let head = 0, tail = 0;
    queue[tail++] = p;
    visited[p] = 1;
    let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % width, cy = (c / width) | 0;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      area++;
      // 8 邻域
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const np = ny * width + nx;
          if (mask[np] && !visited[np]) { visited[np] = 1; queue[tail++] = np; }
        }
      }
    }
    const ratio = area / (width * height);
    if (ratio >= minRatio && (!best || area > best.area)) {
      best = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area, ratio };
    }
  }
  if (!best) return null;
  // 可选的居中倾向：主体太靠边时轻微外扩保护手指边缘
  const pad = Math.round(Math.min(best.w, best.h) * 0.08);
  best.x = Math.max(0, best.x - pad);
  best.y = Math.max(0, best.y - pad);
  best.w = Math.min(width, best.w + pad * 2);
  best.h = Math.min(height, best.h + pad * 2);
  return best;
}

/* 从 ImageData 裁剪出主体区域并回写到目标 canvas，返回实际裁剪结果 */
export function cropToRegion(ctx, imageData, region) {
  if (!region) return null;
  const { x, y, w, h } = region;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  c.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
  return canvas;
}

/* ---------- 3. 光照归一化 ----------
 * 计算亮度直方图；若偏暗（均值低于阈值）或过曝（高亮占比过高）则做伽马校正。
 * 校正用标准 gamma 曲线：out = 255 * (in/255)^gamma。
 * gamma > 1 提亮暗部，gamma < 1 压暗过曝。 */
export function analyzeLuminance(imageData) {
  const { data } = imageData;
  const hist = new Uint32Array(256);
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
    sum += lum;
  }
  const mean = sum / n;
  // 暗部占比（0~64）与高亮占比（224~255）
  let dark = 0, bright = 0;
  for (let i = 0; i <= 64; i++) dark += hist[i];
  for (let i = 224; i <= 255; i++) bright += hist[i];
  return { mean, darkRatio: dark / n, brightRatio: bright / n };
}

export function gammaFor(mean, darkRatio, brightRatio) {
  // 偏暗：暗部占比高或均值低 → gamma < 1 提亮；过曝：高亮占比高 → gamma > 1 压暗
  if (darkRatio > 0.6 || mean < 70) return 0.7;       // 明显偏暗
  if (darkRatio > 0.45 || mean < 95) return 0.85;     // 轻微偏暗
  if (brightRatio > 0.6 || mean > 180) return 1.35;   // 明显过曝
  if (brightRatio > 0.45 || mean > 155) return 1.15;  // 轻微过曝
  return 1.0; // 无需校正
}

export function applyGamma(imageData, gamma) {
  if (Math.abs(gamma - 1) < 0.02) return imageData;
  const { data } = imageData;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return imageData;
}
