/* 图片预处理：EXIF 纠向 + 长边压缩 896 + JPEG 0.82 + base64 工具 */

export async function toJpegBlob(source, { maxEdge = 896, quality = 0.82 } = {}) {
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
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('图片处理失败');
  return blob;
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

export const dataUri = b64 => `data:image/jpeg;base64,${b64}`;

/* base64 → Blob */
export async function base64ToBlob(b64, mime = 'image/png') {
  const res = await fetch(`data:${mime};base64,${b64}`);
  return res.blob();
}
