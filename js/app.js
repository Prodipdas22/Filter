/* PortalFX mobile browser app - Full Offline GitHub Pages Version */

const getBasePath = () => {
  let path = window.location.pathname;
  if (!path.endsWith('/') && !path.endsWith('.html')) {
    path += '/';
  } else if (path.endsWith('.html')) {
    path = path.substring(0, path.lastIndexOf('/') + 1);
  }
  return window.location.origin + path;
};
const BASE_URL = getBasePath();

const $ = (s) => document.querySelector(s);
const video = $("#video"), canvas = $("#output"), ctx = canvas.getContext("2d");
const stage = $("#stage"), statusEl = $("#status"), handState = $("#handState"), hint = $("#hint");
const permission = $("#permission"), startBtn = $("#startBtn"), captureBtn = $("#captureBtn");
const cameraSwitch = $("#cameraSwitch"), prevBtn = $("#prevBtn"), nextBtn = $("#nextBtn"), filterName = $("#filterName"), filtersEl = $("#filters");

const FILTERS = [
  ["Original", original], ["Grid", grid], ["Duotone", duotone], ["Halftone", halftone],
  ["RGB Shift", rgbShift], ["Thermal", thermal], ["Sepia", sepia], ["Frosted", frosted], ["Pink Halftone", pinkHalftone]
];

let landmarker = null, stream = null, running = false, loading = false, facingMode = "user";
let filterIndex = 0, lastVideoTime = -1, lastSwitch = 0, closeLatch = false;

FILTERS.forEach((f, i) => {
  const b = document.createElement("button");
  b.className = "filter-chip" + (i === 0 ? " active" : "");
  b.textContent = f[0];
  b.addEventListener("click", () => setFilter(i));
  filtersEl.appendChild(b);
});

function setFilter(i) {
  filterIndex = (i + FILTERS.length) % FILTERS.length;
  filterName.textContent = FILTERS[filterIndex][0];
  [...filtersEl.children].forEach((b, n) => b.classList.toggle("active", n === filterIndex));
}

prevBtn.onclick = () => setFilter(filterIndex - 1);
nextBtn.onclick = () => setFilter(filterIndex + 1);

function setStatus(text) { statusEl.textContent = text; console.log("[PortalFX]", text) }

async function loadMediaPipe() {
// 1. Declare the module variables at the top level
let FilesetResolver, HandLandmarker;

async function loadMediaPipe() {
  if (FilesetResolver && HandLandmarker) return;

  const src = BASE_URL + "js/vision_bundle.js"; 
  
  try {
    // 2. Use dynamic import to read the local ES Module
    const mod = await import(src);
    FilesetResolver = mod.FilesetResolver;
    HandLandmarker = mod.HandLandmarker;
    console.log(`[PortalFX] Loaded MediaPipe locally via ES Module`);
  } catch (e) {
    throw new Error(`Failed to import module from ${src}. ${e.message}`);
  }
}

async function createTracker() {
  if (landmarker) return;
  
  setStatus("Loading hand tracker engine…");
  await loadMediaPipe();

  setStatus("Loading AI model…");
  
  // 3. Use the imported variables instead of window.FilesetResolver
  const vision = await FilesetResolver.forVisionTasks(BASE_URL + "js/wasm");
  
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: BASE_URL + "models/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: .5,
    minHandPresenceConfidence: .5,
    minTrackingConfidence: .5
  });
}


async function startCamera() {
  if (loading) return;
  loading = true;
  startBtn.disabled = true;
  setStatus("Starting camera…");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable. Open this site using HTTPS in Chrome.");
    }
    if (!window.isSecureContext && location.hostname !== "localhost") {
      throw new Error("Camera requires HTTPS.");
    }

    if (stream) stream.getTracks().forEach(t => t.stop());

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });

    video.srcObject = stream;
    await video.play();

    permission.style.display = "none";
    resize();
    running = true;
    setStatus("Camera live • loading hand tracking…");

    createTracker().then(() => {
      setStatus("Live • show both hands");
    }).catch(err => {
      console.error(err);
      setStatus("Camera live • hand tracker failed");
      handState.textContent = "Tracker unavailable";
      hint.innerHTML = `<strong style="color:#ff6b6b">Tracker Error:</strong><span style="font-size: 0.9em; word-break: break-all;">${err.message || err}</span>`;
    });

    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    running = false;
    permission.style.display = "grid";
    setStatus("Could not start camera");
    document.querySelector(".permission-card p").textContent = err.message || "Camera permission denied.";
  } finally {
    loading = false;
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", startCamera);

cameraSwitch.addEventListener("click", async () => {
  if (!stream) return;
  facingMode = facingMode === "user" ? "environment" : "user";
  try {
    const old = stream;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    old.getTracks().forEach(t => t.stop());
    video.srcObject = stream;
    await video.play();
    setStatus("Camera switched");
  } catch (e) {
    console.error(e); setStatus("Could not switch camera");
  }
});

function resize() {
  const r = stage.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * d));
  canvas.height = Math.max(1, Math.round(r.height * d));
  canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener("resize", resize);

function loop() {
  if (!running) return;
  if (video.readyState >= 2) {
    const w = stage.clientWidth, h = stage.clientHeight;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width / video.videoWidth, sy = canvas.height / video.videoHeight;
    const scale = Math.max(sx, sy), dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    const dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.restore();

    if (landmarker && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const result = landmarker.detectForVideo(video, performance.now());
        renderPortal(result, w, h);
      } catch (e) { console.warn("tracking frame:", e) }
    }
  }
  requestAnimationFrame(loop);
}

