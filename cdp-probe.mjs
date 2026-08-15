/* CDP 测试：模拟 iPhone 17 Pro 视口（402x874）点击拍照按钮 */
import http from 'node:http';
import fs from 'node:fs';

const PORT = 9222;
let id = 0; const pending = new Map(); let ws;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.onopen = resolve; ws.onerror = reject;
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.log('[EXC]', JSON.stringify(msg.params.exceptionDetails.exception).slice(0, 600));
      } else if (msg.method === 'Page.fileChooserOpened') {
        console.log('[EVENT] Page.fileChooserOpened');
      }
    };
  });
}
const getJson = url => new Promise((res, rej) => {
  http.get(url, r => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>res(JSON.parse(d))); }).on('error', rej);
});
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const targets = await getJson(`http://localhost:${PORT}/json`);
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  await connect(page.webSocketDebuggerUrl);

  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  // 设置 iPhone 视口
  await send('Emulation.setDeviceMetricsOverride', {
    width: 402, height: 874, deviceScaleFactor: 3, mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:3000/?v=3#/nails' });
  await delay(3500);

  // 真实鼠标点击拍照按钮（iPhone 视口）
  const pos = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#nails-source [data-act="camera"]');
      const r = btn.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    })()`,
    returnByValue: true
  }).then(r => JSON.parse(r.result.value));
  console.log('[pos]', JSON.stringify(pos));

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  console.log('[click] camera');
  await delay(3500);

  // 检查点击后状态
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const empty = document.querySelector('#nails-source .zone-empty');
      const ctrl = document.querySelector('#nails-source .cam-ctrl');
      const tip = document.querySelector('#nails-source .cam-tip');
      const v = document.querySelector('#nails-source video');
      const camBtn = document.querySelector('#nails-source [data-act="camera"]');
      const emptyRect = empty ? empty.getBoundingClientRect() : null;
      const ctrlRect = ctrl ? ctrl.getBoundingClientRect() : null;
      return JSON.stringify({
        emptyHidden: empty ? empty.hidden : null,
        emptyDisplay: empty ? getComputedStyle(empty).display : null,
        emptyAttr: empty ? empty.getAttribute('hidden') : null,
        ctrlHidden: ctrl ? ctrl.hidden : null,
        ctrlDisplay: ctrl ? getComputedStyle(ctrl).display : null,
        tipHidden: tip ? tip.hidden : null,
        videoHidden: v ? v.hidden : null,
        emptyRect: emptyRect ? { x: emptyRect.x, y: emptyRect.y, w: emptyRect.width, h: emptyRect.height } : null,
        ctrlRect: ctrlRect ? { x: ctrlRect.x, y: ctrlRect.y, w: ctrlRect.width, h: ctrlRect.height } : null
      }, null, 1);
    })()`,
    returnByValue: true
  });
  console.log('[after click]', r2.result.value);

  // 截图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot && shot.data) {
    fs.writeFileSync(`${process.env.TEMP || 'j:/tmp'}/nhi-after.png`, Buffer.from(shot.data, 'base64'));
    console.log('[shot] saved');
  }

  process.exit(0);
}
main().catch(e => { console.error('[ERR]', e.message); process.exit(1); });