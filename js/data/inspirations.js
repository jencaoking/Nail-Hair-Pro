/* 内置灵感数据：52 条（美甲 24 / 发色 16 / 发型 12），全部原创，零版权风险
 * cat: nail | hairColor | hairStyle
 * palette: 卡片首屏渐变色（秒开），pattern: 参数化 SVG 图案名
 * prompt: 英文描述，点击卡片即注入 AI 试戴
 */
export const inspirations = [
  /* ---------- 美甲 24 ---------- */
  { id: 'n01', cat: 'nail', title: '奶油白猫眼', tags: ['日系', '清透'], palette: ['#F6EEE3', '#E9D8C3', '#C9A87C'], pattern: 'cat-eye', prompt: 'milky white cat-eye gel nails with a soft shimmer band', hot: true },
  { id: 'n02', cat: 'nail', title: '经典法式', tags: ['通勤', '气质'], palette: ['#FBEFE6', '#F3DCD2', '#FFFFFF'], pattern: 'french', prompt: 'classic french tip manicure with a sheer pink base and white tips' },
  { id: 'n03', cat: 'nail', title: '裸粉腮红甲', tags: ['显白', '温柔'], palette: ['#F9E4E4', '#F2C9CD', '#E8AEB6'], pattern: 'blush', prompt: 'blush pink ombré nails, soft airbrushed gradient', hot: true },
  { id: 'n04', cat: 'nail', title: '碎钻闪钻', tags: ['派对', '闪耀'], palette: ['#EFEBF7', '#D6CDEB', '#B9A9E0'], pattern: 'glitter', prompt: 'sparkling rhinestone nails with scattered crystal glitter' },
  { id: 'n05', cat: 'nail', title: '奶茶裸色', tags: ['秋冬', '百搭'], palette: ['#EAD9C5', '#D9BEA3', '#BC9B7E'], pattern: 'solid', prompt: 'milk-tea nude solid color gel nails, glossy finish' },
  { id: 'n06', cat: 'nail', title: '蜜桃渐变', tags: ['元气', '春夏'], palette: ['#FFDFD3', '#FFBBA6', '#F68F94'], pattern: 'gradient', prompt: 'peach ombré gradient nails fading from soft peach to coral' },
  { id: 'n07', cat: 'nail', title: '镜面镀铬', tags: ['酷感', '未来'], palette: ['#E8E8EC', '#C9CBD6', '#9FA3B5'], pattern: 'chrome', prompt: 'chrome mirror metallic nails with liquid silver finish' },
  { id: 'n08', cat: 'nail', title: '小熊手绘', tags: ['可爱', '手绘'], palette: ['#F7E8D8', '#E3C4AC', '#8A6A55'], pattern: 'bear', prompt: 'cute hand-painted teddy bear art nails on cream background', hot: true },
  { id: 'n09', cat: 'nail', title: '星星贴纸', tags: ['童趣', '跳色'], palette: ['#FFF4D6', '#FFE29A', '#FFD66B'], pattern: 'stars', prompt: 'playful star sticker nails with gold star decals on pastel yellow' },
  { id: 'n10', cat: 'nail', title: '蓝色猫眼', tags: ['神秘', '显白'], palette: ['#DCE8F5', '#9FB8DE', '#5E7DB8'], pattern: 'cat-eye', prompt: 'deep blue cat-eye magnetic gel nails with glowing shimmer' },
  { id: 'n11', cat: 'nail', title: '樱花粉', tags: ['春日', '少女'], palette: ['#FFE9EE', '#FFC9D6', '#F79EAE'], pattern: 'floral', prompt: 'cherry blossom nails with tiny pink flower petals' },
  { id: 'n12', cat: 'nail', title: '黑金法式', tags: ['高级', '晚宴'], palette: ['#2B2622', '#4A4038', '#D9B36A'], pattern: 'french', prompt: 'black and gold french tip nails, elegant gold foil line on black tips' },
  { id: 'n13', cat: 'nail', title: '薄荷绿纯色', tags: ['清爽', '夏日'], palette: ['#DFF3E9', '#A9DEC5', '#7EC9A8'], pattern: 'solid', prompt: 'mint green solid gel nails with a fresh glossy finish' },
  { id: 'n14', cat: 'nail', title: '紫水晶碎晶', tags: ['梦幻', '仙气'], palette: ['#EFE6F8', '#CDB6E8', '#A688D1'], pattern: 'glitter', prompt: 'amethyst purple nails with crushed crystal shimmer overlay' },
  { id: 'n15', cat: 'nail', title: '枫叶红', tags: ['秋冬', '复古'], palette: ['#F5D9C8', '#E0A184', '#B45B3C'], pattern: 'solid', prompt: 'warm maple red solid nails, autumn vibes, cream finish' },
  { id: 'n16', cat: 'nail', title: '云朵渐变', tags: ['治愈', '蓝天'], palette: ['#E3F0FA', '#BBD9F2', '#FFFFFF'], pattern: 'gradient', prompt: 'cloudy sky ombré nails, baby blue fading into white clouds' },
  { id: 'n17', cat: 'nail', title: '格纹手绘', tags: ['学院', '手绘'], palette: ['#FBEFE6', '#E9C9BE', '#C47F72'], pattern: 'check', prompt: 'hand-painted gingham check pattern nails in cream and terracotta' },
  { id: 'n18', cat: 'nail', title: '珍珠装饰', tags: ['法式', '优雅'], palette: ['#F8F2EA', '#EADFD2', '#FFFFFF'], pattern: 'pearl', prompt: 'pearl accent nails with tiny white pearls along the cuticle line', hot: true },
  { id: 'n19', cat: 'nail', title: '草莓奶昔', tags: ['甜系', '可爱'], palette: ['#FFE3DC', '#FFAFA8', '#E56A6A'], pattern: 'floral', prompt: 'strawberry milkshake nails with tiny strawberry art and pink base' },
  { id: 'n20', cat: 'nail', title: '极光碎闪', tags: ['夜空', '派对'], palette: ['#DDE7F8', '#A3B8E8', '#6E7FD1'], pattern: 'glitter', prompt: 'aurora glitter nails with teal-purple iridescent shimmer' },
  { id: 'n21', cat: 'nail', title: '奶白拼可可', tags: ['跳色', '简约'], palette: ['#F4EBE0', '#D8C3B2', '#6F5546'], pattern: 'solid', prompt: 'two-tone nails alternating cream white and cocoa brown' },
  { id: 'n22', cat: 'nail', title: '玫瑰浮雕', tags: ['立体', '礼服'], palette: ['#FBE9E4', '#EFC3BC', '#D08A88'], pattern: 'floral', prompt: '3D rose relief nails with sculpted pale pink flowers' },
  { id: 'n23', cat: 'nail', title: '果冻水透', tags: ['透明', '水润'], palette: ['#E9F4EE', '#C3E5D6', '#9ED0BB'], pattern: 'blush', prompt: 'translucent jelly nails with a wet glossy watery finish' },
  { id: 'n24', cat: 'nail', title: '灰紫雾霾', tags: ['高级灰', '秋冬'], palette: ['#E5E0E9', '#C4B9CE', '#9B8BA8'], pattern: 'solid', prompt: 'misty mauve grey solid nails, muted and elegant' },

  /* ---------- 发色 16 ---------- */
  { id: 'h01', cat: 'hairColor', title: '蜜桃棕', tags: ['显白', '温柔'], palette: ['#F2D6C0', '#D9A583', '#B5744F'], pattern: 'strands', prompt: 'peach brown balayage hair color with warm soft tones', hot: true },
  { id: 'h02', cat: 'hairColor', title: '奶茶灰', tags: ['雾感', '韩系'], palette: ['#E6DFD8', '#C6B8AC', '#9E8D80'], pattern: 'strands', prompt: 'milk tea grey hair color with a hazy ashy finish' },
  { id: 'h03', cat: 'hairColor', title: '雾霾蓝', tags: ['冷调', '个性'], palette: ['#D8E2EC', '#9FB4CC', '#6F89A8'], pattern: 'strands', prompt: 'misty blue hair color, soft smoky blue-grey tones' },
  { id: 'h04', cat: 'hairColor', title: '枫叶红铜', tags: ['暖调', '秋冬'], palette: ['#F0CBAF', '#C97F5A', '#91482C'], pattern: 'strands', prompt: 'maple red copper hair color with warm autumn shine', hot: true },
  { id: 'h05', cat: 'hairColor', title: '黑茶色', tags: ['低调', '职场'], palette: ['#4A3B33', '#2E241F', '#5C4A42'], pattern: 'strands', prompt: 'dark tea brown hair color, near-black with brown undertones' },
  { id: 'h06', cat: 'hairColor', title: '蜜糖金', tags: ['元气', '春夏'], palette: ['#F7E3B8', '#E5BE7C', '#C99A4B'], pattern: 'strands', prompt: 'honey golden blonde hair color with sunlit warmth' },
  { id: 'h07', cat: 'hairColor', title: '玫瑰粉挑染', tags: ['甜酷', '挑染'], palette: ['#F9DFE3', '#EFA9B8', '#D77A93'], pattern: 'streaks', prompt: 'rose pink highlights dyed on dark hair, face-framing streaks' },
  { id: 'h08', cat: 'hairColor', title: '蓝黑隐藏挑染', tags: ['隐藏色', '酷感'], palette: ['#2B3440', '#1C232E', '#5D7A9E'], pattern: 'streaks', prompt: 'hidden blue-black underlayer highlights, visible when hair moves' },
  { id: 'h09', cat: 'hairColor', title: '栗子棕', tags: ['日常', '显白'], palette: ['#E8D0B8', '#B98A63', '#8A5B3A'], pattern: 'strands', prompt: 'chestnut brown hair color with natural warm gloss' },
  { id: 'h10', cat: 'hairColor', title: '亚麻灰棕', tags: ['雾感', '高级'], palette: ['#DED6CC', '#B3A696', '#8A7D6E'], pattern: 'strands', prompt: 'ash brown linen hair color with cool grey undertones' },
  { id: 'h11', cat: 'hairColor', title: '酒红波尔多', tags: ['复古', '浓颜'], palette: ['#E3B4B8', '#A34A56', '#6E2432'], pattern: 'strands', prompt: 'burgundy wine red hair color with deep glossy shine' },
  { id: 'h12', cat: 'hairColor', title: '樱花粉', tags: ['少女', '春日'], palette: ['#F9E2E6', '#F0AEBE', '#E17E97'], pattern: 'strands', prompt: 'cherry blossom pink hair color, soft pastel rose' },
  { id: 'h13', cat: 'hairColor', title: '奶油浅金', tags: ['洋气', '夏日'], palette: ['#F6EBD4', '#E7CE9E', '#D0AE72'], pattern: 'strands', prompt: 'cream blonde hair color with buttery pale gold tones' },
  { id: 'h14', cat: 'hairColor', title: '薄荷绿挑染', tags: ['个性', '挑染'], palette: ['#DFF2E6', '#A5D9C0', '#6FB89A'], pattern: 'streaks', prompt: 'mint green highlights on light brown hair, fresh streaks' },
  { id: 'h15', cat: 'hairColor', title: '灰紫香芋', tags: ['梦幻', '雾感'], palette: ['#E6DFEE', '#C0B2D1', '#9482AC'], pattern: 'strands', prompt: 'mauve grey lavender hair color with dreamy misty tones' },
  { id: 'h16', cat: 'hairColor', title: '深海蓝', tags: ['冷调', '个性'], palette: ['#CBDCEB', '#8AA6C4', '#54718F'], pattern: 'strands', prompt: 'deep ocean blue hair color with cool marine depth' },

  /* ---------- 发型 12 ---------- */
  { id: 's01', cat: 'hairStyle', title: '锁骨发', tags: ['百搭', '显瘦'], palette: ['#EFE0D3', '#CDA88C', '#A67B5D'], pattern: 'waves', prompt: 'collarbone-length lob haircut, straight with soft ends', hot: true },
  { id: 's02', cat: 'hairStyle', title: '法式卷', tags: ['慵懒', '浪漫'], palette: ['#F2DDC9', '#D4A987', '#B07E5C'], pattern: 'curls', prompt: 'french curly hair, loose romantic curls with volume' },
  { id: 's03', cat: 'hairStyle', title: '羊毛卷', tags: ['蓬松', '显发量'], palette: ['#E9D3C1', '#C79E80', '#9C7050'], pattern: 'curls', prompt: 'lamb wool tight curly perm, fluffy voluminous coils', hot: true },
  { id: 's04', cat: 'hairStyle', title: '八字刘海', tags: ['修饰脸型', '温柔'], palette: ['#F0DCCB', '#CFA98B', '#AB7F5F'], pattern: 'waves', prompt: 'curtain bangs with shoulder-length hair, face-framing layers' },
  { id: 's05', cat: 'hairStyle', title: '齐肩短发', tags: ['利落', '职场'], palette: ['#E8D8CB', '#C4A488', '#98765A'], pattern: 'straight', prompt: 'shoulder-length blunt bob haircut, clean and neat' },
  { id: 's06', cat: 'hairStyle', title: '高马尾', tags: ['元气', '运动'], palette: ['#F1DFD2', '#D2AC8E', '#AC8163'], pattern: 'ponytail', prompt: 'sleek high ponytail with a soft face-framing fringe' },
  { id: 's07', cat: 'hairStyle', title: '温柔大波浪', tags: ['女神', '约会'], palette: ['#F3DFC9', '#D8AE88', '#B4825F'], pattern: 'waves', prompt: 'soft glamorous hollywood waves, long flowing curls' },
  { id: 's08', cat: 'hairStyle', title: '层次剪', tags: ['轻盈', '灵动'], palette: ['#EDDACA', '#CBA98A', '#A37C5E'], pattern: 'waves', prompt: 'layered haircut with feathered face-framing layers' },
  { id: 's09', cat: 'hairStyle', title: '丸子头', tags: ['清爽', '夏日'], palette: ['#EFE1D5', '#CDAE93', '#A58267'], pattern: 'bun', prompt: 'cute messy bun updo with loose baby hairs' },
  { id: 's10', cat: 'hairStyle', title: '齐耳短BOB', tags: ['减龄', '俏皮'], palette: ['#E6D5C6', '#C09C7E', '#95704F'], pattern: 'straight', prompt: 'ear-length short bob with tucked ends, playful and youthful' },
  { id: 's11', cat: 'hairStyle', title: '复古港风卷', tags: ['港风', '浓颜'], palette: ['#EFD9C6', '#CBA183', '#A2704E'], pattern: 'curls', prompt: 'retro 90s hong kong style voluminous curls with middle part' },
  { id: 's12', cat: 'hairStyle', title: '中分微卷', tags: ['自然', '通勤'], palette: ['#F0DFCF', '#D0AD8D', '#A97F5F'], pattern: 'waves', prompt: 'middle-part hair with subtle loose waves, natural everyday look' }
];