function renderPortal(result, w, h) {
  const hands = result.landmarks || [];
  handState.textContent = hands.length === 2 ? "Portal ready" : `${hands.length}/2 hands`;
  hint.style.opacity = hands.length === 2 ? ".15" : "1";
  if (hands.length < 2) return;

  const P = hands.map(hand => ({ i: pt(hand[8], w, h), t: pt(hand[4], w, h) }));
  const p1 = P[0].i, p2 = P[0].t, p3 = P[1].i, p4 = P[1].t;
  const c1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const c2 = { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 };
  const gap = dist(c1, c2), threshold = Math.max(75, w * .18);

  if (gap < threshold) {
    if (!closeLatch && performance.now() - lastSwitch > 800) {
      setFilter(filterIndex + 1); lastSwitch = performance.now();
    }
    closeLatch = true;
  } else if (gap > threshold * 1.35) closeLatch = false;

  drawPortal(p1, p2, p3, p4, w, h);
}

function drawPortal(p1, p2, p3, p4, w, h) {
  const minX = Math.max(0, Math.floor(Math.min(p1.x, p2.x, p3.x, p4.x) - 20));
  const maxX = Math.min(w, Math.ceil(Math.max(p1.x, p2.x, p3.x, p4.x) + 20));
  const minY = Math.max(0, Math.floor(Math.min(p1.y, p2.y, p3.y, p4.y) - 20));
  const maxY = Math.min(h, Math.ceil(Math.max(p1.y, p2.y, p3.y, p4.y) + 20));
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const image = ctx.getImageData(minX, minY, bw, bh);
  FILTERS[filterIndex][1](image, bw, bh);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.lineTo(p2.x, p2.y);
  ctx.closePath(); ctx.clip();
  ctx.putImageData(image, minX, minY);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.lineTo(p2.x, p2.y);
  ctx.closePath(); ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2;
  ctx.shadowBlur = 18; ctx.shadowColor = "rgba(255,255,255,.75)"; ctx.stroke();
  [p1, p2, p3, p4].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill() });
  ctx.restore();
}

function pt(p, w, h) { return { x: p.x * w, y: p.y * h } }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) }

function original(img) { }
function grid(img, w, h) {
  const d = img.data, step = 22;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    for (let k = 0; k < Math.min(w - x, step); k++) setPix(d, x + k + y * w, [235, 235, 235, 255], .28);
    for (let k = 0; k < Math.min(h - y, step); k++) setPix(d, x + (y + k) * w, [235, 235, 235, 255], .28);
  }
}
function duotone(img) { const d = img.data; for (let i = 0; i < d.length; i += 4) { const g = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; const c = g < 60 ? [15, 8, 10] : g < 130 ? [118, 30, 214] : g < 195 ? [35, 140, 235] : [235, 240, 240]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2] } }
function halftone(img, w, h) { dots(img, w, h, [15, 15, 15, 255], [245, 245, 245, 255], 6, 1.4) }
function pinkHalftone(img, w, h) { dots(img, w, h, [55, 20, 130, 255], [215, 190, 245, 255], 5, 1.3) }
function dots(img, w, h, dot, bg, cell, factor) { const d = img.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, g = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], cx = x % cell - cell / 2, cy = y % cell - cell / 2, r = (1 - g / 255) * (cell / factor), c = cx * cx + cy * cy < r * r ? dot : bg; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255 } }
function rgbShift(img, w, h) { const src = new Uint8ClampedArray(img.data), d = img.data, sh = 6; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, xr = Math.min(w - 1, x + sh), xb = Math.max(0, x - sh); d[i] = src[(y * w + xr) * 4]; d[i + 1] = src[i + 1]; d[i + 2] = src[(y * w + xb) * 4 + 2]; if (y % 3 === 0) { d[i] *= .72; d[i + 1] *= .72; d[i + 2] *= .72 } } }
function thermal(img) { const d = img.data; for (let i = 0; i < d.length; i += 4) { const g = (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) / 255, c = thermalColor(g); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2] } }
function thermalColor(t) { const s = [[0, 0, 0, 80], [.25, 0, 180, 255], [.5, 0, 255, 80], [.75, 255, 255, 0], [1, 255, 0, 0]]; for (let i = 1; i < s.length; i++) if (t <= s[i][0]) { const a = s[i - 1], b = s[i], q = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q, a[3] + (b[3] - a[3]) * q] } return [255, 0, 0] }
function sepia(img, w, h) { const d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = Math.min(255, .393 * r + .769 * g + .189 * b); d[i + 1] = Math.min(255, .349 * r + .686 * g + .168 * b); d[i + 2] = Math.min(255, .272 * r + .534 * g + .131 * b) } }
function frosted(img, w, h) { const d = img.data, src = new Uint8ClampedArray(d), r = 4; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let R = 0, G = 0, B = 0, n = 0; for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy += 2) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx += 2) { const i = (yy * w + xx) * 4; R += src[i]; G += src[i + 1]; B += src[i + 2]; n++ } const i = (y * w + x) * 4; d[i] = R / n * .55 + 255 * .45; d[i + 1] = G / n * .55 + 255 * .45; d[i + 2] = B / n * .55 + 255 * .45 } }
function setPix(d, index, c, a) { const i = index * 4; d[i] = d[i] * (1 - a) + c[0] * a; d[i + 1] = d[i + 1] * (1 - a) + c[1] * a; d[i + 2] = d[i + 2] * (1 - a) + c[2] * a; d[i + 3] = 255 }

captureBtn.onclick = () => {
  if (!running) return;
  const a = document.createElement("a"); a.download = `portal-fx-${Date.now()}.png`; a.href = canvas.toDataURL("image/png"); a.click();
};

resize();
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
  if (statusEl) statusEl.textContent = "App error — reload page";
});
window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  if (statusEl) statusEl.textContent = "Loading error — check console";
});
   
