/* 用户学习与推荐算法引擎（服务端）
 * 1. 用户特征向量与画像聚类（User Persona Clustering & Feature Vector）
 * 2. 行为时间衰减模型（Exponential Half-life Decay）
 * 3. 多因子混合推荐算法（Content-based + Hotness + Freshness + Diversity Exploration）
 */

import { inspirations } from '../js/data/inspirations.js';

/* 默认推荐算法超参数 */
export const DEFAULT_REC_SETTINGS = {
  preset: 'balanced',           // 'balanced' | 'hyper_personal' | 'trending' | 'discover'
  personalWeight: 0.45,         // 个性化偏好权重 [0, 1]
  hotnessWeight: 0.20,          // 热门爆款权重 [0, 1]
  freshnessWeight: 0.15,        // 新鲜度/轮换权重 [0, 1]
  exploreWeight: 0.20,          // 多样性探索权重 [0, 1]
  decayHalfLifeDays: 7,         // 行为衰减半衰期 (天)
  categoryBoost: 0.15,          // 主力偏好分类加权 [0, 0.5]
  minExplorationRatio: 0.20     // 探索款保底比例
};

/* 预设方案 */
export const REC_PRESETS = {
  balanced: {
    preset: 'balanced',
    label: '均衡智能推荐',
    desc: '兼顾个性化画像、爆款热度与风格探索，适合大多数用户',
    personalWeight: 0.45,
    hotnessWeight: 0.20,
    freshnessWeight: 0.15,
    exploreWeight: 0.20,
    decayHalfLifeDays: 7
  },
  hyper_personal: {
    preset: 'hyper_personal',
    label: '深度个性化',
    desc: '深度聚焦用户历史偏好风格与色系，推荐高度契合的同类款式',
    personalWeight: 0.70,
    hotnessWeight: 0.10,
    freshnessWeight: 0.10,
    exploreWeight: 0.10,
    decayHalfLifeDays: 14
  },
  trending: {
    preset: 'trending',
    label: '流行爆款导向',
    desc: '以全站热门、高点赞与高试戴率款式为主，降低小众探索',
    personalWeight: 0.20,
    hotnessWeight: 0.55,
    freshnessWeight: 0.15,
    exploreWeight: 0.10,
    decayHalfLifeDays: 5
  },
  discover: {
    preset: 'discover',
    label: '灵感探索发现',
    desc: '主动推送用户未尝试过的冷门宝藏与新品，激发尝试新风格',
    personalWeight: 0.25,
    hotnessWeight: 0.15,
    freshnessWeight: 0.25,
    exploreWeight: 0.35,
    decayHalfLifeDays: 3
  }
};

/* 人群画像规则定义 */
const PERSONA_DEFINITIONS = [
  {
    type: 'french_chic',
    name: '法式优雅气质族',
    badge: '💅 法式名媛',
    desc: '偏好法式白边、珍珠点缀、裸粉腮红、日常通勤与利落发型，追求高级耐看质感。',
    matchTags: ['法式', '优雅', '气质', '通勤', '显白', '温柔', '锁骨发', '齐肩短发', '黑茶色'],
    preferredCats: ['nail', 'hairStyle']
  },
  {
    type: 'cateye_fairy',
    name: '清透猫眼仙气控',
    badge: '✨ 仙气猫眼',
    desc: '热衷高光磁吸猫眼、碎钻闪粉、果冻透色与梦幻雾霾发色，追求清透光泽感。',
    matchTags: ['猫眼', '清透', '日系', '闪耀', '派对', '梦幻', '仙气', '水润', '透明', '极光'],
    preferredCats: ['nail', 'hairColor']
  },
  {
    type: 'dopamine_trendy',
    name: '多巴胺甜酷先锋',
    badge: '⚡ 甜酷先锋',
    desc: '喜欢挑染、手绘涂鸦、童趣小熊、镀铬金属与亮眼跳色，彰显个性与潮流态度。',
    matchTags: ['甜酷', '挑染', '手绘', '可爱', '童趣', '跳色', '酷感', '未来', '立体', '个性'],
    preferredCats: ['nail', 'hairColor']
  },
  {
    type: 'retro_glamour',
    name: '复古浓颜大女主',
    badge: '🍷 复古港风',
    desc: '偏好枫叶红铜、波尔多酒红、大波浪与蓬松羊毛卷，气场全开，极具浓郁氛围感。',
    matchTags: ['复古', '秋冬', '港风', '浓颜', '女神', '约会', '大波浪', '羊毛卷', '浪漫'],
    preferredCats: ['hairColor', 'hairStyle']
  },
  {
    type: 'korean_soft',
    name: '韩系氛围感达人',
    badge: '🌸 韩系氛围',
    desc: '喜爱奶茶灰棕、八字刘海、锁骨发与渐变腮红甲，偏好自然修饰与灵动松弛感。',
    matchTags: ['韩系', '雾感', '修饰脸型', '自然', '灵动', '轻盈', '日常', '蜜桃', '渐变'],
    preferredCats: ['hairStyle', 'hairColor', 'nail']
  },
  {
    type: 'minimalist',
    name: '极简日常百搭派',
    badge: '☕ 简约百搭',
    desc: '偏好纯色、奶茶裸色、中分微卷等低调耐看款式，注重实用与显白百搭。',
    matchTags: ['百搭', '简约', '显白', '职场', '低调', '自然', '日常', '纯色'],
    preferredCats: ['nail', 'hairStyle']
  }
];

