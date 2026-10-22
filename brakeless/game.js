const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ---- Config ----
const MAX_SPEED = 7;
const LEVEL_LENGTH = 14000;
const CAR_W = 55, CAR_H = 90;
const OBS_SIZE = 68;
const FUEL_DRAIN_BASE = 80;
const FUEL_PER_HIT = 5;
const DRIFT_FRAMES = 85;
const INVINCIBLE_FRAMES = 160;
const DASH_LEN = 50, GAP_LEN = 35;
const STEER_SPEED = 5;

// ---- Assets ----
const carImgs = [];
const obsImgs = [];
let loaded = 0;
const TOTAL_IMGS = 27;

function loadImg(src) {
  const img = new Image();
  img.src = src;
  img.onload = img.onerror = () => { loaded++; if (loaded >= TOTAL_IMGS) gs = 'car_select'; };
  return img;
}

for (let i = 1; i <= 20; i++) carImgs.push(loadImg(`assets/cars/car${i}.png`));
for (let i = 1; i <= 7; i++) obsImgs.push(loadImg(`assets/obstacles/E${i}.png`));

// ---- State ----
let gs = 'loading';
let selCar = 0;
let level = 1;
let fuel = 100;
let speed = 0;
let rOffset = 0;
let traveled = 0;
let px = 0, py = 0;
let driftVX = 0;
let driftAngle = 0;
let drifting = false;
let driftTimer = 0;
let invTimer = 0;
let obstacles = [];
let sparks = [];
const keys = {};

// ---- Helpers ----
function roadW() { return Math.min(520, canvas.width * 0.52); }
function roadL() { return (canvas.width - roadW()) / 2; }
function roadR() { return roadL() + roadW(); }

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawFlag(x, y, w, h) {
  const cols = 4, rows = 4;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(x + c * cw, y + r * ch, cw, ch);
    }
}

function obsScreenY(o) {
  return py - (o.ry - traveled);
}

// ---- Level setup ----
function genObstacles() {
  obstacles = [];
  const rl = roadL(), rw = roadW();
  const minRy = canvas.height + 400;
  const maxRy = LEVEL_LENGTH - 300;
  const span = maxRy - minRy;

  const staticN = 6 + level * 3;
  for (let i = 0; i < staticN; i++) {
    const ry = minRy + (i / staticN) * span + (Math.random() - 0.5) * (span / staticN * 0.8);
    obstacles.push({
      x: rl + OBS_SIZE / 2 + Math.random() * (rw - OBS_SIZE),
      ry: Math.max(minRy, Math.min(maxRy, ry)),
      w: OBS_SIZE, h: OBS_SIZE, vx: 0,
      img: Math.floor(Math.random() * obsImgs.length)
    });
  }

  const movN = Math.max(0, (level - 1) * 2);
  for (let i = 0; i < movN; i++) {
    const ry = minRy + Math.random() * span;
    const spd = (1.5 + Math.random() * 1.5 + (level - 1) * 0.15) * (Math.random() < 0.5 ? 1 : -1);
    obstacles.push({
      x: rl + OBS_SIZE / 2 + Math.random() * (rw - OBS_SIZE),
      ry,
      w: OBS_SIZE, h: OBS_SIZE, vx: spd,
      img: Math.floor(Math.random() * obsImgs.length)
    });
  }
}

function startLevel() {
  px = canvas.width / 2;
  py = canvas.height - 160;
  speed = 0;
  rOffset = 0;
  traveled = 0;
  drifting = false;
  driftTimer = 0;
  driftAngle = 0;
  driftVX = 0;
  invTimer = 0;
  sparks = [];
  genObstacles();
}

// ---- Update ----
function spawnSparks(x, y, dir) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 4;
    sparks.push({
      x, y,
      vx: Math.cos(angle) * spd + dir * 3,
      vy: Math.sin(angle) * spd,
      life: 1, decay: 0.03 + Math.random() * 0.04,
      r: 2 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#ff9900' : '#ffee00'
    });
  }
}