export function byCat(cat) {
  return inspirations.filter(i => i.cat === cat);
}

export function byId(id) {
  return inspirations.find(i => i.id === id) || null;
}

/* 按日期确定性轮换的今日推荐 */
export function dailyPicks(count = 6) {
  const day = Math.floor(Date.now() / 86400000);
  const hot = inspirations.filter(i => i.hot);
  const rest = inspirations.filter(i => !i.hot);
  const pool = [...hot, ...rest];
  const picks = [];
  for (let i = 0; i < count; i++) {
    const idx = (day * 7 + i * 13) % pool.length;
    let item = pool.splice(idx % pool.length, 1)[0];
    picks.push(item);
  }
  return picks;
}

/* 参数化 SVG 图案（甲面/发丝装饰），未知图案回落为光带 */
export function svgPattern(pattern, palette = ['#FF9BB3', '#FFD9E3', '#FFF'] ) {
  const [a, b, c] = palette;
  const common = `preserveAspectRatio="none" aria-hidden="true"`;
  switch (pattern) {
    case 'french':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><path d="M0 62 Q50 48 100 62 L100 100 L0 100 Z" fill="#fff" opacity=".9"/><path d="M0 62 Q50 48 100 62" fill="none" stroke="${b}" stroke-width="4"/></svg>`;
    case 'cat-eye':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><path d="M10 100 Q50 20 90 100 Z" fill="${c}" opacity=".55"/></svg>`;
    case 'glitter':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${Array.from({ length: 26 }, () => {
        const x = (Math.random() * 96 + 2).toFixed(1), y = (Math.random() * 96 + 2).toFixed(1), r = (Math.random() * 1.6 + 0.7).toFixed(1);
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".85"/>`;
      }).join('')}</svg>`;
    case 'stars':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[[20, 25, 9], [55, 15, 6], [80, 40, 8], [30, 65, 7], [65, 78, 9]].map(([x, y, r]) =>
        `<path d="M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3} Z" fill="${c}" opacity=".9"/>`).join('')}</svg>`;
    case 'bear':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><circle cx="32" cy="38" r="9" fill="${c}"/><circle cx="68" cy="38" r="9" fill="${c}"/><circle cx="50" cy="52" r="20" fill="${c}"/><circle cx="43" cy="49" r="2.4" fill="#5C4A42"/><circle cx="57" cy="49" r="2.4" fill="#5C4A42"/><ellipse cx="50" cy="58" rx="4" ry="3" fill="#5C4A42" opacity=".7"/></svg>`;
    case 'floral':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[[25, 30], [70, 22], [50, 62], [22, 74], [78, 70]].map(([x, y]) =>
        [0, 72, 144, 216, 288].map(r => `<ellipse cx="${x}" cy="${y - 7}" rx="4" ry="7" fill="${c}" opacity=".8" transform="rotate(${r} ${x} ${y})"/>`).join('') + `<circle cx="${x}" cy="${y}" r="3" fill="${b}"/>`).join('')}</svg>`;
    case 'check':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><defs><pattern id="gingham" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c}" opacity=".7"/><rect x="10" y="10" width="10" height="10" fill="${c}" opacity=".7"/></pattern></defs><rect width="100" height="100" fill="url(#gingham)"/></svg>`;
    case 'pearl':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[15, 35, 55, 75, 92].map((x, i) => `<circle cx="${x}" cy="${86 + (i % 2) * 6}" r="5" fill="#fff" stroke="${b}" stroke-width="1.4"/>`).join('')}</svg>`;
    case 'chrome':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><rect x="18" y="-10" width="16" height="120" fill="#fff" opacity=".5" transform="rotate(24 50 50)"/><rect x="58" y="-10" width="8" height="120" fill="#fff" opacity=".35" transform="rotate(24 50 50)"/></svg>`;
    case 'blush':
    case 'gradient':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><defs><radialGradient id="blush-g" cx="50%" cy="70%" r="70%"><stop offset="0%" stop-color="${c}" stop-opacity=".9"/><stop offset="100%" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#blush-g)"/></svg>`;
    case 'solid':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><rect x="14" y="20" width="72" height="76" rx="14" fill="${c}" opacity=".55"/></svg>`;
    case 'strands':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[18, 34, 50, 66, 82].map((x, i) => `<path d="M${x} -5 Q${x + (i % 2 ? 10 : -10)} 50 ${x} 105" fill="none" stroke="${c}" stroke-width="${3 + (i % 2) * 2}" opacity=".6"/>`).join('')}</svg>`;
    case 'streaks':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[[26, 0], [58, 6], [80, -4]].map(([x, o], i) => `<path d="M${x} -5 Q${x - 8} 50 ${x + 4} 105" fill="none" stroke="${c}" stroke-width="5" opacity=".8"/><path d="M${x} -5 Q${x - 8} 50 ${x + 4} 105" fill="none" stroke="${i % 2 ? a : b}" stroke-width="2" opacity=".9"/>`).join('')}</svg>`;
    case 'waves':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[24, 46, 68].map((y, i) => `<path d="M-5 ${y} Q25 ${y - 14} 50 ${y} T105 ${y}" fill="none" stroke="${c}" stroke-width="${4 - i}" opacity=".65"/>`).join('')}</svg>`;
    case 'curls':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[[25, 30], [62, 22], [42, 62], [78, 58], [18, 76], [58, 84]].map(([x, y]) => `<path d="M${x} ${y} q10 -12 18 0 q8 12 -6 16 q-12 3 -12 -8" fill="none" stroke="${c}" stroke-width="3" opacity=".7"/>`).join('')}</svg>`;
    case 'straight':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}>${[30, 52, 74].map(x => `<path d="M${x} -5 L${x - 4} 105" fill="none" stroke="${c}" stroke-width="3" opacity=".55"/>`).join('')}</svg>`;
    case 'ponytail':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><path d="M50 12 q22 4 20 34 q-2 30 10 44 q-30 14 -58 0 q12 -14 10 -44 q-2 -30 18 -34z" fill="${c}" opacity=".55"/></svg>`;
    case 'bun':
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><circle cx="50" cy="30" r="17" fill="${c}" opacity=".75"/><path d="M30 55 q20 -10 40 0 q4 26 -20 40 q-24 -14 -20 -40z" fill="${c}" opacity=".5"/></svg>`;
    default:
      return `<svg class="pattern" viewBox="0 0 100 100" ${common}><ellipse cx="50" cy="56" rx="30" ry="38" fill="${c}" opacity=".4"/></svg>`;
  }
}

