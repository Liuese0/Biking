// ============================================================
// Ride or Crash - Hyper Casual Bike Running Game
// ============================================================

(function () {
  "use strict";

  // --- Canvas Setup ---
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  let W, H;
  const ASPECT = 16 / 9;
  const LANE_COUNT = 3;
  let LANE_WIDTH, ROAD_LEFT, ROAD_RIGHT, ROAD_WIDTH;
  let lanePositions = [];

  function resize() {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    if (ww / wh < 9 / 16) {
      W = ww;
      H = ww * ASPECT;
    } else {
      H = wh;
      W = wh / ASPECT;
    }
    W = Math.floor(W);
    H = Math.floor(H);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    ROAD_WIDTH = W * 0.78;
    ROAD_LEFT = (W - ROAD_WIDTH) / 2;
    ROAD_RIGHT = ROAD_LEFT + ROAD_WIDTH;
    LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
    lanePositions = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      lanePositions.push(ROAD_LEFT + LANE_WIDTH * i + LANE_WIDTH / 2);
    }
  }

  window.addEventListener("resize", resize);
  resize();

  // --- Storage ---
  function loadData() {
    try {
      return JSON.parse(localStorage.getItem("roc_save")) || {};
    } catch (e) {
      return {};
    }
  }
  function saveData(d) {
    localStorage.setItem("roc_save", JSON.stringify(d));
  }
  function getData() {
    const d = loadData();
    if (!d.coins) d.coins = 0;
    if (!d.highScore) d.highScore = 0;
    if (!d.skins) d.skins = ["default"];
    if (!d.currentSkin) d.currentSkin = "default";
    return d;
  }

  // --- Skin Definitions ---
  const SKINS = [
    { id: "default", name: "Basic", price: 0, frame: "#4FC3F7", wheel: "#333", body: "#29B6F6" },
    { id: "red_racer", name: "Red Racer", price: 100, frame: "#EF5350", wheel: "#222", body: "#F44336" },
    { id: "green_eco", name: "Green Eco", price: 150, frame: "#66BB6A", wheel: "#333", body: "#43A047" },
    { id: "gold_rush", name: "Gold Rush", price: 300, frame: "#FFD54F", wheel: "#444", body: "#FFC107" },
    { id: "purple_night", name: "Purple Night", price: 250, frame: "#AB47BC", wheel: "#222", body: "#8E24AA" },
    { id: "neon_pink", name: "Neon Pink", price: 400, frame: "#FF4081", wheel: "#111", body: "#F50057" },
    { id: "ice_blue", name: "Ice Blue", price: 350, frame: "#80DEEA", wheel: "#2C2C2C", body: "#00BCD4" },
    { id: "sunset", name: "Sunset", price: 500, frame: "#FF7043", wheel: "#333", body: "#FF5722" },
  ];

  function getSkin(id) {
    return SKINS.find(s => s.id === id) || SKINS[0];
  }

  // --- Game State ---
  const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, SHOP: 3 };
  let state = STATE.MENU;
  let data = getData();

  // Player
  let player = {};
  let obstacles = [];
  let items = [];
  let particles = [];
  let roadMarkings = [];

  // Game vars
  let score, distance, gameSpeed, speedIncrement, spawnTimer, spawnInterval;
  let shieldActive, shieldTimer;
  let gameTime;
  let pedalAngle = 0;

  // Touch
  let touchStartX = null;
  let touchCurrentX = null;
  let isDragging = false;
  let playerTargetX;

  // Road animation
  let roadOffset = 0;

  // --- Init ---
  function initGame() {
    const skinData = getSkin(data.currentSkin);
    player = {
      x: W / 2,
      y: H * 0.75,
      w: LANE_WIDTH * 0.4,
      h: LANE_WIDTH * 0.7,
      lane: 1,
      skin: skinData,
    };
    playerTargetX = lanePositions[1];
    player.x = playerTargetX;

    obstacles = [];
    items = [];
    particles = [];

    score = 0;
    distance = 0;
    gameSpeed = 4;
    speedIncrement = 0.001;
    spawnTimer = 0;
    spawnInterval = 80;
    shieldActive = false;
    shieldTimer = 0;
    gameTime = 0;
    pedalAngle = 0;

    // Init road markings
    roadMarkings = [];
    const markGap = H / 6;
    for (let i = 0; i < 8; i++) {
      roadMarkings.push({ y: i * markGap });
    }
  }

  // --- Spawn Functions ---
  function spawnObstacle() {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const types = ["car", "cone", "box", "oil"];
    const weights = [0.35, 0.25, 0.2, 0.2];
    let r = Math.random(), cum = 0, type = types[0];
    for (let i = 0; i < weights.length; i++) {
      cum += weights[i];
      if (r < cum) { type = types[i]; break; }
    }

    const w = type === "car" ? LANE_WIDTH * 0.55 : LANE_WIDTH * 0.35;
    const h = type === "car" ? LANE_WIDTH * 0.9 : LANE_WIDTH * 0.35;
    const speed = type === "car" ? gameSpeed * 0.4 : 0;

    obstacles.push({
      x: lanePositions[lane],
      y: -h,
      w, h,
      type,
      lane,
      speed,
    });
  }

  function spawnItem() {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const isShield = Math.random() < 0.12;
    items.push({
      x: lanePositions[lane],
      y: -30,
      w: 28,
      h: 28,
      lane,
      type: isShield ? "shield" : "coin",
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  // --- Particles ---
  function addParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  // --- Collision ---
  function boxCollide(a, b) {
    return (
      a.x - a.w / 2 < b.x + b.w / 2 &&
      a.x + a.w / 2 > b.x - b.w / 2 &&
      a.y - a.h / 2 < b.y + b.h / 2 &&
      a.y + a.h / 2 > b.y - b.h / 2
    );
  }

  // --- Update ---
  function update() {
    if (state !== STATE.PLAYING) return;

    gameTime++;
    distance += gameSpeed * 0.1;
    score = Math.floor(distance) + data._sessionCoins * 5;
    gameSpeed += speedIncrement;
    pedalAngle += gameSpeed * 0.05;

    // Road markings
    for (let m of roadMarkings) {
      m.y += gameSpeed * 1.2;
      if (m.y > H + 40) m.y -= (H / 6) * 8;
    }

    // Spawn
    spawnTimer++;
    const adjustedInterval = Math.max(30, spawnInterval - gameTime * 0.01);
    if (spawnTimer >= adjustedInterval) {
      spawnTimer = 0;
      spawnObstacle();
      if (Math.random() < 0.5) spawnItem();
    }

    // Player movement (smooth)
    const dx = playerTargetX - player.x;
    player.x += dx * 0.15;

    // Clamp within road
    player.x = Math.max(ROAD_LEFT + player.w / 2 + 5, Math.min(ROAD_RIGHT - player.w / 2 - 5, player.x));

    // Obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y += gameSpeed - o.speed;
      if (o.y > H + 100) {
        obstacles.splice(i, 1);
        continue;
      }
      if (boxCollide(player, o)) {
        if (shieldActive) {
          shieldActive = false;
          addParticles(o.x, o.y, "#00E5FF", 15);
          obstacles.splice(i, 1);
        } else {
          // Game over
          addParticles(player.x, player.y, "#FF5252", 30);
          state = STATE.GAMEOVER;
          // Save
          data._sessionCoins = data._sessionCoins || 0;
          data.coins += data._sessionCoins;
          if (score > data.highScore) data.highScore = score;
          saveData(data);
        }
      }
    }

    // Items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += gameSpeed;
      it.bobPhase += 0.08;
      if (it.y > H + 50) {
        items.splice(i, 1);
        continue;
      }
      if (boxCollide(player, it)) {
        if (it.type === "coin") {
          data._sessionCoins = (data._sessionCoins || 0) + 1;
          addParticles(it.x, it.y, "#FFD700", 8);
        } else if (it.type === "shield") {
          shieldActive = true;
          shieldTimer = 0;
          addParticles(it.x, it.y, "#00E5FF", 12);
        }
        items.splice(i, 1);
      }
    }

    // Shield timer (visual pulse)
    if (shieldActive) shieldTimer++;

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // --- Drawing helpers ---
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

  // --- Draw ---
  function drawBackground() {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1a1a2e");
    grad.addColorStop(0.4, "#16213e");
    grad.addColorStop(1, "#0f3460");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Sidewalk
    ctx.fillStyle = "#2C2C3E";
    ctx.fillRect(ROAD_LEFT - 15, 0, 15, H);
    ctx.fillRect(ROAD_RIGHT, 0, 15, H);

    // Road
    ctx.fillStyle = "#3A3A50";
    ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, H);

    // Road edge lines
    ctx.strokeStyle = "#FFF";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ROAD_LEFT + 3, 0);
    ctx.lineTo(ROAD_LEFT + 3, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ROAD_RIGHT - 3, 0);
    ctx.lineTo(ROAD_RIGHT - 3, H);
    ctx.stroke();

    // Lane dividers (dashed)
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    for (let i = 1; i < LANE_COUNT; i++) {
      const lx = ROAD_LEFT + LANE_WIDTH * i;
      for (let m of roadMarkings) {
        const my = m.y;
        ctx.beginPath();
        ctx.moveTo(lx, my);
        ctx.lineTo(lx, my + 30);
        ctx.stroke();
      }
    }

    // Scenery buildings (left/right)
    drawBuildings();
  }

  function drawBuildings() {
    const bw = ROAD_LEFT - 20;
    if (bw < 10) return;
    ctx.fillStyle = "#12122a";
    // left buildings
    for (let i = 0; i < 5; i++) {
      const bh = 60 + (i * 37) % 80;
      const by = i * (H / 5);
      ctx.fillRect(5, by, bw, bh);
      // windows
      ctx.fillStyle = "#FFD54F33";
      for (let wy = by + 8; wy < by + bh - 8; wy += 16) {
        for (let wx = 10; wx < bw - 5; wx += 14) {
          ctx.fillRect(wx, wy, 6, 8);
        }
      }
      ctx.fillStyle = "#12122a";
    }
    // right buildings
    const rx = ROAD_RIGHT + 20;
    for (let i = 0; i < 5; i++) {
      const bh = 50 + (i * 47) % 90;
      const by = i * (H / 5) + 20;
      ctx.fillRect(rx, by, bw, bh);
      ctx.fillStyle = "#FFD54F33";
      for (let wy = by + 8; wy < by + bh - 8; wy += 16) {
        for (let wx = rx + 5; wx < rx + bw - 5; wx += 14) {
          ctx.fillRect(wx, wy, 6, 8);
        }
      }
      ctx.fillStyle = "#12122a";
    }
  }

  function drawBike(x, y, w, h, skin) {
    const cx = x;
    const cy = y;
    const scale = w / 40;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Wheels
    const wheelR = 12;
    const wheelY_back = 22;
    const wheelY_front = -22;

    ctx.strokeStyle = skin.wheel;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, wheelY_back, wheelR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, wheelY_front, wheelR, 0, Math.PI * 2);
    ctx.stroke();

    // Wheel spokes
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#666";
    for (let i = 0; i < 4; i++) {
      const a = pedalAngle + (i * Math.PI) / 2;
      // back wheel
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * wheelR, wheelY_back + Math.sin(a) * wheelR);
      ctx.lineTo(-Math.cos(a) * wheelR, wheelY_back - Math.sin(a) * wheelR);
      ctx.stroke();
      // front wheel
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * wheelR, wheelY_front + Math.sin(a) * wheelR);
      ctx.lineTo(-Math.cos(a) * wheelR, wheelY_front - Math.sin(a) * wheelR);
      ctx.stroke();
    }

    // Tire fills
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(0, wheelY_back, wheelR - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, wheelY_front, wheelR - 2, 0, Math.PI * 2);
    ctx.fill();

    // Frame
    ctx.strokeStyle = skin.frame;
    ctx.lineWidth = 3.5;
    // Main triangle
    ctx.beginPath();
    ctx.moveTo(0, wheelY_back); // bottom
    ctx.lineTo(-4, 0); // seat
    ctx.lineTo(0, wheelY_front); // front
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, wheelY_back);
    ctx.stroke();

    // Handlebars
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, wheelY_front - 4);
    ctx.lineTo(8, wheelY_front - 4);
    ctx.stroke();

    // Seat
    ctx.fillStyle = "#333";
    drawRoundRect(-6, -3, 12, 5, 2);
    ctx.fill();

    // Rider body (simple)
    ctx.fillStyle = skin.body;
    // Torso
    drawRoundRect(-5, -18, 10, 16, 3);
    ctx.fill();
    // Head
    ctx.fillStyle = "#FFD4A6";
    ctx.beginPath();
    ctx.arc(0, -23, 6, 0, Math.PI * 2);
    ctx.fill();
    // Helmet
    ctx.fillStyle = skin.frame;
    ctx.beginPath();
    ctx.arc(0, -25, 6, Math.PI, Math.PI * 2);
    ctx.fill();

    // Pedaling legs
    const legAngle = pedalAngle;
    ctx.strokeStyle = "#2C2C2C";
    ctx.lineWidth = 2.5;
    // Left leg
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.lineTo(-2 + Math.cos(legAngle) * 8, 8 + Math.sin(legAngle) * 6);
    ctx.lineTo(Math.cos(legAngle) * 5, wheelY_back - 4 + Math.sin(legAngle) * 3);
    ctx.stroke();
    // Right leg
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(2 + Math.cos(legAngle + Math.PI) * 8, 8 + Math.sin(legAngle + Math.PI) * 6);
    ctx.lineTo(Math.cos(legAngle + Math.PI) * 5, wheelY_back - 4 + Math.sin(legAngle + Math.PI) * 3);
    ctx.stroke();

    ctx.restore();

    // Shield effect
    if (shieldActive) {
      ctx.save();
      const pulse = 0.8 + Math.sin(shieldTimer * 0.15) * 0.2;
      ctx.strokeStyle = `rgba(0, 229, 255, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00E5FF";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.8, h * 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCar(o) {
    const x = o.x - o.w / 2;
    const y = o.y - o.h / 2;
    const colors = ["#E53935", "#1E88E5", "#43A047", "#8E24AA", "#FB8C00"];
    const color = colors[Math.abs(Math.floor(o.x * 7 + o.y * 3)) % colors.length];

    ctx.fillStyle = color;
    drawRoundRect(x, y, o.w, o.h, 6);
    ctx.fill();

    // Windshield
    ctx.fillStyle = "rgba(150,220,255,0.6)";
    drawRoundRect(x + o.w * 0.15, y + o.h * 0.12, o.w * 0.7, o.h * 0.2, 3);
    ctx.fill();

    // Rear window
    ctx.fillStyle = "rgba(150,220,255,0.4)";
    drawRoundRect(x + o.w * 0.15, y + o.h * 0.68, o.w * 0.7, o.h * 0.15, 3);
    ctx.fill();

    // Headlights
    ctx.fillStyle = "#FFF9C4";
    ctx.beginPath();
    ctx.arc(x + 5, y + 4, 3, 0, Math.PI * 2);
    ctx.arc(x + o.w - 5, y + 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCone(o) {
    const cx = o.x;
    const cy = o.y;
    const s = o.w * 0.4;
    // Base
    ctx.fillStyle = "#FF6D00";
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s);
    ctx.lineTo(cx + s, cy + s);
    ctx.lineTo(cx, cy - s * 1.2);
    ctx.closePath();
    ctx.fill();
    // Stripes
    ctx.fillStyle = "#FFF";
    ctx.fillRect(cx - s * 0.35, cy - s * 0.1, s * 0.7, s * 0.3);
  }

  function drawBox(o) {
    const x = o.x - o.w / 2;
    const y = o.y - o.h / 2;
    ctx.fillStyle = "#8D6E63";
    ctx.fillRect(x, y, o.w, o.h);
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, o.w, o.h);
    // Cross tape
    ctx.strokeStyle = "#FFCC80";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + o.w, y + o.h);
    ctx.moveTo(x + o.w, y);
    ctx.lineTo(x, y + o.h);
    ctx.stroke();
  }

  function drawOil(o) {
    ctx.fillStyle = "rgba(30,30,30,0.7)";
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, o.w * 0.6, o.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,60,80,0.3)";
    ctx.beginPath();
    ctx.ellipse(o.x - 3, o.y - 2, o.w * 0.25, o.h * 0.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCoin(it) {
    const bob = Math.sin(it.bobPhase) * 3;
    ctx.save();
    ctx.translate(it.x, it.y + bob);
    // Glow
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner
    ctx.fillStyle = "#FFC107";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // Dollar sign
    ctx.fillStyle = "#FF8F00";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 1);
    ctx.restore();
  }

  function drawShieldItem(it) {
    const bob = Math.sin(it.bobPhase) * 3;
    ctx.save();
    ctx.translate(it.x, it.y + bob);
    ctx.shadowColor = "#00E5FF";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 2.5;
    // Shield shape
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, -6);
    ctx.lineTo(10, 4);
    ctx.quadraticCurveTo(0, 14, 0, 14);
    ctx.quadraticCurveTo(0, 14, -10, 4);
    ctx.lineTo(-10, -6);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(0,229,255,0.25)";
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    // Score
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px 'Segoe UI', Arial`;
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 15, 35);

    // Coins
    ctx.fillStyle = "#FFD700";
    ctx.fillText("Coins: " + (data._sessionCoins || 0), 15, 65);

    // Speed indicator
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `${Math.floor(W * 0.03)}px Arial`;
    ctx.textAlign = "right";
    ctx.fillText(Math.floor(gameSpeed * 10) + " km/h", W - 15, 35);

    // Shield indicator
    if (shieldActive) {
      ctx.fillStyle = "#00E5FF";
      ctx.font = `bold ${Math.floor(W * 0.035)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText("SHIELD ACTIVE", W / 2, 35);
    }
  }

  // --- Screens ---
  function drawMenu() {
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0f0c29");
    grad.addColorStop(0.5, "#302b63");
    grad.addColorStop(1, "#24243e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.save();
    ctx.shadowColor = "#00E5FF";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.1)}px 'Segoe UI', Arial`;
    ctx.textAlign = "center";
    ctx.fillText("RIDE", W / 2, H * 0.22);
    ctx.fillStyle = "#FF5252";
    ctx.fillText("or CRASH", W / 2, H * 0.32);
    ctx.restore();

    // Bike icon
    const menuSkin = getSkin(data.currentSkin);
    drawBike(W / 2, H * 0.46, LANE_WIDTH * 0.5, LANE_WIDTH * 0.8, menuSkin);

    // High score
    ctx.fillStyle = "#FFD54F";
    ctx.font = `bold ${Math.floor(W * 0.04)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("Best: " + data.highScore, W / 2, H * 0.58);

    // Coins
    ctx.fillStyle = "#FFD700";
    ctx.fillText("Coins: " + data.coins, W / 2, H * 0.63);

    // Play button
    const btnW = W * 0.55;
    const btnH = H * 0.07;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.7;
    ctx.fillStyle = "#00E676";
    drawRoundRect(btnX, btnY, btnW, btnH, 12);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("TAP TO PLAY", W / 2, btnY + btnH / 2 + 2);

    // Shop button
    const sbtnY = H * 0.82;
    ctx.fillStyle = "#7C4DFF";
    drawRoundRect(btnX, sbtnY, btnW, btnH, 12);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px Arial`;
    ctx.fillText("SHOP", W / 2, sbtnY + btnH / 2 + 2);

    // Store button positions for click detection
    menuButtons.play = { x: btnX, y: btnY, w: btnW, h: btnH };
    menuButtons.shop = { x: btnX, y: sbtnY, w: btnW, h: btnH };
  }

  const menuButtons = {};

  function drawGameOver() {
    // Dim overlay
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#FF5252";
    ctx.font = `bold ${Math.floor(W * 0.09)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("CRASH!", W / 2, H * 0.25);

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("Score: " + score, W / 2, H * 0.35);

    ctx.fillStyle = "#FFD54F";
    ctx.font = `${Math.floor(W * 0.04)}px Arial`;
    ctx.fillText("Best: " + data.highScore, W / 2, H * 0.42);

    ctx.fillStyle = "#FFD700";
    ctx.fillText("Coins: +" + (data._sessionCoins || 0), W / 2, H * 0.49);

    // Retry
    const btnW = W * 0.55;
    const btnH = H * 0.07;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.58;
    ctx.fillStyle = "#00E676";
    drawRoundRect(btnX, btnY, btnW, btnH, 12);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.05)}px Arial`;
    ctx.fillText("RETRY", W / 2, btnY + btnH / 2 + 2);

    // Menu
    const mbtnY = H * 0.7;
    ctx.fillStyle = "#546E7A";
    drawRoundRect(btnX, mbtnY, btnW, btnH, 12);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.045)}px Arial`;
    ctx.fillText("MENU", W / 2, mbtnY + btnH / 2 + 2);

    menuButtons.retry = { x: btnX, y: btnY, w: btnW, h: btnH };
    menuButtons.menu = { x: btnX, y: mbtnY, w: btnW, h: btnH };
  }

  // --- Shop ---
  let shopScroll = 0;

  function drawShop() {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.07)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("SHOP", W / 2, 50);

    ctx.fillStyle = "#FFD700";
    ctx.font = `${Math.floor(W * 0.04)}px Arial`;
    ctx.fillText("Coins: " + data.coins, W / 2, 85);

    // Back button
    const backW = 80;
    const backH = 36;
    ctx.fillStyle = "#546E7A";
    drawRoundRect(15, 15, backW, backH, 8);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = `bold ${Math.floor(W * 0.035)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("BACK", 55, 38);
    menuButtons.shopBack = { x: 15, y: 15, w: backW, h: backH };

    // Skin cards
    const cardW = W * 0.8;
    const cardH = 80;
    const startY = 110 - shopScroll;
    const gap = 10;

    menuButtons.skinCards = [];

    for (let i = 0; i < SKINS.length; i++) {
      const skin = SKINS[i];
      const cy = startY + i * (cardH + gap);
      if (cy + cardH < 90 || cy > H) continue;

      const owned = data.skins.includes(skin.id);
      const equipped = data.currentSkin === skin.id;

      // Card bg
      ctx.fillStyle = equipped ? "#1B5E20" : owned ? "#263238" : "#37474F";
      drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 10);
      ctx.fill();

      if (equipped) {
        ctx.strokeStyle = "#00E676";
        ctx.lineWidth = 2;
        drawRoundRect((W - cardW) / 2, cy, cardW, cardH, 10);
        ctx.stroke();
      }

      // Mini bike preview
      const previewSkin = skin;
      ctx.save();
      const px = (W - cardW) / 2 + 45;
      const py = cy + cardH / 2;
      drawBike(px, py, 22, 35, previewSkin);
      ctx.restore();

      // Name
      ctx.fillStyle = "#FFF";
      ctx.font = `bold ${Math.floor(W * 0.04)}px Arial`;
      ctx.textAlign = "left";
      ctx.fillText(skin.name, (W - cardW) / 2 + 80, cy + 32);

      // Status
      ctx.font = `${Math.floor(W * 0.033)}px Arial`;
      if (equipped) {
        ctx.fillStyle = "#00E676";
        ctx.fillText("EQUIPPED", (W - cardW) / 2 + 80, cy + 55);
      } else if (owned) {
        ctx.fillStyle = "#90CAF9";
        ctx.fillText("TAP TO EQUIP", (W - cardW) / 2 + 80, cy + 55);
      } else {
        ctx.fillStyle = "#FFD700";
        ctx.fillText(skin.price + " coins", (W - cardW) / 2 + 80, cy + 55);
      }

      menuButtons.skinCards.push({
        x: (W - cardW) / 2,
        y: cy,
        w: cardW,
        h: cardH,
        skinId: skin.id,
      });
    }
  }

  // --- Render ---
  function render() {
    ctx.clearRect(0, 0, W, H);

    if (state === STATE.MENU) {
      drawMenu();
    } else if (state === STATE.PLAYING) {
      drawBackground();
      // Draw items
      for (const it of items) {
        if (it.type === "coin") drawCoin(it);
        else drawShieldItem(it);
      }
      // Draw obstacles
      for (const o of obstacles) {
        if (o.type === "car") drawCar(o);
        else if (o.type === "cone") drawCone(o);
        else if (o.type === "box") drawBox(o);
        else if (o.type === "oil") drawOil(o);
      }
      // Player
      drawBike(player.x, player.y, player.w, player.h, player.skin);
      drawParticles();
      drawHUD();
    } else if (state === STATE.GAMEOVER) {
      drawBackground();
      for (const o of obstacles) {
        if (o.type === "car") drawCar(o);
        else if (o.type === "cone") drawCone(o);
        else if (o.type === "box") drawBox(o);
        else if (o.type === "oil") drawOil(o);
      }
      drawParticles();
      drawGameOver();
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
        data._sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      } else if (inBtn(pos, menuButtons.shop)) {
        shopScroll = 0;
        state = STATE.SHOP;
      }
    } else if (state === STATE.PLAYING) {
      touchStartX = pos.x;
      touchCurrentX = pos.x;
      isDragging = true;
    } else if (state === STATE.GAMEOVER) {
      if (inBtn(pos, menuButtons.retry)) {
        data._sessionCoins = 0;
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
      // Skin cards
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
      // Store touch for scrolling
      touchStartX = pos.x;
      touchCurrentX = pos.x;
      isDragging = true;
      shopTouchStartY = pos.y;
      shopLastY = pos.y;
    }
  }

  let shopTouchStartY = 0;
  let shopLastY = 0;

  function handleMove(e) {
    e.preventDefault();
    const pos = getPos(e);

    if (state === STATE.PLAYING && isDragging) {
      touchCurrentX = pos.x;
      const delta = touchCurrentX - touchStartX;
      playerTargetX = player.x + delta * 0.3;
      playerTargetX = Math.max(
        ROAD_LEFT + player.w / 2 + 5,
        Math.min(ROAD_RIGHT - player.w / 2 - 5, playerTargetX)
      );
      touchStartX = touchCurrentX;
    } else if (state === STATE.SHOP && isDragging) {
      const dy = shopLastY - pos.y;
      shopScroll += dy;
      shopScroll = Math.max(0, Math.min(shopScroll, SKINS.length * 90 - H + 150));
      shopLastY = pos.y;
    }
  }

  function handleEnd(e) {
    e.preventDefault();
    isDragging = false;
    touchStartX = null;
  }

  // Mouse support
  canvas.addEventListener("mousedown", handleStart);
  canvas.addEventListener("mousemove", handleMove);
  canvas.addEventListener("mouseup", handleEnd);

  // Touch support
  canvas.addEventListener("touchstart", handleStart, { passive: false });
  canvas.addEventListener("touchmove", handleMove, { passive: false });
  canvas.addEventListener("touchend", handleEnd, { passive: false });

  // Keyboard support
  document.addEventListener("keydown", (e) => {
    if (state === STATE.PLAYING) {
      if (e.key === "ArrowLeft" || e.key === "a") {
        playerTargetX -= LANE_WIDTH * 0.6;
        playerTargetX = Math.max(ROAD_LEFT + player.w / 2 + 5, playerTargetX);
      } else if (e.key === "ArrowRight" || e.key === "d") {
        playerTargetX += LANE_WIDTH * 0.6;
        playerTargetX = Math.min(ROAD_RIGHT - player.w / 2 - 5, playerTargetX);
      }
    } else if (state === STATE.MENU) {
      if (e.key === "Enter" || e.key === " ") {
        data._sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      }
    } else if (state === STATE.GAMEOVER) {
      if (e.key === "Enter" || e.key === " ") {
        data._sessionCoins = 0;
        initGame();
        state = STATE.PLAYING;
      } else if (e.key === "Escape") {
        state = STATE.MENU;
      }
    } else if (state === STATE.SHOP) {
      if (e.key === "Escape") {
        state = STATE.MENU;
      }
    }
  });

  // --- Start ---
  loop();
})();
