/* 试戴 prompt 模板与拼装器：中文界面 ↔ 英文 prompt */
import { byId } from './inspirations.js';

export function buildNailPrompt(desc) {
  return `Edit this photo of a hand: apply ${desc} nail design on all fingernails. ` +
    `Keep the exact same hand, finger shape, pose, skin tone, jewelry and background. ` +
    `Only change the nail art. Photorealistic, natural lighting, high detail, realistic nail gloss.`;
}

export function buildHairColorPrompt(desc) {
  return `Edit this portrait photo: change only the hair color to ${desc}. ` +
    `Keep the same person, face, hairstyle shape, hair length, skin tone, makeup, clothing, lighting and background. ` +
    `Photorealistic, natural salon result, realistic hair strands.`;
}

export function buildHairStylePrompt(desc) {
  return `Edit this portrait photo: restyle the hair into ${desc}. ` +
    `Keep the same person, face identity, skin tone, makeup, lighting and background. ` +
    `Photorealistic, natural hair texture.`;
}

/**
 * 拼装试戴 prompt
 * @param cat 'nail' | 'hairColor' | 'hairStyle'
 * @param inspId 灵感卡 id（与 customText 至少一个）
 * @param customText 用户自定义描述（可中文；SiliconFlow 的 Qwen 对中文友好）
 */
export function buildPrompt(cat, inspId, customText) {
  const insp = inspId ? byId(inspId) : null;
  const parts = [];
  if (insp) parts.push(insp.prompt);
  if (customText && customText.trim()) parts.push(customText.trim());
  const desc = parts.join(' with ') || 'a natural pretty style';

  if (cat === 'nail') return buildNailPrompt(desc);
  if (cat === 'hairColor') return buildHairColorPrompt(desc);
  return buildHairStylePrompt(desc);
}

/* 生成尺寸：按 dpr 高分屏取 2x，夹在 API 友好区间 */
export function genSize(aspect) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base = 704; /* 长边基准 */
  const long = Math.round(base * dpr);
  const short = Math.round(long * (aspect === 'portrait' ? 3 / 4 : 4 / 3));
  return aspect === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}
