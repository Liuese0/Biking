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
  const HORIZON = 0.38;        // horizon line ratio (from top)
  const CAM_HEIGHT = 1200;     // virtual camera height
  const ROAD_HALF_W = 1.5;     // half-width of road in world units
  const DRAW_DIST = 300;       // how far ahead we render segments
  const SEG_LENGTH = 5;        // world-unit length per segment
  const TOTAL_SEGS = Math.ceil(DRAW_DIST / SEG_LENGTH);
  const LANE_COUNT = 3;

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

  // Player
  let playerX = 0;       // -1 to 1 (road position)
  let playerTargetX = 0;
  let playerSpeed, gameTime, score, distance;
  let speedIncrement;
  let shieldActive, shieldTimer;
  let sessionCoins;
  let pedalAngle = 0;
  let playerBob = 0;

  // World objects (z = distance ahead of player)
  let worldObstacles = [];
  let worldItems = [];
  let particles = [];

  // Spawn
  let spawnTimer, spawnInterval;
  let worldZ = 0; // total distance traveled

  // Touch
  let touchStartX = null;
  let isDragging = false;

  // --- Projection ---
  // Projects a world point (wx, wz) to screen coordinates
  // wx: lateral position (-ROAD_HALF_W to +ROAD_HALF_W)
  // wz: distance ahead of camera
  function project(wx, wz) {
    if (wz <= 0) wz = 0.01;
    const scale = CAM_HEIGHT / wz;
    const horizonY = H * HORIZON;
    const sx = W / 2 + wx * scale * (W * 0.28);
    const sy = horizonY + (1.0 / wz) * CAM_HEIGHT * (H * 0.35);
    return { x: sx, y: sy, scale: scale };
  }

  // Road width at a given z
  function roadScreenWidth(wz) {
    if (wz <= 0) wz = 0.01;
    const scale = CAM_HEIGHT / wz;
    return ROAD_HALF_W * 2 * scale * (W * 0.28);
  }

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
    // lane 0,1,2 -> x positions
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
      hitW: type === "car" ? 0.45 : 0.3,
      hitD: type === "car" ? 0.8 : 0.4,
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

  // --- Particles ---
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

    // Player lateral movement
    const dx = playerTargetX - playerX;
    playerX += dx * 0.12;
    playerX = Math.max(-1, Math.min(1, playerX));

    // Spawn
    spawnTimer++;
    const adjInterval = Math.max(25, spawnInterval - gameTime * 0.008);
    if (spawnTimer >= adjInterval) {
      spawnTimer = 0;
      spawnObstacle();
      if (Math.random() < 0.5) spawnItem();
    }

    // World position of player (in road coords)
    const pWorldX = playerX * ROAD_HALF_W * 0.8;
    const pWorldZ = 8; // player is at z=8 from camera

    // Update obstacles
    for (let i = worldObstacles.length - 1; i >= 0; i--) {
      const o = worldObstacles[i];
      o.z -= dz - (o.carSpeed * 0.15);
      if (o.z < -5) {
        worldObstacles.splice(i, 1);
        continue;
      }

      // Collision check (simple box in world space)
      const dzDiff = Math.abs(o.z - pWorldZ);
      const dxDiff = Math.abs(o.x - pWorldX);
      if (dzDiff < o.hitD && dxDiff < o.hitW * 0.7) {
        if (shieldActive) {
          shieldActive = false;
          const p = project(o.x, o.z);
          addParticles(p.x, p.y, "#00E5FF", 15);
          worldObstacles.splice(i, 1);
        } else {
          const p = project(pWorldX, pWorldZ);
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
      if (it.z < -5) {
        worldItems.splice(i, 1);
        continue;
      }
      const dzDiff = Math.abs(it.z - pWorldZ);
      const dxDiff = Math.abs(it.x - pWorldX);
      if (dzDiff < 1.2 && dxDiff < 0.4) {
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

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life--;
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

  // --- Draw Sky & Environment ---
  function drawSky() {
    const horizonY = H * HORIZON;

    // Sky gradient
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
      const sy = (starSeed[(i + 3) % starSeed.length]) * horizonY * 0.7;
      const brightness = 0.3 + Math.sin(gameTime * 0.02 + i) * 0.3;
      ctx.globalAlpha = brightness;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    // City silhouette on horizon
    drawCitySilhouette(horizonY);

    // Moon
    ctx.fillStyle = "#E8E8F0";
    ctx.beginPath();
    ctx.arc(W * 0.78, horizonY * 0.25, W * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#D0D0E0";
    ctx.beginPath();
    ctx.arc(W * 0.775, horizonY * 0.245, W * 0.015, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCitySilhouette(horizonY) {
    ctx.fillStyle = "#0d0d22";
    const buildings = [
      { x: 0, w: 0.06, h: 0.08 },
      { x: 0.05, w: 0.04, h: 0.14 },
      { x: 0.08, w: 0.06, h: 0.06 },
      { x: 0.14, w: 0.03, h: 0.18 },
      { x: 0.17, w: 0.05, h: 0.1 },
      { x: 0.22, w: 0.04, h: 0.22 },
      { x: 0.26, w: 0.06, h: 0.12 },
      { x: 0.32, w: 0.03, h: 0.16 },
      { x: 0.35, w: 0.07, h: 0.08 },
      { x: 0.42, w: 0.04, h: 0.25 },
      { x: 0.46, w: 0.05, h: 0.13 },
      { x: 0.51, w: 0.06, h: 0.09 },
      { x: 0.57, w: 0.03, h: 0.2 },
      { x: 0.60, w: 0.05, h: 0.11 },
      { x: 0.65, w: 0.04, h: 0.17 },
      { x: 0.69, w: 0.06, h: 0.07 },
      { x: 0.75, w: 0.03, h: 0.23 },
      { x: 0.78, w: 0.05, h: 0.1 },
      { x: 0.83, w: 0.04, h: 0.15 },
      { x: 0.87, w: 0.06, h: 0.09 },
      { x: 0.93, w: 0.04, h: 0.19 },
      { x: 0.97, w: 0.04, h: 0.11 },
    ];
    for (const b of buildings) {
      const bx = b.x * W;
      const bw = b.w * W;
      const bh = b.h * H;
      ctx.fillRect(bx, horizonY - bh, bw, bh + 2);

      // Small lit windows
      ctx.fillStyle = "rgba(255,210,100,0.15)";
      for (let wy = horizonY - bh + 4; wy < horizonY - 4; wy += 8) {
        for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) {
          if (Math.sin(wx * 13.7 + wy * 7.3) > 0.3) {
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      ctx.fillStyle = "#0d0d22";
    }
  }

  // --- Draw Road (Pseudo 3D) ---
  function drawRoad() {
    const horizonY = H * HORIZON;

    // Ground below horizon
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    groundGrad.addColorStop(0, "#2a3a2a");
    groundGrad.addColorStop(0.1, "#1e2e1e");
    groundGrad.addColorStop(1, "#0f1a0f");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Draw road segments from far to near
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

      // Alternating road color for depth feel
      const segIndex = Math.floor(worldZ / SEG_LENGTH) + i;
      const dark = segIndex % 2 === 0;

      // Grass/shoulder
      const grassW1 = (p1R.x - p1L.x) * 0.15;
      const grassW2 = (p2R.x - p2L.x) * 0.15;

      // Left grass
      ctx.fillStyle = dark ? "#1a3a1a" : "#1e4020";
      ctx.beginPath();
      ctx.moveTo(p1L.x - grassW1, p1L.y);
      ctx.lineTo(p1L.x, p1L.y);
      ctx.lineTo(p2L.x, p2L.y);
      ctx.lineTo(p2L.x - grassW2, p2L.y);
      ctx.closePath();
      ctx.fill();

      // Right grass
      ctx.beginPath();
      ctx.moveTo(p1R.x, p1R.y);
      ctx.lineTo(p1R.x + grassW1, p1R.y);
      ctx.lineTo(p2R.x + grassW2, p2R.y);
      ctx.lineTo(p2R.x, p2R.y);
      ctx.closePath();
      ctx.fill();

      // Road surface
      ctx.fillStyle = dark ? "#333345" : "#3a3a52";
      ctx.beginPath();
      ctx.moveTo(p1L.x, p1L.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p2R.x, p2R.y);
      ctx.lineTo(p2L.x, p2L.y);
      ctx.closePath();
      ctx.fill();

      // Road edge lines (white)
      ctx.fillStyle = "#CCC";
      const edgeW1 = Math.max(1, (p2R.x - p2L.x) * 0.012);
      // Left edge
      ctx.beginPath();
      ctx.moveTo(p1L.x, p1L.y);
      ctx.lineTo(p1L.x + edgeW1, p1L.y);
      ctx.lineTo(p2L.x + edgeW1, p2L.y);
      ctx.lineTo(p2L.x, p2L.y);
      ctx.closePath();
      ctx.fill();
      // Right edge
      ctx.beginPath();
      ctx.moveTo(p1R.x - edgeW1, p1R.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p2R.x, p2R.y);
      ctx.lineTo(p2R.x - edgeW1, p2R.y);
      ctx.closePath();
      ctx.fill();

      // Lane dashes (only on certain segments)
      if (segIndex % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        for (let ln = 1; ln < LANE_COUNT; ln++) {
          const frac = ln / LANE_COUNT;
          const lx1 = p1L.x + (p1R.x - p1L.x) * frac;
          const lx2 = p2L.x + (p2R.x - p2L.x) * frac;
          const dashW = Math.max(1, (p2R.x - p2L.x) * 0.008);
          ctx.beginPath();
          ctx.moveTo(lx1 - dashW, p1L.y);
          ctx.lineTo(lx1 + dashW, p1L.y);
          ctx.lineTo(lx2 + dashW, p2L.y);
          ctx.lineTo(lx2 - dashW, p2L.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // --- Draw 3D Car (back view) ---
  function draw3DCar(wx, wz, color) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;

    const s = Math.min(p.scale * 1.5, 12);
    const carW = s * 22;
    const carH = s * 16;
    const cx = p.x;
    const cy = p.y;

    if (carW < 2) return;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + carH * 0.05, carW * 0.55, carH * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Car body (back view - we see the rear)
    const bodyX = cx - carW / 2;
    const bodyY = cy - carH;

    // Main body
    ctx.fillStyle = color;
    drawRoundRect(bodyX, bodyY + carH * 0.15, carW, carH * 0.65, carW * 0.08);
    ctx.fill();

    // Roof
    ctx.fillStyle = shadeColor(color, -20);
    drawRoundRect(bodyX + carW * 0.1, bodyY, carW * 0.8, carH * 0.35, carW * 0.06);
    ctx.fill();

    // Rear window
    ctx.fillStyle = "rgba(100,180,220,0.5)";
    drawRoundRect(bodyX + carW * 0.15, bodyY + carH * 0.03, carW * 0.7, carH * 0.25, carW * 0.04);
    ctx.fill();

    // Rear lights
    ctx.fillStyle = "#FF1744";
    ctx.shadowColor = "#FF1744";
    ctx.shadowBlur = s * 3;
    drawRoundRect(bodyX + carW * 0.05, bodyY + carH * 0.55, carW * 0.15, carH * 0.12, 2);
    ctx.fill();
    drawRoundRect(bodyX + carW * 0.8, bodyY + carH * 0.55, carW * 0.15, carH * 0.12, 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // License plate
    ctx.fillStyle = "#FFF";
    drawRoundRect(cx - carW * 0.15, bodyY + carH * 0.7, carW * 0.3, carH * 0.1, 1);
    ctx.fill();

    // Wheels (visible at sides)
    ctx.fillStyle = "#111";
    ctx.fillRect(bodyX - carW * 0.03, cy - carH * 0.2, carW * 0.08, carH * 0.18);
    ctx.fillRect(bodyX + carW * 0.95, cy - carH * 0.2, carW * 0.08, carH * 0.18);
  }

  function shadeColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
    return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  // --- Draw 3D Cone ---
  function draw3DCone(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;
    const s = Math.min(p.scale * 1.5, 12);
    const coneH = s * 14;
    const coneW = s * 7;
    if (coneW < 1) return;

    const cx = p.x;
    const cy = p.y;

    // Base
    ctx.fillStyle = "#FF6D00";
    ctx.beginPath();
    ctx.moveTo(cx, cy - coneH);
    ctx.lineTo(cx - coneW / 2, cy);
    ctx.lineTo(cx + coneW / 2, cy);
    ctx.closePath();
    ctx.fill();

    // White stripes
    ctx.fillStyle = "#FFF";
    ctx.beginPath();
    const stripeY = cy - coneH * 0.45;
    const stripeW = coneW * 0.35;
    ctx.fillRect(cx - stripeW / 2, stripeY, stripeW, coneH * 0.15);

    // Base plate
    ctx.fillStyle = "#E65100";
    ctx.beginPath();
    ctx.ellipse(cx, cy, coneW * 0.6, coneH * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Draw 3D Box ---
  function draw3DBox(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;
    const s = Math.min(p.scale * 1.5, 12);
    const bw = s * 10;
    const bh = s * 10;
    if (bw < 1) return;

    const cx = p.x;
    const cy = p.y;

    // Front face
    ctx.fillStyle = "#8D6E63";
    ctx.fillRect(cx - bw / 2, cy - bh, bw, bh);

    // Top face (3D effect)
    ctx.fillStyle = "#A1887F";
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh);
    ctx.lineTo(cx - bw * 0.3, cy - bh - bh * 0.2);
    ctx.lineTo(cx + bw * 0.7, cy - bh - bh * 0.2);
    ctx.lineTo(cx + bw / 2, cy - bh);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = "#6D4C41";
    ctx.beginPath();
    ctx.moveTo(cx + bw / 2, cy - bh);
    ctx.lineTo(cx + bw * 0.7, cy - bh - bh * 0.2);
    ctx.lineTo(cx + bw * 0.7, cy + bh * 0.2 - bh * 0.2);
    ctx.lineTo(cx + bw / 2, cy);
    ctx.closePath();
    ctx.fill();

    // Tape cross
    ctx.strokeStyle = "#FFCC80";
    ctx.lineWidth = Math.max(1, s * 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh);
    ctx.lineTo(cx + bw / 2, cy);
    ctx.moveTo(cx + bw / 2, cy - bh);
    ctx.lineTo(cx - bw / 2, cy);
    ctx.stroke();
  }

  // --- Draw 3D Oil ---
  function draw3DOil(wx, wz) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;
    const s = Math.min(p.scale * 1.5, 12);
    const ow = s * 14;
    const oh = s * 4;
    if (ow < 1) return;

    ctx.fillStyle = "rgba(20,20,30,0.65)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - oh * 0.3, ow * 0.5, oh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sheen
    ctx.fillStyle = "rgba(80,80,120,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x - ow * 0.1, p.y - oh * 0.5, ow * 0.2, oh * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Draw 3D Coin ---
  function draw3DCoin(wx, wz, bobPhase) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;
    const s = Math.min(p.scale * 1.5, 12);
    const r = s * 5;
    if (r < 1) return;

    const bob = Math.sin(bobPhase) * s * 2;

    ctx.save();
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = s * 4;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(p.x, p.y - r - bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#FFC107";
    ctx.beginPath();
    ctx.arc(p.x, p.y - r - bob, r * 0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#FF8F00";
    ctx.font = `bold ${Math.max(6, Math.floor(r * 1.2))}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", p.x, p.y - r - bob + 1);
    ctx.restore();
  }

  // --- Draw 3D Shield Item ---
  function draw3DShield(wx, wz, bobPhase) {
    const p = project(wx, wz);
    if (p.y < H * HORIZON) return;
    const s = Math.min(p.scale * 1.5, 12);
    const sz = s * 6;
    if (sz < 1) return;

    const bob = Math.sin(bobPhase) * s * 2;

    ctx.save();
    ctx.shadowColor = "#00E5FF";
    ctx.shadowBlur = s * 5;
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = Math.max(1, s * 0.6);
    ctx.beginPath();
    const sy = p.y - sz - bob;
    ctx.moveTo(p.x, sy - sz);
    ctx.lineTo(p.x + sz * 0.8, sy - sz * 0.5);
    ctx.lineTo(p.x + sz * 0.8, sy + sz * 0.3);
    ctx.quadraticCurveTo(p.x, sy + sz, p.x, sy + sz);
    ctx.quadraticCurveTo(p.x, sy + sz, p.x - sz * 0.8, sy + sz * 0.3);
    ctx.lineTo(p.x - sz * 0.8, sy - sz * 0.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,229,255,0.2)";
    ctx.fill();
    ctx.restore();
  }

  // --- Draw Player Bike (Back View, Large, Near Camera) ---
  function drawPlayerBike(skin) {
    const pWorldX = playerX * ROAD_HALF_W * 0.8;
    const pWorldZ = 8;
    const p = project(pWorldX, pWorldZ);

    const baseScale = W * 0.0045;
    const cx = p.x;
    const cy = p.y + playerBob;

    ctx.save();
    ctx.translate(cx, cy);

    // --- Shadow on ground ---
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, baseScale * 5, baseScale * 18, baseScale * 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Scale everything
    const s = baseScale;

    // === REAR WHEEL ===
    const wheelR = s * 14;
    const wheelY = s * 2;

    ctx.strokeStyle = "#333";
    ctx.lineWidth = s * 2.5;
    ctx.beginPath();
    ctx.arc(0, wheelY, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    // Tire
    ctx.strokeStyle = "#555";
    ctx.lineWidth = s * 4;
    ctx.beginPath();
    ctx.arc(0, wheelY, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    // Hub
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(0, wheelY, s * 3, 0, Math.PI * 2);
    ctx.fill();

    // Spokes
    ctx.strokeStyle = "#999";
    ctx.lineWidth = s * 0.5;
    for (let i = 0; i < 8; i++) {
      const a = pedalAngle + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 3, wheelY + Math.sin(a) * s * 3);
      ctx.lineTo(Math.cos(a) * wheelR * 0.85, wheelY + Math.sin(a) * wheelR * 0.85);
      ctx.stroke();
    }

    // === FRAME (seen from behind - foreshortened) ===
    // Seat stays going up from rear axle
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 2;
    ctx.beginPath();
    ctx.moveTo(-s * 4, wheelY);
    ctx.lineTo(-s * 3, -s * 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 4, wheelY);
    ctx.lineTo(s * 3, -s * 12);
    ctx.stroke();

    // Seat tube (center, going up)
    ctx.lineWidth = s * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, wheelY);
    ctx.lineTo(0, -s * 16);
    ctx.stroke();

    // Top tube going forward (foreshortened)
    ctx.lineWidth = s * 2;
    ctx.beginPath();
    ctx.moveTo(-s * 2.5, -s * 13);
    ctx.lineTo(0, -s * 18);
    ctx.lineTo(s * 2.5, -s * 13);
    ctx.stroke();

    // === SEAT ===
    ctx.fillStyle = "#2C2C2C";
    drawRoundRect(-s * 5, -s * 17, s * 10, s * 3.5, s * 1.5);
    ctx.fill();

    // === HANDLEBARS (seen from behind, curved) ===
    ctx.strokeStyle = "#AAA";
    ctx.lineWidth = s * 2;
    ctx.beginPath();
    ctx.moveTo(-s * 12, -s * 22);
    ctx.quadraticCurveTo(-s * 6, -s * 24, 0, -s * 23);
    ctx.quadraticCurveTo(s * 6, -s * 24, s * 12, -s * 22);
    ctx.stroke();

    // Handlebar grips
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(-s * 12, -s * 22, s * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 12, -s * 22, s * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Head tube
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -s * 18);
    ctx.lineTo(0, -s * 23);
    ctx.stroke();

    // === RIDER (Back View) ===
    // LEGS (pedaling animation)
    const legPhase = pedalAngle;
    ctx.strokeStyle = skin.pants;
    ctx.lineWidth = s * 4;
    ctx.lineCap = "round";

    // Left leg
    const lKneeX = -s * 5 + Math.sin(legPhase) * s * 3;
    const lKneeY = -s * 4 + Math.cos(legPhase) * s * 4;
    const lFootY = wheelY - s * 2 + Math.cos(legPhase) * s * 3;
    ctx.beginPath();
    ctx.moveTo(-s * 3, -s * 14);
    ctx.lineTo(lKneeX, lKneeY);
    ctx.lineTo(-s * 3 + Math.sin(legPhase) * s * 2, lFootY);
    ctx.stroke();

    // Right leg
    const rKneeX = s * 5 + Math.sin(legPhase + Math.PI) * s * 3;
    const rKneeY = -s * 4 + Math.cos(legPhase + Math.PI) * s * 4;
    const rFootY = wheelY - s * 2 + Math.cos(legPhase + Math.PI) * s * 3;
    ctx.beginPath();
    ctx.moveTo(s * 3, -s * 14);
    ctx.lineTo(rKneeX, rKneeY);
    ctx.lineTo(s * 3 + Math.sin(legPhase + Math.PI) * s * 2, rFootY);
    ctx.stroke();

    // Shoes
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(-s * 3 + Math.sin(legPhase) * s * 2, lFootY, s * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 3 + Math.sin(legPhase + Math.PI) * s * 2, rFootY, s * 2, 0, Math.PI * 2);
    ctx.fill();

    // TORSO (back of jersey)
    ctx.fillStyle = skin.shirt;
    ctx.beginPath();
    ctx.moveTo(-s * 8, -s * 14);
    ctx.quadraticCurveTo(-s * 9, -s * 24, -s * 4, -s * 30);
    ctx.lineTo(s * 4, -s * 30);
    ctx.quadraticCurveTo(s * 9, -s * 24, s * 8, -s * 14);
    ctx.closePath();
    ctx.fill();

    // Jersey detail line (back)
    ctx.strokeStyle = shadeColor(skin.shirt, -30);
    ctx.lineWidth = s * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -s * 30);
    ctx.lineTo(0, -s * 14);
    ctx.stroke();

    // ARMS (reaching to handlebars)
    ctx.strokeStyle = skin.shirt;
    ctx.lineWidth = s * 3.5;
    ctx.lineCap = "round";
    // Left arm
    ctx.beginPath();
    ctx.moveTo(-s * 8, -s * 27);
    ctx.quadraticCurveTo(-s * 12, -s * 24, -s * 11, -s * 22);
    ctx.stroke();
    // Right arm
    ctx.beginPath();
    ctx.moveTo(s * 8, -s * 27);
    ctx.quadraticCurveTo(s * 12, -s * 24, s * 11, -s * 22);
    ctx.stroke();

    // Hands/gloves
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(-s * 11.5, -s * 22, s * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 11.5, -s * 22, s * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // HEAD
    // Neck
    ctx.fillStyle = "#E8B887";
    ctx.fillRect(-s * 2, -s * 33, s * 4, s * 4);

    // Helmet (back view)
    ctx.fillStyle = skin.frame;
    ctx.beginPath();
    ctx.ellipse(0, -s * 36, s * 7, s * 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helmet visor edge
    ctx.fillStyle = shadeColor(skin.frame, -25);
    ctx.beginPath();
    ctx.ellipse(0, -s * 33, s * 7.2, s * 2.5, 0, 0, Math.PI);
    ctx.fill();

    // Helmet stripe
    ctx.fillStyle = "#FFF";
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-s * 0.8, -s * 42, s * 1.6, s * 10);
    ctx.globalAlpha = 1;

    // === SHIELD EFFECT ===
    if (shieldActive) {
      const pulse = 0.5 + Math.sin(shieldTimer * 0.12) * 0.3;
      ctx.strokeStyle = `rgba(0, 229, 255, ${pulse})`;
      ctx.lineWidth = s * 1.5;
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = s * 8;
      ctx.beginPath();
      ctx.ellipse(0, -s * 15, s * 18, s * 28, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // --- Draw Mini Bike for menus ---
  function drawMiniBike(cx, cy, scale, skin) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = scale;

    // Wheel
    ctx.strokeStyle = "#555";
    ctx.lineWidth = s * 3;
    ctx.beginPath();
    ctx.arc(0, s * 2, s * 10, 0, Math.PI * 2);
    ctx.stroke();

    // Frame
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = s * 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 2);
    ctx.lineTo(0, -s * 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 8, -s * 16);
    ctx.quadraticCurveTo(0, -s * 18, s * 8, -s * 16);
    ctx.stroke();

    // Body
    ctx.fillStyle = skin.shirt;
    ctx.beginPath();
    ctx.moveTo(-s * 5, -s * 10);
    ctx.quadraticCurveTo(-s * 6, -s * 20, -s * 3, -s * 24);
    ctx.lineTo(s * 3, -s * 24);
    ctx.quadraticCurveTo(s * 6, -s * 20, s * 5, -s * 10);
    ctx.closePath();
    ctx.fill();

    // Helmet
    ctx.fillStyle = skin.frame;
    ctx.beginPath();
    ctx.arc(0, -s * 28, s * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // --- Draw HUD ---
  function drawHUD() {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    drawRoundRect(8, 8, W * 0.45, 58, 10);
    ctx.fill();

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px 'Segoe UI', Arial`;
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 18, 34);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + sessionCoins, 18, 56);

    // Speed
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    drawRoundRect(W - W * 0.3 - 8, 8, W * 0.3, 35, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `bold ${Math.floor(W * 0.033)}px Arial`;
    ctx.textAlign = "right";
    ctx.fillText(Math.floor(playerSpeed * 15) + " km/h", W - 18, 33);

    if (shieldActive) {
      ctx.fillStyle = "rgba(0,229,255,0.6)";
      ctx.font = `bold ${Math.floor(W * 0.035)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText("SHIELD", W / 2, 30);
    }
  }

  // --- Draw Particles ---
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // --- Screens ---
  const menuButtons = {};

  function drawMenu() {
    // Animated background
    drawSky();
    drawRoad();

    // Darken overlay
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);

    // Title
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

    // Subtitle
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `${Math.floor(W * 0.033)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("Hyper Casual Bike Runner", W / 2, H * 0.31);

    // Bike preview
    const currentSkin = getSkin(data.currentSkin);
    drawMiniBike(W / 2, H * 0.44, W * 0.0035, currentSkin);

    // High score
    ctx.fillStyle = "#FFD54F";
    ctx.font = `bold ${Math.floor(W * 0.04)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("BEST: " + data.highScore, W / 2, H * 0.56);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + data.coins, W / 2, H * 0.61);

    // Play button
    const btnW = W * 0.6;
    const btnH = H * 0.065;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.67;

    ctx.fillStyle = "#00E676";
    ctx.shadowColor = "#00E676";
    ctx.shadowBlur = 15;
    drawRoundRect(btnX, btnY, btnW, btnH, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("PLAY", W / 2, btnY + btnH / 2 + 2);
    menuButtons.play = { x: btnX, y: btnY, w: btnW, h: btnH };

    // Shop
    const sbtnY = H * 0.78;
    ctx.fillStyle = "#7C4DFF";
    ctx.shadowColor = "#7C4DFF";
    ctx.shadowBlur = 10;
    drawRoundRect(btnX, sbtnY, btnW, btnH, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px Arial`;
    ctx.fillText("SHOP", W / 2, sbtnY + btnH / 2 + 2);
    menuButtons.shop = { x: btnX, y: sbtnY, w: btnW, h: btnH };

    // Controls hint
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `${Math.floor(W * 0.028)}px Arial`;
    ctx.fillText("Drag left/right to steer", W / 2, H * 0.92);
  }

  function drawGameOver() {
    // Keep the 3D scene visible behind
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);

    // Crash text with shake effect
    ctx.save();
    ctx.shadowColor = "#FF1744";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#FF5252";
    ctx.font = `bold ${Math.floor(W * 0.1)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("CRASH!", W / 2, H * 0.22);
    ctx.restore();

    // Score panel
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    drawRoundRect(W * 0.1, H * 0.28, W * 0.8, H * 0.22, 16);
    ctx.fill();

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.055)}px Arial`;
    ctx.fillText("Score: " + score, W / 2, H * 0.35);

    ctx.fillStyle = "#FFD54F";
    ctx.font = `${Math.floor(W * 0.04)}px Arial`;
    ctx.fillText("Best: " + data.highScore, W / 2, H * 0.41);

    ctx.fillStyle = "#FFD700";
    ctx.fillText("Coins: +" + sessionCoins, W / 2, H * 0.47);

    // Retry
    const btnW = W * 0.6;
    const btnH = H * 0.065;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.56;
    ctx.fillStyle = "#00E676";
    ctx.shadowColor = "#00E676";
    ctx.shadowBlur = 12;
    drawRoundRect(btnX, btnY, btnW, btnH, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("RETRY", W / 2, btnY + btnH / 2 + 2);
    menuButtons.retry = { x: btnX, y: btnY, w: btnW, h: btnH };

    // Menu
    const mbtnY = H * 0.66;
    ctx.fillStyle = "#546E7A";
    drawRoundRect(btnX, mbtnY, btnW, btnH, 14);
    ctx.fill();
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

    // Header
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, 90);

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.07)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("SHOP", W / 2, 42);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.035)}px Arial`;
    ctx.fillText("Coins: " + data.coins, W / 2, 72);

    // Back
    ctx.fillStyle = "#546E7A";
    drawRoundRect(12, 14, 70, 32, 8);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.032)}px Arial`;
    ctx.fillText("BACK", 47, 35);
    menuButtons.shopBack = { x: 12, y: 14, w: 70, h: 32 };

    // Skin cards
    const cardW = W * 0.85;
    const cardH = 90;
    const startY = 105 - shopScroll;
    const gap = 10;

    menuButtons.skinCards = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 90, W, H - 90);
    ctx.clip();

    for (let i = 0; i < SKINS.length; i++) {
      const skin = SKINS[i];
      const cy = startY + i * (cardH + gap);
      if (cy + cardH < 90 || cy > H) continue;

      const owned = data.skins.includes(skin.id);
      const equipped = data.currentSkin === skin.id;

      ctx.fillStyle = equipped ? "#1B5E20" : owned ? "#1a1a35" : "#252545";
      drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 12);
      ctx.fill();

      if (equipped) {
        ctx.strokeStyle = "#00E676";
        ctx.lineWidth = 2;
        drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 12);
        ctx.stroke();
      }

      // Mini bike
      drawMiniBike((W - cardW) / 2 + 40, cy + cardH / 2 + 5, 1.3, skin);

      // Name
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

      menuButtons.skinCards.push({
        x: (W - cardW) / 2, y: cy, w: cardW, h: cardH, skinId: skin.id,
      });
    }

    ctx.restore();
  }

  // --- Render ---
  function render() {
    ctx.clearRect(0, 0, W, H);

    if (state === STATE.MENU) {
      drawMenu();
    } else if (state === STATE.PLAYING || state === STATE.GAMEOVER) {
      drawSky();
      drawRoad();

      // Collect all world objects, sort by z (far first)
      const allObjects = [];
      for (const o of worldObstacles) allObjects.push({ ...o, kind: "obstacle" });
      for (const it of worldItems) allObjects.push({ ...it, kind: "item" });
      allObjects.push({ kind: "player", z: 8 });
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

  // --- Input ---
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
        sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      } else if (inBtn(pos, menuButtons.shop)) {
        shopScroll = 0;
        state = STATE.SHOP;
      }
    } else if (state === STATE.PLAYING) {
      touchStartX = pos.x;
      isDragging = true;
    } else if (state === STATE.GAMEOVER) {
      if (inBtn(pos, menuButtons.retry)) {
        sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      } else if (inBtn(pos, menuButtons.menu)) {
        state = STATE.MENU;
      }
    } else if (state === STATE.SHOP) {
      if (inBtn(pos, menuButtons.shopBack)) {
        state = STATE.MENU;
        return;
      }
      if (menuButtons.skinCards) {
        for (const card of menuButtons.skinCards) {
          if (inBtn(pos, card)) {
            const skin = SKINS.find(s => s.id === card.skinId);
            if (!skin) break;
            if (data.skins.includes(skin.id)) {
              data.currentSkin = skin.id;
              saveData(data);
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
      // Map screen drag to road position
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
      sessionCoins = 0;
      initGame();
      state = STATE.PLAYING;
    } else if (state === STATE.GAMEOVER) {
      if (e.key === "Enter" || e.key === " ") {
        sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      } else if (e.key === "Escape") {
        state = STATE.MENU;
      }
    } else if (state === STATE.SHOP && e.key === "Escape") {
      state = STATE.MENU;
    }
  });
  document.addEventListener("keyup", (e) => { keysDown[e.key] = false; });

  // Continuous keyboard steering
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