function update() {
  if (gs !== 'playing') return;
  const H = canvas.height;

  // Speed: logarithmic approach to max
  if (!drifting) {
    speed += (MAX_SPEED - speed) * 0.012;
    speed = Math.min(MAX_SPEED, speed);
  }

  if (drifting) {
    driftTimer--;
    px += driftVX;
    driftVX *= 0.91;
    driftAngle = driftVX * 0.055;
    // Speed slowly recovers during drift
    speed = Math.min(MAX_SPEED * 0.12, speed + 0.05);

    const rl = roadL() + CAR_W / 2 + 8;
    const rr = roadR() - CAR_W / 2 - 8;
    if (px < rl) { px = rl; driftVX = Math.abs(driftVX) * 0.35; }
    if (px > rr) { px = rr; driftVX = -Math.abs(driftVX) * 0.35; }

    if (driftTimer <= 0) { drifting = false; driftAngle = 0; driftVX = 0; }
  } else {
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) px -= STEER_SPEED;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) px += STEER_SPEED;
    if (touchDX !== 0) { px += touchDX * 1.4; touchDX = 0; }

    const rl = roadL() + CAR_W / 2 + 8;
    const rr = roadR() - CAR_W / 2 - 8;
    px = Math.max(rl, Math.min(rr, px));
    driftAngle *= 0.85;
  }

  // Road scroll
  rOffset = (rOffset + speed) % (DASH_LEN + GAP_LEN);
  traveled += speed;

  // Fuel drain proportional to distance
  const fuelPerPx = (FUEL_DRAIN_BASE + (level - 1) * 2) / LEVEL_LENGTH;
  fuel -= fuelPerPx * speed;
  fuel = Math.max(0, fuel);

  // Moving obstacles
  const rl2 = roadL(), rr2 = roadR();
  for (const o of obstacles) {
    if (o.vx !== 0) {
      o.x += o.vx;
      if (o.x < rl2 + o.w / 2) { o.x = rl2 + o.w / 2; o.vx = -o.vx; }
      if (o.x > rr2 - o.w / 2) { o.x = rr2 - o.w / 2; o.vx = -o.vx; }
    }
  }

  // Invincibility
  if (invTimer > 0) invTimer--;

  // Collision
  if (invTimer === 0 && !drifting) {
    for (const o of obstacles) {
      const sy = obsScreenY(o);
      if (sy < -80 || sy > H + 80) continue;
      const dx = Math.abs(px - o.x);
      const dy = Math.abs(py - sy);
      if (dx < (CAR_W + o.w) * 0.37 && dy < (CAR_H + o.h) * 0.37) {
        const dir = px > o.x ? 1 : -1;
        drifting = true;
        driftTimer = DRIFT_FRAMES;
        driftVX = dir * 10;
        speed = 0;
        fuel = Math.max(0, fuel - FUEL_PER_HIT);
        invTimer = INVINCIBLE_FRAMES;
        spawnSparks(px, py, dir);
        break;
      }
    }
  }

  // Sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx; s.y += s.vy;
    s.vy += 0.15;
    s.life -= s.decay;
    if (s.life <= 0) sparks.splice(i, 1);
  }

  if (traveled >= LEVEL_LENGTH) { gs = 'level_complete'; return; }
  if (fuel <= 0) { gs = 'game_over'; }
}