/* 行为类型权重 */
const EVENT_WEIGHTS = {
  view_insp: 1.0,
  select_insp: 2.2,
  search_tag: 1.5,
  tryon_generate: 5.0,
  tryon_save: 8.0,
  compare_interact: 1.2
};

/**
 * 计算时间衰减因子
 * @param {number} timestamp 毫秒时间戳
 * @param {number} halfLifeDays 半衰期天数
 */
export function calcTimeDecay(timestamp, halfLifeDays = 7) {
  const diffDays = Math.max(0, (Date.now() - timestamp) / (86400 * 1000));
  return Math.exp(-Math.LN2 * diffDays / Math.max(1, halfLifeDays));
}

/**
 * 基于用户历史行为事件，计算用户画像特征向量
 * @param {Array} events 用户行为事件数组
 * @param {object} settings 推荐配置
 */
export function computeUserPersona(events = [], settings = DEFAULT_REC_SETTINGS) {
  const halfLife = settings.decayHalfLifeDays || 7;
  const tagScores = {};
  const catScores = { nail: 0, hairColor: 0, hairStyle: 0 };
  const colorAffinities = { warm: 0, cool: 0, neutral: 0, dark: 0, light: 0 };
  const triedItemIds = new Set();
  let totalWeightedEngagement = 0;
  let generateCount = 0;
  let saveCount = 0;

  for (const ev of events) {
    const t = ev.t || Date.now();
    const decay = calcTimeDecay(t, halfLife);
    const weight = (EVENT_WEIGHTS[ev.type] || 1.0) * decay;
    totalWeightedEngagement += weight;

    if (ev.type === 'tryon_generate') generateCount++;
    if (ev.type === 'tryon_save') saveCount++;
    if (ev.inspId) triedItemIds.add(ev.inspId);

    // 分类得分
    if (ev.cat && catScores[ev.cat] !== undefined) {
      catScores[ev.cat] += weight;
    }

    // 标签得分
    if (Array.isArray(ev.tags)) {
      for (const tag of ev.tags) {
        tagScores[tag] = (tagScores[tag] || 0) + weight;
      }
    }

    // 查灵感项补全特征
    if (ev.inspId) {
      const item = inspirations.find(i => i.id === ev.inspId);
      if (item) {
        if (item.cat && catScores[item.cat] !== undefined) {
          catScores[item.cat] += weight * 0.5;
        }
        if (item.tags) {
          for (const tag of item.tags) {
            tagScores[tag] = (tagScores[tag] || 0) + weight * 0.8;
          }
        }
        // 色系特征分析
        if (item.palette && item.palette.length > 0) {
          for (const hex of item.palette) {
            analyzeHexColor(hex, weight, colorAffinities);
          }
        }
      }
    }
  }

  // 归一化分类比例
  const totalCat = catScores.nail + catScores.hairColor + catScores.hairStyle;
  const catRatio = {
    nail: totalCat > 0 ? Math.round((catScores.nail / totalCat) * 100) / 100 : 0.34,
    hairColor: totalCat > 0 ? Math.round((catScores.hairColor / totalCat) * 100) / 100 : 0.33,
    hairStyle: totalCat > 0 ? Math.round((catScores.hairStyle / totalCat) * 100) / 100 : 0.33
  };

  // 标签降序排序
  const sortedTags = Object.entries(tagScores)
    .map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score);

  const topTags = sortedTags.slice(0, 8);

  // 匹配 Persona 聚类
  let bestPersona = PERSONA_DEFINITIONS[PERSONA_DEFINITIONS.length - 1]; // 默认为极简百搭
  let highestPersonaScore = -1;

  for (const p of PERSONA_DEFINITIONS) {
    let pScore = 0;
    for (const tag of p.matchTags) {
      pScore += (tagScores[tag] || 0) * 1.5;
    }
    // 叠加分类偏好
    for (const cat of p.preferredCats) {
      pScore += (catScores[cat] || 0) * 0.8;
    }
    if (pScore > highestPersonaScore) {
      highestPersonaScore = pScore;
      bestPersona = p;
    }
  }

  // 计算学习置信度 (0~100%)
  const sampleCount = events.length;
  const confidence = Math.min(100, Math.round((1 - Math.exp(-sampleCount / 6)) * 100));

  // 冷启动判断
  const isColdStart = sampleCount < 2;

  return {
    isColdStart,
    sampleCount,
    confidence,
    personaType: isColdStart ? 'explorer' : bestPersona.type,
    personaName: isColdStart ? '灵感探索新手' : bestPersona.name,
    personaBadge: isColdStart ? '🌱 灵感初探' : bestPersona.badge,
    personaDesc: isColdStart ? '正在探索各种灵感风格，持续体验即可生成更精准的专属定制画像。' : bestPersona.desc,
    catRatio,
    topTags,
    allTagScores: tagScores,
    colorAffinities,
    stats: {
      totalEvents: sampleCount,
      generateCount,
      saveCount,
      triedCount: triedItemIds.size
    }
  };
}

