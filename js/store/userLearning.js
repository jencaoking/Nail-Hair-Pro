/* 用户端行为学习与个性化画像追踪（Client-side Learning Model）
 * 1. 毫秒级捕获交互行为并打分；
 * 2. 内存与 localStorage 缓存画像向量与行为流；
 * 3. 异步平滑同步至服务端画像池与多因子推荐算法。
 */

import { getClientId } from './settings.js';
import { inspirations } from '../data/inspirations.js';

const STORAGE_KEY = 'ti.user_learning.v2';

let eventQueue = [];
let syncTimer = null;
let currentPersona = null;

// 从 localStorage 初始化
function loadLocalLearning() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      events: Array.isArray(raw.events) ? raw.events : [],
      persona: raw.persona || null,
      lastSync: raw.lastSync || 0
    };
  } catch {
    return { events: [], persona: null, lastSync: 0 };
  }
}

function saveLocalLearning(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* 忽略空间满 */ }
}

/**
 * 追踪记录用户交互行为
 * @param {object} ev { type, cat, inspId, tags, query }
 */
export function trackBehavior(ev) {
  if (!ev || !ev.type) return;
  const event = {
    t: Date.now(),
    type: ev.type,
    cat: ev.cat || null,
    inspId: ev.inspId || null,
    tags: Array.isArray(ev.tags) ? ev.tags : [],
    query: ev.query || null
  };

  const local = loadLocalLearning();
  local.events.unshift(event);
  if (local.events.length > 80) local.events.length = 80;
  saveLocalLearning(local);

  eventQueue.push(event);

  // 防抖异步同步到服务端
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushEventsToServer, 1500);
}

/**
 * 将队列中的行为批量同步至服务端
 */
export async function flushEventsToServer() {
  if (eventQueue.length === 0) return;
  const eventsToSend = eventQueue.slice();
  eventQueue = [];

  const clientId = getClientId();
  if (!clientId) return;

  try {
    const res = await fetch('/api/user/behavior', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        events: eventsToSend
      })
    });
    if (res.ok) {
      const j = await res.json();
      if (j && j.ok && j.persona) {
        currentPersona = j.persona;
        const local = loadLocalLearning();
        local.persona = j.persona;
        local.lastSync = Date.now();
        saveLocalLearning(local);
      }
    }
  } catch {
    // 弱网失败，放回队列重试
    eventQueue = eventsToSend.concat(eventQueue);
  }
}

/**
 * 获取当前用户的个性化画像
 */
export function getCachedPersona() {
  if (currentPersona) return currentPersona;
  const local = loadLocalLearning();
  return local.persona || {
    isColdStart: true,
    personaType: 'explorer',
    personaName: '灵感探索新手',
    personaBadge: '🌱 灵感初探',
    confidence: 0,
    topTags: []
  };
}

/**
 * 获取个性化推荐灵感列表（优先服务端，降级本地智能重排）
 * @param {object} opts { cat, limit }
 */
export async function fetchPersonalizedRecommendations(opts = {}) {
  const clientId = getClientId();
  const cat = opts.cat || 'all';
  const limit = opts.limit || 12;

  try {
    const res = await fetch(`/api/recommendations?clientId=${encodeURIComponent(clientId)}&cat=${encodeURIComponent(cat)}&limit=${limit}`);
    if (res.ok) {
      const j = await res.json();
      if (j && j.ok && Array.isArray(j.recommendations)) {
        if (j.persona) currentPersona = j.persona;
        return j.recommendations.map(r => r.item || r);
      }
    }
  } catch {
    /* 降级客户端本地重排 */
  }

  // 客户端降级推荐逻辑
  const persona = getCachedPersona();
  let pool = inspirations.slice();
  if (cat && cat !== 'all') {
    pool = pool.filter(i => i.cat === cat);
  }

  return pool.sort((a, b) => {
    let scoreA = a.hot ? 2 : 0;
    let scoreB = b.hot ? 2 : 0;
    if (persona.topTags && persona.topTags.length > 0) {
      for (const t of persona.topTags) {
        if (a.tags && a.tags.includes(t.tag)) scoreA += (t.score || 1);
        if (b.tags && b.tags.includes(t.tag)) scoreB += (t.score || 1);
      }
    }
    return scoreB - scoreA;
  }).slice(0, limit);
}