// ---- Draw ----
function drawKonumBar() {
  const W = canvas.width;
  const bx = 60, bw = W - 160, by = 26;

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(bx - 12, by - 16, bw + 62, 36, 8);
  ctx.fill();

  // Label
  ctx.fillStyle = '#888';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('KONUM ÇİZGİSİ', bx - 10, by - 19);

  // Track background
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Progress fill
  const prog = Math.min(1, traveled / LEVEL_LENGTH);
  if (prog > 0) {
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + prog * bw, by);
    ctx.strokeStyle = '#f90';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // Start marker
  ctx.beginPath();
  ctx.arc(bx, by, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#2ecc71';
  ctx.fill();

  // Finish flag
  drawFlag(bx + bw + 6, by - 10, 20, 20);
  // Flag pole
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx + bw + 6, by - 10);
  ctx.lineTo(bx + bw + 6, by + 12);
  ctx.stroke();

  // Position dot
  const mx = bx + prog * bw;
  ctx.beginPath();
  ctx.arc(mx, by, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#f90';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Percentage above dot
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(prog * 100)}%`, mx, by - 13);
}

function drawFuelGauge(cx, cy, r) {
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;

  // Background glow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  ctx.fill();

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 13;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const angle = a0 + (i / 10) * (a1 - a0);
    const inner = r - 8, outer = r + 6;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  // Fuel arc
  if (fuel > 0) {
    const fa = a0 + (fuel / 100) * (a1 - a0);
    const col = fuel > 50 ? '#2ecc71' : fuel > 25 ? '#f39c12' : '#e74c3c';
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, fa);
    ctx.strokeStyle = col;
    ctx.lineWidth = 13;
    ctx.stroke();

    // Glow at tip
    ctx.beginPath();
    ctx.arc(cx, cy, r, fa - 0.05, fa + 0.05);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // Fuel number
  const fuelCol = fuel > 50 ? '#2ecc71' : fuel > 25 ? '#f39c12' : '#e74c3c';
  ctx.fillStyle = fuelCol;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(fuel), cx, cy + 7);

  ctx.fillStyle = '#666';
  ctx.font = '10px sans-serif';
  ctx.fillText('YAKIT', cx, cy + 22);
}

function drawRoad() {
  const W = canvas.width, H = canvas.height;
  const rl = roadL(), rr = roadR(), rw = roadW();

  // Grass with subtle pattern
  ctx.fillStyle = '#2a5e18';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#265617';
  for (let y = (traveled * 0.3) % 80 - 80; y < H; y += 80) {
    ctx.fillRect(0, y, rl, 40);
    ctx.fillRect(rr, y, W - rr, 40);
  }

  // Road shadow
  const grad = ctx.createLinearGradient(rl - 12, 0, rl + 20, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(rl - 12, 0, 32, H);
  const grad2 = ctx.createLinearGradient(rr + 12, 0, rr - 20, 0);
  grad2.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad2;
  ctx.fillRect(rr - 20, 0, 32, H);

  // Road surface
  ctx.fillStyle = '#3c3c3c';
  ctx.fillRect(rl, 0, rw, H);

  // Subtle road texture strips
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.fillRect(rl, 0, rw / 2, H);

  // Edge white lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(rl + 14, 0); ctx.lineTo(rl + 14, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rr - 14, 0); ctx.lineTo(rr - 14, H); ctx.stroke();

  // Center yellow dashes
  ctx.save();
  ctx.setLineDash([DASH_LEN, GAP_LEN]);
  ctx.lineDashOffset = -rOffset;
  ctx.strokeStyle = '#f5c300';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.restore();

  // Finish line on road
  const finishScreenY = py - (LEVEL_LENGTH - traveled);
  if (finishScreenY > -20 && finishScreenY < H + 20) {
    drawFlag(rl + 14, finishScreenY - 10, rw - 28, 20);
    // Glow
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(rl + 14, finishScreenY - 12, rw - 28, 24);
  }
}

function drawObstacles() {
  const H = canvas.height;
  for (const o of obstacles) {
    const sy = obsScreenY(o);
    if (sy < -100 || sy > H + 100) continue;

    const img = obsImgs[o.img];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, o.x - o.w / 2, sy - o.h / 2, o.w, o.h);
    } else {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(o.x - o.w / 2, sy - o.h / 2, o.w, o.h);
    }

    if (o.vx !== 0) {
      const dir = o.vx > 0 ? 1 : -1;
      ctx.strokeStyle = 'rgba(255,220,0,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x - o.w / 2 - 2, sy - o.h / 2 - 2, o.w + 4, o.h + 4);
      // Arrow
      ctx.fillStyle = '#fd0';
      ctx.beginPath();
      const ax = o.x + dir * (o.w / 2 + 10), ay = sy;
      ctx.moveTo(ax, ay - 5);
      ctx.lineTo(ax + dir * 8, ay);
      ctx.lineTo(ax, ay + 5);
      ctx.fill();
    }
  }
}

function drawSparks() {
  for (const s of sparks) {
    ctx.globalAlpha = s.life;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const blink = invTimer > 0 && Math.floor(invTimer / 6) % 2 === 0;
  const img = carImgs[selCar];

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(driftAngle);
  if (blink) ctx.globalAlpha = 0.3;

  // Speed lines when fast
  if (speed > MAX_SPEED * 0.7 && !drifting) {
    ctx.globalAlpha = (speed / MAX_SPEED - 0.7) * 0.4;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, CAR_H / 2 + 5);
      ctx.lineTo(i * 12, CAR_H / 2 + 18 + speed * 2);
      ctx.stroke();
    }
    if (blink) ctx.globalAlpha = 0.3;
    else ctx.globalAlpha = 1;
  }

  if (img && img.complete && img.naturalWidth > 0) {
    const asp = img.naturalWidth / img.naturalHeight;
    let dw = CAR_W, dh = CAR_W / asp;
    if (dh > CAR_H) { dh = CAR_H; dw = CAR_H * asp; }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#3498db';
    ctx.fillRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawHUD() {
  const W = canvas.width, H = canvas.height;

  drawKonumBar();

  // Level pill
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(W / 2 - 55, 46, 110, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#f90';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`BÖLÜM  ${level}`, W / 2, 64);

  // Speed display
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(12, H - 48, 140, 32, 6);
  ctx.fill();
  const kmh = Math.round(speed * 20);
  ctx.fillStyle = speed > MAX_SPEED * 0.9 ? '#2ecc71' : '#aef';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HIZ: ${kmh} km/h`, 20, H - 26);

  // Fuel gauge bottom-right
  drawFuelGauge(W - 75, H - 85, 50);
}

