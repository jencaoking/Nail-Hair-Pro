/* hash 路由 + 视图生命周期 */
const routes = {};
let currentName = null;

function parseHash() {
  const name = (location.hash || '').replace(/^#\/?/, '') || 'home';
  return routes[name] ? name : 'home';
}

function activate() {
  const name = parseHash();
  for (const [key, route] of Object.entries(routes)) {
    const isActive = key === name;
    if (isActive) {
      route.el.hidden = false;
      document.querySelectorAll(`[data-nav="${key}"]`).forEach(a => a.setAttribute('aria-current', 'page'));
      if (key !== currentName) route.page && route.page.onEnter && route.page.onEnter();
    } else {
      if (!route.el.hidden) route.page && route.page.onLeave && route.page.onLeave();
      route.el.hidden = true;
      document.querySelectorAll(`[data-nav="${key}"]`).forEach(a => a.removeAttribute('aria-current'));
    }
  }
  currentName = name;
  window.scrollTo(0, 0);
}

export function registerRoutes(map) {
  Object.assign(routes, map);
}

export function start() {
  window.addEventListener('hashchange', activate);
  activate();
}

/* 切换路由并返回一个「页面已激活」的 Promise。
 * 之前调用方用 setTimeout(50ms) 猜测「路由切换 + 页面初始化」的耗时，脆弱且不可靠；
 * 改为在 hashchange 触发（即 activate() 完成）后 resolve，调用方可 await 后再操作页面，
 * 无需猜延时，未来 go() 若改成异步加载页面也不会失效。 */
export function go(name) {
  const target = '#/' + name;
  if (location.hash === target) {
    return Promise.resolve();   // 已是目标页，直接放行
  }
  location.hash = target;
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('hashchange', onHash);
      resolve();
    };
    const onHash = () => finish();
    window.addEventListener('hashchange', onHash);
    setTimeout(finish, 200);   // 兜底：异常环境未触发 hashchange 时也能 resolve
  });
}

export function current() {
  return currentName;
}
