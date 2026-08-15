/* 试戴 prompt 模板与智能拼装算法：中文/英文描述 ↔ 超真实渲染修图 Prompt */
import { byId } from './inspirations.js';

export function buildNailPrompt(desc, opts = {}) {
  const isMatte = /matte|哑光|磨砂/i.test(desc);
  const isChrome = /chrome|金属|极光|镜面/i.test(desc);
  const isCatEye = /cat eye|猫眼|磁吸/i.test(desc);
  const isJelly = /jelly|果冻|清透|透色|冰透/i.test(desc);

  let finishDesc = 'ultra-glossy top coat with crystal shine and realistic specular highlights';
  if (isMatte) finishDesc = 'velvet soft matte finish with refined non-reflective smooth texture';
  else if (isChrome) finishDesc = 'mirror-like liquid chrome luster with futuristic iridescent glow';
  else if (isCatEye) finishDesc = 'deep 3D magnetic cat-eye light band with shimmering galaxy depth';
  else if (isJelly) finishDesc = 'translucent glass-skin jelly effect with luminous sheer depth';

  return `High-end beauty retouching: modify the fingernails in this photo to showcase a flawless "${desc}" nail design. ` +
    `Ensure precision nail shape refinement (almond/coffin/oval/square according to natural curve), ${finishDesc}, seamless cuticle alignment, ` +
    `and realistic micro-shadows along the nail plate. ` +
    `CRITICAL PRESERVATION: Keep the original hand posture, exact finger proportions, natural skin texture, knuckles, skin tone, rings/jewelry, and background identical without distortion. ` +
    `Commercial manicure photography, 8k resolution, crisp focus.`;
}

export function buildHairColorPrompt(desc, opts = {}) {
  return `Professional salon colorist photo edit: precisely transform only the hair color of the person in this photo into "${desc}". ` +
    `Incorporate natural dimensional balayage depth, seamless root transition, glossy salon toning finish, and realistic light refraction on individual hair strands. ` +
    `CRITICAL PRESERVATION: Strictly preserve the original face, facial identity, facial structure, skin tone, eye color, makeup, expression, hairstyle shape, hair length, clothing, and background completely intact. ` +
    `Prevent color bleeding onto skin, forehead, or ears. High-fashion beauty magazine portrait, 8k ultra-sharp detail.`;
}

export function buildHairStylePrompt(desc, opts = {}) {
  return `Master hairstylist precision restyling: modify only the hairstyle and hair cut of the subject to "${desc}". ` +
    `Render natural hair volume, airy texture, soft face-framing layers, delicate flyaway strands, and authentic hair physics while maintaining harmonious head proportions. ` +
    `CRITICAL PRESERVATION: Keep the exact same person, face shape, eyes, nose, lips, facial features, skin complexion, makeup, clothing, lighting direction, and background completely untouched. ` +
    `High-definition editorial studio photography, photorealistic, natural salon aesthetic.`;
}

/**
 * 智能拼装试戴 prompt
 * @param cat 'nail' | 'hairColor' | 'hairStyle'
 * @param inspId 灵感卡 id（与 customText 至少一个）
 * @param customText 用户自定义描述（可中文）
 * @param opts 额外配置与画像提示词
 */
export function buildPrompt(cat, inspId, customText, opts = {}) {
  const insp = inspId ? byId(inspId) : null;
  const parts = [];
  if (insp) parts.push(insp.prompt);
  if (customText && customText.trim()) parts.push(customText.trim());
  const desc = parts.join(' with ') || 'a natural premium aesthetic style';

  if (cat === 'nail') return buildNailPrompt(desc, opts);
  if (cat === 'hairColor') return buildHairColorPrompt(desc, opts);
  return buildHairStylePrompt(desc, opts);
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
