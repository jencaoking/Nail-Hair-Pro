/* 设备与 IP 解析工具 */

export function parseIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    if (list.length > 0 && list[0].trim()) {
      return list[0].trim().replace(/^::ffff:/, '');
    }
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return String(realIp).trim().replace(/^::ffff:/, '');
  }
  const remote = req.socket && req.socket.remoteAddress;
  if (remote) {
    return String(remote).trim().replace(/^::ffff:/, '');
  }
  return '127.0.0.1';
}

export function parseUserAgent(uaString = '') {
  const ua = String(uaString || '');
  if (!ua) return { os: '未知系统', browser: '未知浏览器', device: '未知设备', isMobile: false, summary: '未知设备' };

  let os = '其他';
  let device = '桌面电脑';
  let isMobile = false;

  // OS & Device
  if (/iPhone/i.test(ua)) {
    os = 'iOS';
    device = 'iPhone';
    isMobile = true;
  } else if (/iPad/i.test(ua)) {
    os = 'iPadOS';
    device = 'iPad';
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    device = /Mobile/i.test(ua) ? 'Android 手机' : 'Android 平板';
    isMobile = true;
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    device = 'Mac 电脑';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
    device = 'Windows PC';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    device = 'Linux PC';
  }

  // Browser
  let browser = '其他浏览器';
  if (/MicroMessenger/i.test(ua)) {
    browser = '微信内置浏览器';
  } else if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome\//i.test(ua) && !/Chromium|Edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/curl|python|postman|node-fetch/i.test(ua)) {
    browser = 'API 脚本客户端';
  }

  const summary = `${device} · ${os} (${browser})`;

  return {
    os,
    browser,
    device,
    isMobile,
    summary,
    raw: ua
  };
}
