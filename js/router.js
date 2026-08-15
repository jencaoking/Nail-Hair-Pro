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

export function go(name) {
  location.hash = '#/' + name;
}

export function current() {
  return currentName;
}
