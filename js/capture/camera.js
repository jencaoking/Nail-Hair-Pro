/* 相机：getUserMedia 后置优先 / 拍照 / 翻转 / 停流 */

export function cameraSupported() {
  return window.isSecureContext !== false &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function createCamera(videoEl) {
  let stream = null;
  let facing = 'environment';
  let requestId = 0;   // start/flip 请求版本号：解决 getUserMedia 异步竞态导致的流泄漏

  async function start() {
    const myId = ++requestId;
    stop();   // 同步停掉当前流，避免新旧流并存

    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });
    } catch (e) {
      if (myId !== requestId) return;   // 已被更新的请求接管，静默让位
      throw e;                          // 本次就是最新请求且失败，向上抛
    }

    // 过期请求（用户又点了开始/翻转）：立即释放刚拿到的流，避免旧流 track 永不 stop
    if (myId !== requestId) {
      s.getTracks().forEach(t => t.stop());
      return;
    }

    stream = s;
    videoEl.srcObject = stream;
    videoEl.playsInline = true;
    try { await videoEl.play(); } catch (e) { /* 自动播放策略兜底 */ }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    await start();
  }

  function capture(maxEdge = 896, quality = 0.82) {
    const v = videoEl;
    // 边界防护：不仅判 videoWidth，还要确认 stream 存在且视频轨道未结束，
    // 否则取流过程中离开页面/流被 stop 后点拍照会拍到黑帧或空白 canvas。
    if (!v || !v.videoWidth) return Promise.reject(new Error('相机还没准备好'));
    if (!stream || stream.getVideoTracks().every(t => t.readyState === 'ended')) {
      return Promise.reject(new Error('相机已关闭，请重新打开'));
    }
    const scale = Math.min(1, maxEdge / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  return {
    start,
    stop,
    flip,
    capture,
    get active() { return !!stream; },
    get facing() { return facing; }
  };
}

/* 把相机错误映射为用户可懂的提示 */
export function explainCameraError(err) {
  if (err && err.name === 'NotAllowedError') {
    return '相机权限被拒绝了。可以在浏览器地址栏的锁图标里开启相机权限，然后重试；或者直接从相册选一张照片。';
  }
  if (err && err.name === 'NotFoundError') {
    return '没有找到可用的摄像头，试试从相册上传照片吧。';
  }
  if (err && err.name === 'NotReadableError') {
    return '摄像头被其他程序占用了，关掉占用它的应用后再试，或直接上传照片。';
  }
  return '相机出了点小状况，试试上传照片吧。';
}
