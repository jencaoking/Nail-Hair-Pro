/* 错误分类：服务端下发的 type 映射为可爱风文案（不再引导用户配密钥） */
export class AIError extends Error {
  constructor(type, message) {
    super(message || type);
    this.name = 'AIError';
    this.type = type;
  }
}

export const ERROR_COPY = {
  Network: { face: '小蝴蝶结打结了 >_<', msg: '网络不太顺畅，图片没能送出去', sub: '稍等一下再试；如果一直失败，可能站点流量太挤啦。' },
  ServerDown: { face: '魔法屋暂时打烊 >_<', msg: '生成服务没有响应', sub: '请确认站点已正常启动，稍后再来试一次。' },
  RateLimit: { face: '排队的小兔子太多了 >_<', msg: '现在人多，需要等一小会儿', sub: '免费引擎偶尔会挤，稍后重试一般就好啦。' },
  Quota: { face: '额度小饼干不够了 >_<', msg: '站点当前引擎额度不足', sub: '站点会尽快恢复，也可以稍后再来看看。' },
  Limit: { face: '今日小饼干分完了 >_<', msg: '今天的免费额度用完啦', sub: '明天再来，会有新的额度哦。' },
  Blocked: { face: '访问被暂时限制 >_<', msg: '暂时无法使用生成功能', sub: '如有疑问，请联系站点管理员。' },
  Content: { face: '这张照片被拦下了 >_<', msg: '引擎认为这张照片不适合编辑', sub: '换一张光线更好、更清晰的照片试试（纯手部或纯头像效果最佳）。' },
  Timeout: { face: '魔法施得太久了 >_<', msg: '生成超时了', sub: '免费引擎偶尔会慢，重试一次试试。' },
  UserCancel: { face: '已取消', msg: '已取消这次生成', sub: '' },
  Unknown: { face: '小蝴蝶结打结了 >_<', msg: '出了点小状况', sub: '重试一下，一般就能解决。' }
};

export function normalizeError(err) {
  if (err instanceof AIError) return err;
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new AIError('Timeout', '生成超时');
  }
  if (err instanceof TypeError) {
    return new AIError('ServerDown', '无法连接生成服务');
  }
  return new AIError('Unknown', (err && err.message) || '未知错误');
}

export function copyFor(err) {
  return ERROR_COPY[err && err.type] || ERROR_COPY.Unknown;
}
