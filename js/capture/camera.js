/* 相机：getUserMedia 后置优先 / 拍照 / 翻转 / 停流 */

export function cameraSupported() {
  return window.isSecureContext !== false &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function createCamera(videoEl) {
  let stream = null;
  let facing = 'environment';

  async function start() {
    stop();
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });
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
    if (!v.videoWidth) return Promise.reject(new Error('相机还没准备好'));
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