function drawGame() {
  drawRoad();
  drawObstacles();
  drawSparks();
  drawPlayer();
  drawHUD();
}

// ---- Screens ----
function drawCarSelect() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#f90';
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#f90';
  ctx.shadowBlur = 30;
  ctx.fillText('BRAKELESS', W / 2, 72);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#777';
  ctx.font = '15px sans-serif';
  ctx.fillText('Aracını seç, fren yok!  ←  →  veya  A  D  ile yönlendir', W / 2, 102);

  const cols = 5;
  const cellSize = Math.min(108, (W - 80) / cols);
  const rows = Math.ceil(carImgs.length / cols);
  const gridW = cols * cellSize;
  const sx = (W - gridW) / 2;
  const sy = 125;

  for (let i = 0; i < carImgs.length; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const cx = sx + c * cellSize, cy = sy + r * cellSize;

    if (i === selCar) {
      ctx.fillStyle = 'rgba(255,153,0,0.18)';
      roundRect(cx + 4, cy + 4, cellSize - 8, cellSize - 8, 8);
      ctx.fill();
      ctx.strokeStyle = '#f90';
      ctx.lineWidth = 2.5;
      roundRect(cx + 4, cy + 4, cellSize - 8, cellSize - 8, 8);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(cx + 4, cy + 4, cellSize - 8, cellSize - 8, 8);
      ctx.fill();
    }

    const img = carImgs[i];
    if (img && img.complete && img.naturalWidth > 0) {
      const pad = 14;
      const asp = img.naturalWidth / img.naturalHeight;
      let iw = cellSize - pad * 2, ih = iw / asp;
      if (ih > cellSize - pad * 2) { ih = cellSize - pad * 2; iw = ih * asp; }
      ctx.drawImage(img, cx + cellSize / 2 - iw / 2, cy + cellSize / 2 - ih / 2, iw, ih);
    }
  }

  const btnY = sy + rows * cellSize + 22;
  ctx.fillStyle = '#f90';
  roundRect(W / 2 - 110, btnY, 220, 56, 12);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BAŞLA', W / 2, btnY + 38);

  window._btn = { x: W / 2 - 110, y: btnY, w: 220, h: 56 };
  window._grid = { sx, sy, cellSize, cols };
}

