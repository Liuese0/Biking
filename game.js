// ============================================================
// Ride or Crash - Pseudo-3D Third Person Back View
// ============================================================

(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // --- Canvas Setup ---
  let W, H;
  function resize() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    if (ww / wh < 9 / 16) {
      W = ww;
      H = ww * (16 / 9);
    } else {
      H = wh;
      W = wh / (16 / 9);
    }
    W = Math.floor(W);
    H = Math.floor(H);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Perspective Constants ---
  const HORIZON_RATIO = 0.35;
  const ROAD_HALF_W = 1.5;
  const DRAW_DIST = 200;
  const SEG_LENGTH = 4;
  const TOTAL_SEGS = Math.ceil(DRAW_DIST / SEG_LENGTH);
  const LANE_COUNT = 3;
  const PLAYER_Z = 10;

  // Projection: returns screen x, y and pixels-per-world-unit (ppu)
  // wx = world lateral (-ROAD_HALF_W..+ROAD_HALF_W), wz = depth ahead
  function project(wx, wz) {
    if (wz < 0.5) wz = 0.5;
    const horizonY = H * HORIZON_RATIO;
    const fov = W * 0.95;
    const depthScale = H * 2.5;
    const ppu = fov / wz;
    const sx = W / 2 + wx * ppu;
    const sy = horizonY + depthScale / wz;
    return { x: sx, y: sy, ppu: ppu };
  }

  // --- Storage ---
  function loadData() {
    try { return JSON.parse(localStorage.getItem("roc_save")) || {}; }
    catch (e) { return {}; }
  }
  function saveData(d) { localStorage.setItem("roc_save", JSON.stringify(d)); }
  function getData() {
    const d = loadData();
    if (!d.coins) d.coins = 0;
    if (!d.highScore) d.highScore = 0;
    if (!d.skins) d.skins = ["default"];
    if (!d.currentSkin) d.currentSkin = "default";
    return d;
  }

  // --- Skins ---
  const SKINS = [
    { id: "default", name: "Basic", price: 0, frame: "#4FC3F7", body: "#29B6F6", shirt: "#29B6F6", pants: "#1565C0" },
    { id: "red_racer", name: "Red Racer", price: 100, frame: "#EF5350", body: "#F44336", shirt: "#F44336", pants: "#B71C1C" },
    { id: "green_eco", name: "Green Eco", price: 150, frame: "#66BB6A", body: "#43A047", shirt: "#43A047", pants: "#2E7D32" },
    { id: "gold_rush", name: "Gold Rush", price: 300, frame: "#FFD54F", body: "#FFC107", shirt: "#FFC107", pants: "#F57F17" },
    { id: "purple_night", name: "Purple Night", price: 250, frame: "#AB47BC", body: "#8E24AA", shirt: "#8E24AA", pants: "#4A148C" },
    { id: "neon_pink", name: "Neon Pink", price: 400, frame: "#FF4081", body: "#F50057", shirt: "#F50057", pants: "#880E4F" },
    { id: "ice_blue", name: "Ice Blue", price: 350, frame: "#80DEEA", body: "#00BCD4", shirt: "#00BCD4", pants: "#006064" },
    { id: "sunset", name: "Sunset", price: 500, frame: "#FF7043", body: "#FF5722", shirt: "#FF5722", pants: "#BF360C" },
  ];
  function getSkin(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

  // --- Game State ---
  const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, SHOP: 3 };
  let state = STATE.MENU;
  let data = getData();

  let playerX = 0;
  let playerTargetX = 0;
  let playerSpeed, gameTime, score, distance;
  let speedIncrement;
  let shieldActive, shieldTimer;
  let sessionCoins;
  let pedalAngle = 0;
  let playerBob = 0;

  let worldObstacles = [];
  let worldItems = [];
  let particles = [];

  let spawnTimer, spawnInterval;
  let worldZ = 0;

  let touchStartX = null;
  let isDragging = false;

  // --- Init ---
  function initGame() {
    playerX = 0;
    playerTargetX = 0;
    playerSpeed = 3.5;
    gameTime = 0;
    score = 0;
    distance = 0;
    speedIncrement = 0.0008;
    shieldActive = false;
    shieldTimer = 0;
    sessionCoins = 0;
    pedalAngle = 0;
    playerBob = 0;
    worldZ = 0;
    worldObstacles = [];
    worldItems = [];
    particles = [];
    spawnTimer = 0;
    spawnInterval = 60;
  }

  // --- Spawn ---
  function laneToX(lane) {
    return (lane - 1) * (ROAD_HALF_W * 0.6);
  }

  function spawnObstacle() {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const types = ["car", "cone", "box", "oil"];
    const weights = [0.35, 0.25, 0.2, 0.2];
    let r = Math.random(), cum = 0, type = types[0];
    for (let i = 0; i < weights.length; i++) {
      cum += weights[i];
      if (r < cum) { type = types[i]; break; }
    }
    worldObstacles.push({
      x: laneToX(lane),
      z: DRAW_DIST + 20,
      type: type,
      lane: lane,
      carSpeed: type === "car" ? playerSpeed * 0.3 : 0,
      hitW: type === "car" ? 0.5 : 0.35,
      hitD: type === "car" ? 1.2 : 0.8,
      carColor: ["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA"][Math.floor(Math.random() * 5)],
    });
  }

  function spawnItem() {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const isShield = Math.random() < 0.12;
    worldItems.push({
      x: laneToX(lane),
      z: DRAW_DIST + 20,
      type: isShield ? "shield" : "coin",
      lane: lane,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  // --- Particles (screen space) ---
  function addParticles(sx, sy, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: sx, y: sy,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 3,
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: color,
        size: 2 + Math.random() * 5,
      });
    }
  }

  // --- Update ---
  function update() {
    if (state !== STATE.PLAYING) return;

    gameTime++;
    const dz = playerSpeed * 0.15;
    worldZ += dz;
    distance += dz;
    playerSpeed += speedIncrement;
    pedalAngle += playerSpeed * 0.07;
    playerBob = Math.sin(gameTime * 0.15) * 1.5;

    const dx = playerTargetX - playerX;
    playerX += dx * 0.12;
    playerX = Math.max(-1, Math.min(1, playerX));

    spawnTimer++;
    const adjInterval = Math.max(25, spawnInterval - gameTime * 0.008);
    if (spawnTimer >= adjInterval) {
      spawnTimer = 0;
      spawnObstacle();
      if (Math.random() < 0.5) spawnItem();
    }

    const pWorldX = playerX * ROAD_HALF_W * 0.8;

    // Update obstacles
    for (let i = worldObstacles.length - 1; i >= 0; i--) {
      const o = worldObstacles[i];
      o.z -= dz - (o.carSpeed * 0.15);
      if (o.z < -5) { worldObstacles.splice(i, 1); continue; }

      const dzDiff = Math.abs(o.z - PLAYER_Z);
      const dxDiff = Math.abs(o.x - pWorldX);
      if (dzDiff < o.hitD && dxDiff < o.hitW) {
        if (shieldActive) {
          shieldActive = false;
          const p = project(o.x, o.z);
          addParticles(p.x, p.y, "#00E5FF", 15);
          worldObstacles.splice(i, 1);
        } else {
          const p = project(pWorldX, PLAYER_Z);
          addParticles(p.x, p.y, "#FF5252", 30);
          state = STATE.GAMEOVER;
          score = Math.floor(distance * 10) + sessionCoins * 5;
          data.coins += sessionCoins;
          if (score > data.highScore) data.highScore = score;
          saveData(data);
        }
      }
    }

    // Update items
    for (let i = worldItems.length - 1; i >= 0; i--) {
      const it = worldItems[i];
      it.z -= dz;
      it.bobPhase += 0.06;
      if (it.z < -5) { worldItems.splice(i, 1); continue; }

      const dzDiff = Math.abs(it.z - PLAYER_Z);
      const dxDiff = Math.abs(it.x - pWorldX);
      if (dzDiff < 1.5 && dxDiff < 0.45) {
        if (it.type === "coin") {
          sessionCoins++;
          const p = project(it.x, it.z);
          addParticles(p.x, p.y, "#FFD700", 8);
        } else {
          shieldActive = true;
          shieldTimer = 0;
          const p = project(it.x, it.z);
          addParticles(p.x, p.y, "#00E5FF", 12);
        }
        worldItems.splice(i, 1);
      }
    }

    if (shieldActive) shieldTimer++;
    score = Math.floor(distance * 10) + sessionCoins * 5;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // --- Drawing Helpers ---
  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function shadeColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  // --- Draw Sky ---
  function drawSky() {
    const horizonY = H * HORIZON_RATIO;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, "#0a0a1a");
    skyGrad.addColorStop(0.4, "#141432");
    skyGrad.addColorStop(0.8, "#1a2555");
    skyGrad.addColorStop(1, "#2a3a6e");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizonY + 5);

    // Stars
    ctx.fillStyle = "#FFF";
    const starSeed = [0.1, 0.15, 0.3, 0.42, 0.55, 0.62, 0.74, 0.85, 0.92, 0.05, 0.22, 0.38, 0.67, 0.78, 0.88];
    for (let i = 0; i < starSeed.length; i++) {
      const sx = starSeed[i] * W;
      const sy = starSeed[(i + 3) % starSeed.length] * horizonY * 0.7;
      ctx.globalAlpha = 0.3 + Math.sin(gameTime * 0.02 + i) * 0.3;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Moon
    ctx.fillStyle = "#E8E8F0";
    ctx.beginPath();
    ctx.arc(W * 0.78, horizonY * 0.25, W * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // City silhouette
    drawCitySilhouette(horizonY);
  }

  function drawCitySilhouette(horizonY) {
    const buildings = [
      [0, 0.06, 0.08], [0.05, 0.04, 0.14], [0.08, 0.06, 0.06],
      [0.14, 0.03, 0.18], [0.17, 0.05, 0.1], [0.22, 0.04, 0.22],
      [0.26, 0.06, 0.12], [0.32, 0.03, 0.16], [0.35, 0.07, 0.08],
      [0.42, 0.04, 0.25], [0.46, 0.05, 0.13], [0.51, 0.06, 0.09],
      [0.57, 0.03, 0.2], [0.60, 0.05, 0.11], [0.65, 0.04, 0.17],
      [0.69, 0.06, 0.07], [0.75, 0.03, 0.23], [0.78, 0.05, 0.1],
      [0.83, 0.04, 0.15], [0.87, 0.06, 0.09], [0.93, 0.04, 0.19],
    ];
    for (const [bx, bw, bh] of buildings) {
      const px = bx * W, pw = bw * W, ph = bh * H;
      ctx.fillStyle = "#0d0d22";
      ctx.fillRect(px, horizonY - ph, pw, ph + 2);
      ctx.fillStyle = "rgba(255,210,100,0.15)";
      for (let wy = horizonY - ph + 4; wy < horizonY - 4; wy += 8) {
        for (let wx = px + 3; wx < px + pw - 3; wx += 6) {
          if (Math.sin(wx * 13.7 + wy * 7.3) > 0.3) ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }

  // --- Draw Road (Pseudo 3D) ---
  function drawRoad() {
    const horizonY = H * HORIZON_RATIO;

    // Ground
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    groundGrad.addColorStop(0, "#2a3a2a");
    groundGrad.addColorStop(0.1, "#1e2e1e");
    groundGrad.addColorStop(1, "#0f1a0f");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    const segOffset = (worldZ % SEG_LENGTH) / SEG_LENGTH;

    for (let i = TOTAL_SEGS; i >= 1; i--) {
      const z1 = (i - segOffset) * SEG_LENGTH;
      const z2 = (i - 1 - segOffset) * SEG_LENGTH;
      if (z2 <= 0.5) continue;

      const p1L = project(-ROAD_HALF_W, z1);
      const p1R = project(ROAD_HALF_W, z1);
      const p2L = project(-ROAD_HALF_W, z2);
      const p2R = project(ROAD_HALF_W, z2);

      if (p2L.y < horizonY - 2) continue;
      if (p1L.y > H + 50) continue;

      const segIndex = Math.floor(worldZ / SEG_LENGTH) + i;
      const dark = segIndex % 2 === 0;

      // Grass / shoulder
      const grassW1 = (p1R.x - p1L.x) * 0.2;
      const grassW2 = (p2R.x - p2L.x) * 0.2;

      ctx.fillStyle = dark ? "#1a3a1a" : "#1e4020";
      ctx.beginPath();
      ctx.moveTo(p1L.x - grassW1, p1L.y); ctx.lineTo(p1L.x, p1L.y);
      ctx.lineTo(p2L.x, p2L.y); ctx.lineTo(p2L.x - grassW2, p2L.y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p1R.x, p1R.y); ctx.lineTo(p1R.x + grassW1, p1R.y);
      ctx.lineTo(p2R.x + grassW2, p2R.y); ctx.lineTo(p2R.x, p2R.y);
      ctx.closePath(); ctx.fill();

      // Road surface
      ctx.fillStyle = dark ? "#333345" : "#3a3a52";
      ctx.beginPath();
      ctx.moveTo(p1L.x, p1L.y); ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p2R.x, p2R.y); ctx.lineTo(p2L.x, p2L.y);
      ctx.closePath(); ctx.fill();

      // Edge lines
      const edgeW = Math.max(1, (p2R.x - p2L.x) * 0.015);
      ctx.fillStyle = "#CCC";
      ctx.beginPath();
      ctx.moveTo(p1L.x, p1L.y); ctx.lineTo(p1L.x + edgeW, p1L.y);
      ctx.lineTo(p2L.x + edgeW, p2L.y); ctx.lineTo(p2L.x, p2L.y);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p1R.x - edgeW, p1R.y); ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p2R.x, p2R.y); ctx.lineTo(p2R.x - edgeW, p2R.y);
      ctx.closePath(); ctx.fill();

      // Lane dashes
      if (segIndex % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        for (let ln = 1; ln < LANE_COUNT; ln++) {
          const frac = ln / LANE_COUNT;
          const lx1 = p1L.x + (p1R.x - p1L.x) * frac;
          const lx2 = p2L.x + (p2R.x - p2L.x) * frac;
          const dashW = Math.max(1, (p2R.x - p2L.x) * 0.01);
          ctx.beginPath();
          ctx.moveTo(lx1 - dashW, p1L.y); ctx.lineTo(lx1 + dashW, p1L.y);
          ctx.lineTo(lx2 + dashW, p2L.y); ctx.lineTo(lx2 - dashW, p2L.y);
          ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  // ==========================================================
  // OBJECT RENDERING - All sizes in world units via ppu
  // ==========================================================

  // --- Car (back view) ---
  function draw3DCar(wx, wz, color) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 100) return;

    const ppu = p.ppu;
    const carW = ppu * 0.7;
    const carH = ppu * 0.55;
    if (carW < 3) return;

    const cx = p.x;
    const cy = p.y;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, carW * 0.55, carH * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyX = cx - carW / 2;
    const bodyY = cy - carH;

    // Main body
    ctx.fillStyle = color;
    drawRoundRect(bodyX, bodyY + carH * 0.15, carW, carH * 0.7, carW * 0.08);
    ctx.fill();

    // Roof
    ctx.fillStyle = shadeColor(color, -20);
    drawRoundRect(bodyX + carW * 0.1, bodyY - carH * 0.05, carW * 0.8, carH * 0.38, carW * 0.06);
    ctx.fill();

    // Rear window
    ctx.fillStyle = "rgba(100,180,220,0.5)";
    drawRoundRect(bodyX + carW * 0.15, bodyY, carW * 0.7, carH * 0.25, carW * 0.04);
    ctx.fill();

    // Rear lights
    ctx.fillStyle = "#FF1744";
    ctx.shadowColor = "#FF1744";
    ctx.shadowBlur = Math.min(carW * 0.15, 10);
    drawRoundRect(bodyX + carW * 0.03, bodyY + carH * 0.55, carW * 0.18, carH * 0.13, 2);
    ctx.fill();
    drawRoundRect(bodyX + carW * 0.79, bodyY + carH * 0.55, carW * 0.18, carH * 0.13, 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // License plate
    ctx.fillStyle = "#FFF";
    drawRoundRect(cx - carW * 0.14, bodyY + carH * 0.72, carW * 0.28, carH * 0.1, 1);
    ctx.fill();

    // Wheels
    ctx.fillStyle = "#111";
    const wheelW = carW * 0.08;
    const wheelH = carH * 0.22;
    ctx.fillRect(bodyX - wheelW * 0.5, cy - wheelH, wheelW, wheelH);
    ctx.fillRect(bodyX + carW - wheelW * 0.5, cy - wheelH, wheelW, wheelH);
  }

  // --- Cone ---
  function draw3DCone(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 50) return;
    const ppu = p.ppu;
    const coneH = ppu * 0.45;
    const coneW = ppu * 0.22;
    if (coneW < 2) return;

    const cx = p.x, cy = p.y;

    // Base
    ctx.fillStyle = "#E65100";
    ctx.beginPath();
    ctx.ellipse(cx, cy, coneW * 0.6, coneH * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#FF6D00";
    ctx.beginPath();
    ctx.moveTo(cx, cy - coneH);
    ctx.lineTo(cx - coneW / 2, cy);
    ctx.lineTo(cx + coneW / 2, cy);
    ctx.closePath();
    ctx.fill();

    // White stripe
    ctx.fillStyle = "#FFF";
    const sw = coneW * 0.32;
    ctx.fillRect(cx - sw / 2, cy - coneH * 0.5, sw, coneH * 0.15);
  }

  // --- Box ---
  function draw3DBox(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 50) return;
    const ppu = p.ppu;
    const bw = ppu * 0.35;
    const bh = ppu * 0.35;
    if (bw < 2) return;

    const cx = p.x, cy = p.y;

    // Front face
    ctx.fillStyle = "#8D6E63";
    ctx.fillRect(cx - bw / 2, cy - bh, bw, bh);

    // Top face
    ctx.fillStyle = "#A1887F";
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh);
    ctx.lineTo(cx - bw * 0.3, cy - bh - bh * 0.25);
    ctx.lineTo(cx + bw * 0.7, cy - bh - bh * 0.25);
    ctx.lineTo(cx + bw / 2, cy - bh);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = "#6D4C41";
    ctx.beginPath();
    ctx.moveTo(cx + bw / 2, cy - bh);
    ctx.lineTo(cx + bw * 0.7, cy - bh - bh * 0.25);
    ctx.lineTo(cx + bw * 0.7, cy - bh * 0.25);
    ctx.lineTo(cx + bw / 2, cy);
    ctx.closePath();
    ctx.fill();

    // Tape
    ctx.strokeStyle = "#FFCC80";
    ctx.lineWidth = Math.max(1, bw * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh); ctx.lineTo(cx + bw / 2, cy);
    ctx.moveTo(cx + bw / 2, cy - bh); ctx.lineTo(cx - bw / 2, cy);
    ctx.stroke();
  }

  // --- Oil ---
  function draw3DOil(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 50) return;
    const ppu = p.ppu;
    const ow = ppu * 0.5;
    const oh = ppu * 0.12;
    if (ow < 2) return;

    ctx.fillStyle = "rgba(20,20,30,0.65)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - oh * 0.3, ow * 0.5, oh, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(80,80,120,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x - ow * 0.1, p.y - oh * 0.5, ow * 0.15, oh * 0.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Coin ---
  function draw3DCoin(wx, wz, bobPhase) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 50) return;
    const ppu = p.ppu;
    const r = ppu * 0.12;
    if (r < 1.5) return;

    const bob = Math.sin(bobPhase) * r * 0.6;
    const cy = p.y - r * 1.5 - bob;

    ctx.save();
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = Math.min(r * 2, 12);
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(p.x, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#FFC107";
    ctx.beginPath();
    ctx.arc(p.x, cy, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    if (r > 4) {
      ctx.fillStyle = "#FF8F00";
      ctx.font = `bold ${Math.max(6, Math.floor(r))}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", p.x, cy + 1);
    }
    ctx.restore();
  }

  // --- Shield Item ---
  function draw3DShield(wx, wz, bobPhase) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON_RATIO || p.y > H + 50) return;
    const ppu = p.ppu;
    const sz = ppu * 0.15;
    if (sz < 2) return;

    const bob = Math.sin(bobPhase) * sz * 0.5;
    const cy = p.y - sz * 1.5 - bob;

    ctx.save();
    ctx.shadowColor = "#00E5FF";
    ctx.shadowBlur = Math.min(sz * 2, 15);
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = Math.max(1, sz * 0.12);

    ctx.beginPath();
    ctx.moveTo(p.x, cy - sz);
    ctx.lineTo(p.x + sz * 0.8, cy - sz * 0.5);
    ctx.lineTo(p.x + sz * 0.8, cy + sz * 0.3);
    ctx.quadraticCurveTo(p.x, cy + sz, p.x, cy + sz);
    ctx.quadraticCurveTo(p.x, cy + sz, p.x - sz * 0.8, cy + sz * 0.3);
    ctx.lineTo(p.x - sz * 0.8, cy - sz * 0.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,229,255,0.2)";
    ctx.fill();
    ctx.restore();
  }

  // ==========================================================
  // PLAYER BIKE - Back View (fixed screen-relative size)
  // ==========================================================
  function drawPlayerBike(skin) {
    const pWorldX = playerX * ROAD_HALF_W * 0.8;
    const p = project(pWorldX, PLAYER_Z);

    const cx = p.x;
    const cy = p.y + playerBob;

    // Scale based on screen size for consistent appearance
    const s = W * 0.005;

    ctx.save();
    ctx.translate(cx, cy);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, s * 4, s * 16, s * 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // === REAR WHEEL ===
    const wheelR = s * 12;
    const wheelY = s * 1;

    // Tire
    ctx.strokeStyle = "#444";
    ctx.lineWidth = s * 3.5;
    ctx.beginPath();
    ctx.arc(0, wheelY, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    // Rim
    ctx.strokeStyle = "#888";
    ctx.lineWidth = s * 1;
    ctx.beginPath();
    ctx.arc(0, wheelY, wheelR - s * 2, 0, Math.PI * 2);
    ctx.stroke();

    // Hub
    ctx.fillStyle = "#999";
    ctx.beginPath();
    ctx.arc(0, wheelY, s * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Spokes (rotating)
    ctx.strokeStyle = "#AAA";
    ctx.lineWidth = s * 0.4;
    for (let i = 0; i < 8; i++) {
      const a = pedalAngle + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 2.5, wheelY + Math.sin(a) * s * 2.5);
      ctx.lineTo(Math.cos(a) * (wheelR - s * 2.5), wheelY + Math.sin(a) * (wheelR - s * 2.5));
      ctx.stroke();
    }

    // === FRAME ===
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 1.8;
    ctx.lineCap = "round";

    // Seat stays (V shape from rear axle up)
    ctx.beginPath();
    ctx.moveTo(-s * 3.5, wheelY); ctx.lineTo(-s * 2.5, -s * 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 3.5, wheelY); ctx.lineTo(s * 2.5, -s * 10);
    ctx.stroke();

    // Seat tube
    ctx.lineWidth = s * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, wheelY); ctx.lineTo(0, -s * 14);
    ctx.stroke();

    // Top tube (foreshortened forward)
    ctx.lineWidth = s * 1.8;
    ctx.beginPath();
    ctx.moveTo(-s * 2, -s * 11); ctx.lineTo(0, -s * 16); ctx.lineTo(s * 2, -s * 11);
    ctx.stroke();

    // Head tube
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 16); ctx.lineTo(0, -s * 20);
    ctx.stroke();

    // === SEAT ===
    ctx.fillStyle = "#2A2A2A";
    drawRoundRect(-s * 4.5, -s * 15.5, s * 9, s * 3, s * 1.2);
    ctx.fill();

    // === HANDLEBARS ===
    ctx.strokeStyle = "#BBB";
    ctx.lineWidth = s * 1.8;
    ctx.beginPath();
    ctx.moveTo(-s * 10, -s * 19.5);
    ctx.quadraticCurveTo(-s * 5, -s * 21.5, 0, -s * 20.5);
    ctx.quadraticCurveTo(s * 5, -s * 21.5, s * 10, -s * 19.5);
    ctx.stroke();

    // Grips
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(-s * 10, -s * 19.5, s * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 10, -s * 19.5, s * 1.5, 0, Math.PI * 2); ctx.fill();

    // === RIDER ===
    const leg = pedalAngle;

    // Legs
    ctx.strokeStyle = skin.pants;
    ctx.lineWidth = s * 3.5;
    ctx.lineCap = "round";

    // Left leg
    const lkx = -s * 4.5 + Math.sin(leg) * s * 2.5;
    const lky = -s * 3 + Math.cos(leg) * s * 3.5;
    const lfx = -s * 2.5 + Math.sin(leg) * s * 1.5;
    const lfy = wheelY - s * 1.5 + Math.cos(leg) * s * 2.5;
    ctx.beginPath(); ctx.moveTo(-s * 2.5, -s * 12); ctx.lineTo(lkx, lky); ctx.lineTo(lfx, lfy); ctx.stroke();

    // Right leg
    const rkx = s * 4.5 + Math.sin(leg + Math.PI) * s * 2.5;
    const rky = -s * 3 + Math.cos(leg + Math.PI) * s * 3.5;
    const rfx = s * 2.5 + Math.sin(leg + Math.PI) * s * 1.5;
    const rfy = wheelY - s * 1.5 + Math.cos(leg + Math.PI) * s * 2.5;
    ctx.beginPath(); ctx.moveTo(s * 2.5, -s * 12); ctx.lineTo(rkx, rky); ctx.lineTo(rfx, rfy); ctx.stroke();

    // Shoes
    ctx.fillStyle = "#1A1A1A";
    ctx.beginPath(); ctx.arc(lfx, lfy, s * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rfx, rfy, s * 1.6, 0, Math.PI * 2); ctx.fill();

    // Torso (back of jersey)
    ctx.fillStyle = skin.shirt;
    ctx.beginPath();
    ctx.moveTo(-s * 7, -s * 12);
    ctx.quadraticCurveTo(-s * 8, -s * 22, -s * 3.5, -s * 27);
    ctx.lineTo(s * 3.5, -s * 27);
    ctx.quadraticCurveTo(s * 8, -s * 22, s * 7, -s * 12);
    ctx.closePath();
    ctx.fill();

    // Jersey back detail
    ctx.strokeStyle = shadeColor(skin.shirt, -30);
    ctx.lineWidth = s * 0.6;
    ctx.beginPath(); ctx.moveTo(0, -s * 27); ctx.lineTo(0, -s * 12); ctx.stroke();

    // Arms
    ctx.strokeStyle = skin.shirt;
    ctx.lineWidth = s * 3;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-s * 7, -s * 24); ctx.quadraticCurveTo(-s * 10, -s * 21, -s * 9.5, -s * 19.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 7, -s * 24); ctx.quadraticCurveTo(s * 10, -s * 21, s * 9.5, -s * 19.5); ctx.stroke();

    // Gloves
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(-s * 9.5, -s * 19.5, s * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 9.5, -s * 19.5, s * 1.5, 0, Math.PI * 2); ctx.fill();

    // Neck
    ctx.fillStyle = "#E8B887";
    ctx.fillRect(-s * 1.8, -s * 30, s * 3.6, s * 3.5);

    // Helmet
    ctx.fillStyle = skin.frame;
    ctx.beginPath();
    ctx.ellipse(0, -s * 33, s * 6, s * 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helmet bottom edge
    ctx.fillStyle = shadeColor(skin.frame, -25);
    ctx.beginPath();
    ctx.ellipse(0, -s * 30, s * 6.2, s * 2, 0, 0, Math.PI);
    ctx.fill();

    // Helmet stripe
    ctx.fillStyle = "#FFF";
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-s * 0.7, -s * 38, s * 1.4, s * 9);
    ctx.globalAlpha = 1;

    // === SHIELD GLOW ===
    if (shieldActive) {
      const pulse = 0.5 + Math.sin(shieldTimer * 0.12) * 0.3;
      ctx.strokeStyle = `rgba(0, 229, 255, ${pulse})`;
      ctx.lineWidth = s * 1.2;
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = s * 6;
      ctx.beginPath();
      ctx.ellipse(0, -s * 14, s * 16, s * 25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // --- Mini Bike (for menus) ---
  function drawMiniBike(cx, cy, scale, skin) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = scale;

    ctx.strokeStyle = "#555";
    ctx.lineWidth = s * 3;
    ctx.beginPath(); ctx.arc(0, s * 2, s * 10, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 2;
    ctx.beginPath(); ctx.moveTo(0, s * 2); ctx.lineTo(0, -s * 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 8, -s * 16);
    ctx.quadraticCurveTo(0, -s * 18, s * 8, -s * 16);
    ctx.stroke();

    ctx.fillStyle = skin.shirt;
    ctx.beginPath();
    ctx.moveTo(-s * 5, -s * 10);
    ctx.quadraticCurveTo(-s * 6, -s * 20, -s * 3, -s * 24);
    ctx.lineTo(s * 3, -s * 24);
    ctx.quadraticCurveTo(s * 6, -s * 20, s * 5, -s * 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin.frame;
    ctx.beginPath(); ctx.arc(0, -s * 28, s * 5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // --- HUD ---
  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    drawRoundRect(8, 8, W * 0.48, 60, 10);
    ctx.fill();

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px 'Segoe UI', Arial`;
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 18, 34);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + sessionCoins, 18, 56);

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    drawRoundRect(W - W * 0.32 - 8, 8, W * 0.32, 36, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `bold ${Math.floor(W * 0.033)}px Arial`;
    ctx.textAlign = "right";
    ctx.fillText(Math.floor(playerSpeed * 15) + " km/h", W - 18, 33);

    if (shieldActive) {
      ctx.fillStyle = "rgba(0,229,255,0.7)";
      ctx.font = `bold ${Math.floor(W * 0.035)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText("SHIELD ACTIVE", W / 2, 30);
    }
  }

  // --- Particles ---
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ==========================================================
  // SCREENS
  // ==========================================================
  const menuButtons = {};

  function drawMenu() {
    drawSky();
    drawRoad();

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "#00E5FF";
    ctx.shadowBlur = 25;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.11)}px 'Segoe UI', Arial`;
    ctx.textAlign = "center";
    ctx.fillText("RIDE", W / 2, H * 0.18);
    ctx.fillStyle = "#FF5252";
    ctx.shadowColor = "#FF5252";
    ctx.fillText("or CRASH", W / 2, H * 0.27);
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `${Math.floor(W * 0.033)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("Hyper Casual Bike Runner", W / 2, H * 0.31);

    drawMiniBike(W / 2, H * 0.44, W * 0.0035, getSkin(data.currentSkin));

    ctx.fillStyle = "#FFD54F";
    ctx.font = `bold ${Math.floor(W * 0.04)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("BEST: " + data.highScore, W / 2, H * 0.56);
    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + data.coins, W / 2, H * 0.61);

    const btnW = W * 0.6, btnH = H * 0.065;
    const btnX = W / 2 - btnW / 2;

    const btnY = H * 0.67;
    ctx.fillStyle = "#00E676"; ctx.shadowColor = "#00E676"; ctx.shadowBlur = 15;
    drawRoundRect(btnX, btnY, btnW, btnH, 14); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("PLAY", W / 2, btnY + btnH / 2 + 2);
    menuButtons.play = { x: btnX, y: btnY, w: btnW, h: btnH };

    const sbtnY = H * 0.78;
    ctx.fillStyle = "#7C4DFF"; ctx.shadowColor = "#7C4DFF"; ctx.shadowBlur = 10;
    drawRoundRect(btnX, sbtnY, btnW, btnH, 14); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px Arial`;
    ctx.fillText("SHOP", W / 2, sbtnY + btnH / 2 + 2);
    menuButtons.shop = { x: btnX, y: sbtnY, w: btnW, h: btnH };

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${Math.floor(W * 0.028)}px Arial`;
    ctx.fillText("Drag left/right to steer", W / 2, H * 0.92);
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "#FF1744"; ctx.shadowBlur = 30;
    ctx.fillStyle = "#FF5252";
    ctx.font = `bold ${Math.floor(W * 0.1)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("CRASH!", W / 2, H * 0.22);
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    drawRoundRect(W * 0.1, H * 0.28, W * 0.8, H * 0.22, 16); ctx.fill();

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.055)}px Arial`;
    ctx.fillText("Score: " + score, W / 2, H * 0.35);
    ctx.fillStyle = "#FFD54F";
    ctx.font = `${Math.floor(W * 0.04)}px Arial`;
    ctx.fillText("Best: " + data.highScore, W / 2, H * 0.41);
    ctx.fillStyle = "#FFD700";
    ctx.fillText("Coins: +" + sessionCoins, W / 2, H * 0.47);

    const btnW = W * 0.6, btnH = H * 0.065;
    const btnX = W / 2 - btnW / 2;

    const btnY = H * 0.56;
    ctx.fillStyle = "#00E676"; ctx.shadowColor = "#00E676"; ctx.shadowBlur = 12;
    drawRoundRect(btnX, btnY, btnW, btnH, 14); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("RETRY", W / 2, btnY + btnH / 2 + 2);
    menuButtons.retry = { x: btnX, y: btnY, w: btnW, h: btnH };

    const mbtnY = H * 0.66;
    ctx.fillStyle = "#546E7A";
    drawRoundRect(btnX, mbtnY, btnW, btnH, 14); ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px Arial`;
    ctx.fillText("MENU", W / 2, mbtnY + btnH / 2 + 2);
    menuButtons.menu = { x: btnX, y: mbtnY, w: btnW, h: btnH };
  }

  // --- Shop ---
  let shopScroll = 0;
  let shopTouchStartY = 0;
  let shopLastY = 0;

  function drawShop() {
    ctx.fillStyle = "#0f0f20";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, 90);

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.07)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("SHOP", W / 2, 42);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + data.coins, W / 2, 72);

    ctx.fillStyle = "#546E7A";
    drawRoundRect(12, 14, 70, 32, 8); ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.032)}px Arial`;
    ctx.fillText("BACK", 47, 35);
    menuButtons.shopBack = { x: 12, y: 14, w: 70, h: 32 };

    const cardW = W * 0.85, cardH = 90, gap = 10;
    const startY = 105 - shopScroll;

    menuButtons.skinCards = [];

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 90, W, H - 90); ctx.clip();

    for (let i = 0; i < SKINS.length; i++) {
      const skin = SKINS[i];
      const cy = startY + i * (cardH + gap);
      if (cy + cardH < 90 || cy > H) continue;

      const owned = data.skins.includes(skin.id);
      const equipped = data.currentSkin === skin.id;

      ctx.fillStyle = equipped ? "#1B5E20" : owned ? "#1a1a35" : "#252545";
      drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 12); ctx.fill();

      if (equipped) {
        ctx.strokeStyle = "#00E676"; ctx.lineWidth = 2;
        drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 12); ctx.stroke();
      }

      drawMiniBike((W - cardW) / 2 + 40, cy + cardH / 2 + 5, 1.3, skin);

      ctx.fillStyle = "#FFF";
      ctx.font = `bold ${Math.floor(W * 0.042)}px Arial`;
      ctx.textAlign = "left";
      ctx.fillText(skin.name, (W - cardW) / 2 + 75, cy + 35);

      ctx.font = `${Math.floor(W * 0.032)}px Arial`;
      if (equipped) {
        ctx.fillStyle = "#00E676";
        ctx.fillText("EQUIPPED", (W - cardW) / 2 + 75, cy + 60);
      } else if (owned) {
        ctx.fillStyle = "#90CAF9";
        ctx.fillText("TAP TO EQUIP", (W - cardW) / 2 + 75, cy + 60);
      } else {
        ctx.fillStyle = data.coins >= skin.price ? "#FFD700" : "#FF5252";
        ctx.fillText(skin.price + " coins", (W - cardW) / 2 + 75, cy + 60);
      }

      menuButtons.skinCards.push({ x: (W - cardW) / 2, y: cy, w: cardW, h: cardH, skinId: skin.id });
    }

    ctx.restore();
  }

  // ==========================================================
  // RENDER
  // ==========================================================
  function render() {
    ctx.clearRect(0, 0, W, H);

    if (state === STATE.MENU) {
      drawMenu();
    } else if (state === STATE.PLAYING || state === STATE.GAMEOVER) {
      drawSky();
      drawRoad();

      // Z-sort: far objects first
      const allObjects = [];
      for (const o of worldObstacles) allObjects.push({ ...o, kind: "obstacle" });
      for (const it of worldItems) allObjects.push({ ...it, kind: "item" });
      allObjects.push({ kind: "player", z: PLAYER_Z });
      allObjects.sort((a, b) => b.z - a.z);

      for (const obj of allObjects) {
        if (obj.kind === "player") {
          drawPlayerBike(getSkin(data.currentSkin));
        } else if (obj.kind === "obstacle") {
          if (obj.type === "car") draw3DCar(obj.x, obj.z, obj.carColor);
          else if (obj.type === "cone") draw3DCone(obj.x, obj.z);
          else if (obj.type === "box") draw3DBox(obj.x, obj.z);
          else if (obj.type === "oil") draw3DOil(obj.x, obj.z);
        } else if (obj.kind === "item") {
          if (obj.type === "coin") draw3DCoin(obj.x, obj.z, obj.bobPhase);
          else draw3DShield(obj.x, obj.z, obj.bobPhase);
        }
      }

      drawParticles();
      drawHUD();
      if (state === STATE.GAMEOVER) drawGameOver();
    } else if (state === STATE.SHOP) {
      drawShop();
    }
  }

  // --- Game Loop ---
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ==========================================================
  // INPUT
  // ==========================================================
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return {
      x: (t.clientX - rect.left) * (W / rect.width),
      y: (t.clientY - rect.top) * (H / rect.height),
    };
  }

  function inBtn(pos, btn) {
    return btn && pos.x >= btn.x && pos.x <= btn.x + btn.w && pos.y >= btn.y && pos.y <= btn.y + btn.h;
  }

  function handleStart(e) {
    e.preventDefault();
    const pos = getPos(e);

    if (state === STATE.MENU) {
      if (inBtn(pos, menuButtons.play)) {
        sessionCoins = 0; initGame(); state = STATE.PLAYING;
      } else if (inBtn(pos, menuButtons.shop)) {
        shopScroll = 0; state = STATE.SHOP;
      }
    } else if (state === STATE.PLAYING) {
      touchStartX = pos.x;
      isDragging = true;
    } else if (state === STATE.GAMEOVER) {
      if (inBtn(pos, menuButtons.retry)) {
        sessionCoins = 0; initGame(); state = STATE.PLAYING;
      } else if (inBtn(pos, menuButtons.menu)) {
        state = STATE.MENU;
      }
    } else if (state === STATE.SHOP) {
      if (inBtn(pos, menuButtons.shopBack)) { state = STATE.MENU; return; }
      if (menuButtons.skinCards) {
        for (const card of menuButtons.skinCards) {
          if (inBtn(pos, card)) {
            const skin = SKINS.find(s => s.id === card.skinId);
            if (!skin) break;
            if (data.skins.includes(skin.id)) {
              data.currentSkin = skin.id; saveData(data);
            } else if (data.coins >= skin.price) {
              data.coins -= skin.price;
              data.skins.push(skin.id);
              data.currentSkin = skin.id;
              saveData(data);
            }
            break;
          }
        }
      }
      isDragging = true;
      shopTouchStartY = pos.y;
      shopLastY = pos.y;
    }
  }

  function handleMove(e) {
    e.preventDefault();
    const pos = getPos(e);

    if (state === STATE.PLAYING && isDragging) {
      const delta = pos.x - touchStartX;
      playerTargetX += delta / (W * 0.35);
      playerTargetX = Math.max(-1, Math.min(1, playerTargetX));
      touchStartX = pos.x;
    } else if (state === STATE.SHOP && isDragging) {
      const dy = shopLastY - pos.y;
      shopScroll += dy;
      shopScroll = Math.max(0, Math.min(shopScroll, SKINS.length * 100 - H + 200));
      shopLastY = pos.y;
    }
  }

  function handleEnd(e) {
    e.preventDefault();
    isDragging = false;
    touchStartX = null;
  }

  canvas.addEventListener("mousedown", handleStart);
  canvas.addEventListener("mousemove", handleMove);
  canvas.addEventListener("mouseup", handleEnd);
  canvas.addEventListener("touchstart", handleStart, { passive: false });
  canvas.addEventListener("touchmove", handleMove, { passive: false });
  canvas.addEventListener("touchend", handleEnd, { passive: false });

  // Keyboard
  const keysDown = {};
  document.addEventListener("keydown", (e) => {
    keysDown[e.key] = true;
    if (state === STATE.MENU && (e.key === "Enter" || e.key === " ")) {
      sessionCoins = 0; initGame(); state = STATE.PLAYING;
    } else if (state === STATE.GAMEOVER) {
      if (e.key === "Enter" || e.key === " ") { sessionCoins = 0; initGame(); state = STATE.PLAYING; }
      else if (e.key === "Escape") state = STATE.MENU;
    } else if (state === STATE.SHOP && e.key === "Escape") {
      state = STATE.MENU;
    }
  });
  document.addEventListener("keyup", (e) => { keysDown[e.key] = false; });

  function keyboardSteering() {
    if (state === STATE.PLAYING) {
      if (keysDown["ArrowLeft"] || keysDown["a"]) {
        playerTargetX -= 0.035;
        playerTargetX = Math.max(-1, playerTargetX);
      }
      if (keysDown["ArrowRight"] || keysDown["d"]) {
        playerTargetX += 0.035;
        playerTargetX = Math.min(1, playerTargetX);
      }
    }
    requestAnimationFrame(keyboardSteering);
  }
  keyboardSteering();

  // --- Start ---
  loop();
})();