/* Pollinations 文生图 URL（灵感卡懒加载，无密钥） */
export function cardAiUrl(item) {
  const seed = item.id.charCodeAt(0) * 131 + Number(item.id.slice(1)) * 17;
  const q = encodeURIComponent(`${item.prompt}, beauty photography, clean soft background, high detail, pastel tones`);
  return `https://image.pollinations.ai/prompt/${q}?width=480&height=480&nologo=true&seed=${seed}&referrer=nail-hair-inspo`;
}

/* 灵感卡 DOM（strip 横滑 / grid 网格共用） */
export function renderInspCard(item, { selected = false, lazy = true } = {}) {
  const card = document.createElement('button');
  card.className = 'insp-card' + (selected ? ' selected' : '');
  card.dataset.inspId = item.id;
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-pressed', selected ? 'true' : 'false');

  const grad = `linear-gradient(135deg, ${item.palette.join(', ')})`;
  card.innerHTML = `
    <div class="thumb">
      ${item.hot ? '<span class="hot-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 6.9L22 9.2l-5.4 4.7 1.8 7.1L12 17l-6.4 4 1.8-7.1L2 9.2l7.6-.3z"/></svg>人气</span>' : ''}
      <div class="grad" style="background:${grad}"></div>
      ${svgPattern(item.pattern, item.palette)}
      <img class="card-ai" alt="${item.title}灵感示例图" loading="${lazy ? 'lazy' : 'eager'}" decoding="async">
    </div>
    <div class="info">
      <div class="t">${item.title}</div>
      <div class="tags">${item.tags.map(t => `<span class="chip plain">${t}</span>`).join('')}</div>
    </div>`;

  const img = card.querySelector('.card-ai');
  img.addEventListener('load', () => img.classList.add('loaded'));
  img.addEventListener('error', () => img.remove());   /* 失败静默保留色卡 */
  img.src = cardAiUrl(item);
  return card;
}