function drawLevelComplete() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#2ecc71';
  ctx.shadowBlur = 25;
  ctx.fillText(`BÖLÜM ${level} TAMAM!`, W / 2, H / 2 - 55);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#fff';
  ctx.font = '22px sans-serif';
  ctx.fillText(`Sonraki: Bölüm ${level + 1}`, W / 2, H / 2 + 5);

  const nextMargin = Math.max(0, 20 - level * 2);
  ctx.fillStyle = '#f39c12';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Bölüm ${level + 1} yakıt marjı: %${nextMargin}  |  Her çarpışma: -%${FUEL_PER_HIT}`, W / 2, H / 2 + 40);

  ctx.fillStyle = '#666';
  ctx.font = '15px sans-serif';
  ctx.fillText('Devam etmek için SPACE veya tıkla', W / 2, H / 2 + 90);
}

function drawGameOver() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#e74c3c';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#e74c3c';
  ctx.shadowBlur = 25;
  ctx.fillText('YAKIT BİTTİ!', W / 2, H / 2 - 60);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ccc';
  ctx.font = '22px sans-serif';
  ctx.fillText(`Bölüm ${level}  —  ${Math.round(traveled / LEVEL_LENGTH * 100)}% tamamlandı`, W / 2, H / 2 + 5);

  ctx.fillStyle = '#666';
  ctx.font = '16px sans-serif';
  ctx.fillText('Yeniden başlamak için SPACE veya tıkla', W / 2, H / 2 + 60);
}

function drawLoading() {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f90';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BRAKELESS', W / 2, H / 2 - 40);
  ctx.fillStyle = '#555';
  ctx.font = '15px sans-serif';
  ctx.fillText(`Yükleniyor...  ${Math.round(loaded / TOTAL_IMGS * 100)}%`, W / 2, H / 2 + 10);
  const bw = 220, bh = 7;
  ctx.fillStyle = '#222';
  ctx.fillRect(W / 2 - bw / 2, H / 2 + 35, bw, bh);
  ctx.fillStyle = '#f90';
  ctx.fillRect(W / 2 - bw / 2, H / 2 + 35, bw * loaded / TOTAL_IMGS, bh);
}

function draw() {
  if (gs === 'loading') drawLoading();
  else if (gs === 'car_select') drawCarSelect();
  else if (gs === 'playing') drawGame();
  else if (gs === 'level_complete') drawLevelComplete();
  else if (gs === 'game_over') drawGameOver();
}

// ---- Input ----
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') {
    if (gs === 'level_complete') { level++; fuel = 100; gs = 'playing'; startLevel(); }
    else if (gs === 'game_over') { level = 1; fuel = 100; gs = 'car_select'; }
  }
  if (e.key === 'Escape' && gs === 'playing') { gs = 'car_select'; }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  if (gs === 'car_select') {
    const g = window._grid;
    if (g) {
      const c = Math.floor((mx - g.sx) / g.cellSize);
      const r = Math.floor((my - g.sy) / g.cellSize);
      const idx = r * g.cols + c;
      if (c >= 0 && c < g.cols && r >= 0 && idx >= 0 && idx < carImgs.length) selCar = idx;
    }
    const b = window._btn;
    if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      gs = 'playing'; startLevel();
    }
  } else if (gs === 'level_complete') { level++; fuel = 100; gs = 'playing'; startLevel(); }
  else if (gs === 'game_over') { level = 1; fuel = 100; gs = 'car_select'; }
});

// Touch / swipe controls
let touchDX = 0;
let lastTouchX = null;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  lastTouchX = e.touches[0].clientX;

  if (gs === 'level_complete') { level++; fuel = 100; gs = 'playing'; startLevel(); return; }
  if (gs === 'game_over') { level = 1; fuel = 100; gs = 'car_select'; return; }

  if (gs === 'car_select') {
    const rect = canvas.getBoundingClientRect();
    const mx = e.touches[0].clientX - rect.left;
    const my = e.touches[0].clientY - rect.top;
    const g = window._grid;
    if (g) {
      const c = Math.floor((mx - g.sx) / g.cellSize);
      const r = Math.floor((my - g.sy) / g.cellSize);
      const idx = r * g.cols + c;
      if (c >= 0 && c < g.cols && r >= 0 && idx >= 0 && idx < carImgs.length) selCar = idx;
    }
    const b = window._btn;
    if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
      gs = 'playing'; startLevel();
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (lastTouchX !== null && gs === 'playing') {
    touchDX = e.touches[0].clientX - lastTouchX;
    lastTouchX = e.touches[0].clientX;
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  lastTouchX = null;
  touchDX = 0;
}, { passive: false });

// ---- Game Loop ----
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();