/**
 * 分析单个 Hex 颜色的冷暖与明暗倾向
 */
function analyzeHexColor(hex, weight, affinities) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // 简单明度
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.65) affinities.light += weight;
  else if (lum < 0.35) affinities.dark += weight;
  else affinities.neutral += weight;

  // 冷暖度
  if (r > b + 20) affinities.warm += weight;
  else if (b > r + 15) affinities.cool += weight;
  else affinities.neutral += weight * 0.5;
}

/**
 * 核心推荐算法：根据用户画像与全站配置，对灵感池进行多因子综合打分重排
 * @param {object} persona 用户画像对象
 * @param {object} options 过滤与打分配置
 */
export function recommendInspirations(persona, options = {}) {
  const {
    cat = 'all',
    limit = 12,
    seed = Math.floor(Date.now() / (1000 * 3600)), // 每小时微调轮换种子
    customWeights = null,
    excludeIds = []
  } = options;

  const weights = { ...DEFAULT_REC_SETTINGS, ...(customWeights || {}) };
  const {
    personalWeight,
    hotnessWeight,
    freshnessWeight,
    exploreWeight,
    categoryBoost
  } = weights;

  let pool = inspirations.slice();
  if (cat && cat !== 'all') {
    pool = pool.filter(item => item.cat === cat);
  }
  if (excludeIds.length > 0) {
    const exSet = new Set(excludeIds);
    pool = pool.filter(item => !exSet.has(item.id));
  }

  const scoredItems = pool.map((item, idx) => {
    // 1. 个性化亲和度 (Personal Affinity) [0 ~ 1]
    let personalScore = 0;
    if (!persona.isColdStart && persona.allTagScores) {
      if (item.tags) {
        for (const t of item.tags) {
          personalScore += (persona.allTagScores[t] || 0);
        }
      }
      // 归一化并压平
      personalScore = Math.min(1.0, personalScore / 8);
    } else {
      // 冷启动时，按默认均衡分
      personalScore = item.hot ? 0.8 : 0.4;
    }

    // 分类加权
    const catAffinity = persona.catRatio ? (persona.catRatio[item.cat] || 0.33) : 0.33;
    const catBonus = catAffinity * categoryBoost;

    // 2. 热门爆款得分 (Hotness Score) [0 ~ 1]
    const hotScore = item.hot ? 1.0 : 0.35;

    // 3. 新鲜度轮换得分 (Freshness / Deterministic Diversity) [0 ~ 1]
    // 伪随机哈希散列
    const charCodeSum = item.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hash = Math.sin(seed * 9301 + charCodeSum * 49297 + idx * 233280) * 10000;
    const freshScore = Math.abs(hash - Math.floor(hash));

    // 4. 多样性/探索发现加分 (Exploration Bonus) [0 ~ 1]
    // 未尝试过且冷门款式加分
    const hasTried = persona.stats && persona.stats.triedCount > 0 && !persona.isColdStart;
    const exploreScore = (!item.hot && hasTried) ? 0.9 : 0.4;

    // 综合加权总分
    const totalScore =
      (personalWeight * personalScore) +
      (hotnessWeight * hotScore) +
      (freshnessWeight * freshScore) +
      (exploreWeight * exploreScore) +
      catBonus;

    return {
      item,
      score: Math.round(totalScore * 1000) / 1000,
      breakdown: {
        personal: Math.round(personalScore * personalWeight * 100) / 100,
        hotness: Math.round(hotScore * hotnessWeight * 100) / 100,
        freshness: Math.round(freshScore * freshnessWeight * 100) / 100,
        explore: Math.round(exploreScore * exploreWeight * 100) / 100,
        catBonus: Math.round(catBonus * 100) / 100
      }
    };
  });

  // 按得分降序排序
  scoredItems.sort((a, b) => b.score - a.score);

  return scoredItems.slice(0, limit);
}

