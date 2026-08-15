/* 快速试戴示例照片（手部 / 头像）
 * 供用户零门槛一键体验试戴效果
 */

// 预设的高质量示例手部与头像数据（采用高质量 SVG Canvas 渲染转 Blob，纯离线零外链依赖）
function createSampleHandBlob() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  // 背景：温暖柔光室内
  const bg = ctx.createLinearGradient(0, 0, 800, 600);
  bg.addColorStop(0, '#F5EDE6');
  bg.addColorStop(1, '#E6D7CB');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 600);

  // 柔和环境光斑
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(400, 300, 260, 0, Math.PI * 2);
  ctx.fill();

  // 手部阴影
  ctx.fillStyle = 'rgba(140, 110, 100, 0.15)';
  ctx.beginPath();
  ctx.ellipse(400, 340, 190, 140, 0, 0, Math.PI * 2);
  ctx.fill();

  // 手掌与五指轮廓 (自然亚洲肤色，白皙柔和)
  const skinTone = ctx.createLinearGradient(200, 150, 600, 450);
  skinTone.addColorStop(0, '#FDF1EB');
  skinTone.addColorStop(0.5, '#F9E5DA');
  skinTone.addColorStop(1, '#F0D4C5');
  ctx.fillStyle = skinTone;

  // 手腕和手掌
  ctx.beginPath();
  ctx.moveTo(310, 560);
  ctx.bezierCurveTo(290, 450, 280, 360, 310, 280);
  // 大拇指
  ctx.bezierCurveTo(250, 300, 220, 340, 210, 290);
  ctx.bezierCurveTo(205, 250, 240, 230, 270, 260);
  // 食指
  ctx.bezierCurveTo(290, 210, 320, 140, 345, 145);
  ctx.bezierCurveTo(370, 150, 365, 210, 375, 250);
  // 中指
  ctx.bezierCurveTo(385, 190, 405, 120, 430, 125);
  ctx.bezierCurveTo(455, 130, 450, 195, 455, 245);
  // 无名指
  ctx.bezierCurveTo(470, 195, 490, 140, 515, 145);
  ctx.bezierCurveTo(540, 150, 530, 210, 525, 260);
  // 小指
  ctx.bezierCurveTo(545, 230, 575, 190, 595, 200);
  ctx.bezierCurveTo(615, 210, 590, 280, 570, 320);
  // 手掌右侧到手腕
  ctx.bezierCurveTo(560, 400, 530, 480, 500, 560);
  ctx.closePath();
  ctx.fill();

  // 指甲基础层（素甲）
  const nails = [
    { x: 235, y: 250, w: 22, h: 28, rot: -0.4 }, // 拇指
    { x: 345, y: 160, w: 20, h: 26, rot: -0.1 }, // 食指
    { x: 430, y: 140, w: 21, h: 27, rot: 0.05 }, // 中指
    { x: 515, y: 160, w: 19, h: 25, rot: 0.15 }, // 无名指
    { x: 595, y: 215, w: 16, h: 22, rot: 0.3 }   // 小指
  ];

  nails.forEach(n => {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rot);
    // 指甲根部月牙与血色
    const ng = ctx.createLinearGradient(0, -n.h/2, 0, n.h/2);
    ng.addColorStop(0, '#FFF5F0');
    ng.addColorStop(0.5, '#FCE8E2');
    ng.addColorStop(1, '#F3C5BA');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.roundRect(-n.w/2, -n.h/2, n.w, n.h, [8, 8, 12, 12]);
    ctx.fill();

    // 自然高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(-n.w/4, -n.h/4, 3, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 提示文字标签
  ctx.fillStyle = 'rgba(92, 74, 66, 0.4)';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('模特示例照 · 手部素甲', 400, 530);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

function createSampleFaceBlob() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 600, 800);
  bg.addColorStop(0, '#F5EDF2');
  bg.addColorStop(1, '#E8DCF0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 600, 800);

  // 柔光
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(300, 360, 220, 0, Math.PI * 2);
  ctx.fill();

  // 原始头发底色（深黑茶色）
  ctx.fillStyle = '#2B2320';
  ctx.beginPath();
  ctx.arc(300, 320, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(300, 480, 170, 240, 0, 0, Math.PI * 2);
  ctx.fill();

  // 脖子
  ctx.fillStyle = '#F5DDD3';
  ctx.fillRect(260, 440, 80, 120);

  // 脸部轮廓
  const faceSkin = ctx.createLinearGradient(200, 200, 400, 500);
  faceSkin.addColorStop(0, '#FFF3EC');
  faceSkin.addColorStop(1, '#F8E0D5');
  ctx.fillStyle = faceSkin;
  ctx.beginPath();
  ctx.ellipse(300, 350, 110, 140, 0, 0, Math.PI * 2);
  ctx.fill();

  // 眉毛
  ctx.fillStyle = '#3A2E2B';
  ctx.beginPath();
  ctx.ellipse(250, 305, 25, 4, -0.1, 0, Math.PI * 2);
  ctx.ellipse(350, 305, 25, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // 眼睛
  ctx.fillStyle = '#2C201C';
  ctx.beginPath();
  ctx.ellipse(250, 330, 15, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(350, 330, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眼神高光
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(253, 327, 3, 0, Math.PI * 2);
  ctx.arc(353, 327, 3, 0, Math.PI * 2);
  ctx.fill();

  // 腮红
  ctx.fillStyle = 'rgba(255, 140, 160, 0.25)';
  ctx.beginPath();
  ctx.arc(235, 370, 26, 0, Math.PI * 2);
  ctx.arc(365, 370, 26, 0, Math.PI * 2);
  ctx.fill();

  // 嘴唇
  ctx.fillStyle = '#E88696';
  ctx.beginPath();
  ctx.ellipse(300, 420, 22, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // 前额刘海发丝
  ctx.fillStyle = '#2B2320';
  ctx.beginPath();
  ctx.moveTo(190, 280);
  ctx.quadraticCurveTo(240, 220, 300, 230);
  ctx.quadraticCurveTo(360, 220, 410, 280);
  ctx.quadraticCurveTo(370, 260, 300, 265);
  ctx.quadraticCurveTo(230, 260, 190, 280);
  ctx.closePath();
  ctx.fill();

  // 提示文字
  ctx.fillStyle = 'rgba(92, 74, 66, 0.45)';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('模特示例照 · 头部自然发', 300, 720);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

let sampleHandCache = null;
let sampleFaceCache = null;

export async function getSamplePhoto(type = 'nail') {
  if (type === 'nail') {
    if (!sampleHandCache) sampleHandCache = await createSampleHandBlob();
    return sampleHandCache;
  } else {
    if (!sampleFaceCache) sampleFaceCache = await createSampleFaceBlob();
    return sampleFaceCache;
  }
}