/**
 * 聚合计算全站用户画像分布统计
 * @param {object} [personaCache] 可选：{clientId → persona} 预计算结果，避免每个用户重复计算两次
 */
export function aggregateUserPersonas(userRecords = {}, settings = DEFAULT_REC_SETTINGS, personaCache = null) {
  const distribution = {};
  const tagHeatmap = {};
  const catDistribution = { nail: 0, hairColor: 0, hairStyle: 0 };
  let totalConfidence = 0;
  let activeUsersCount = 0;

  for (const p of PERSONA_DEFINITIONS) {
    distribution[p.type] = {
      type: p.type,
      name: p.name,
      badge: p.badge,
      desc: p.desc,
      coreTags: p.matchTags || [],
      count: 0
    };
  }
  distribution['explorer'] = {
    type: 'explorer',
    name: '灵感探索新手',
    badge: '🌱 灵感初探',
    desc: '冷启动状态，将依托热门与探索因子进行智能冷启动推荐',
    coreTags: [],
    count: 0
  };

  const usersList = Object.entries(userRecords);
  for (const [clientId, u] of usersList) {
    const events = u.behaviorEvents || [];
    const persona = (personaCache && personaCache[clientId]) || computeUserPersona(events, settings);

    if (events.length > 0) activeUsersCount++;
    totalConfidence += persona.confidence;

    // 累计 Persona 类型
    if (distribution[persona.personaType]) {
      distribution[persona.personaType].count++;
    }

    // 累计标签热度
    if (persona.allTagScores) {
      for (const [tag, score] of Object.entries(persona.allTagScores)) {
        tagHeatmap[tag] = (tagHeatmap[tag] || 0) + score;
      }
    }

    // 累计分类偏好
    if (persona.catRatio) {
      catDistribution.nail += persona.catRatio.nail || 0;
      catDistribution.hairColor += persona.catRatio.hairColor || 0;
      catDistribution.hairStyle += persona.catRatio.hairStyle || 0;
    }
  }

  const topTagsHeat = Object.entries(tagHeatmap)
    .map(([tag, score]) => ({ tag, score: Math.round(score * 10) / 10 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const totalUsers = usersList.length || 1;
  const avgConfidence = Math.round(totalConfidence / totalUsers);

  return {
    totalUsers: usersList.length,
    activeLearnedUsers: activeUsersCount,
    avgConfidence,
    personaDistribution: Object.values(distribution).sort((a, b) => b.count - a.count),
    topTagsHeat,
    catDistribution
  };
}
