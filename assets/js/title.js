/* シンクローマ — タイトル画面の演出 */
(() => {
  "use strict";

  const CHROMA = ["#ff5d8f", "#43d6c4", "#ffd94a"];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ===== 舞う花びら（Canvas） ===== */
  const canvas = document.getElementById("petals");
  const ctx = canvas.getContext("2d");
  let petals = [];
  let raf = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function makePetal() {
    return {
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      r: 6 + Math.random() * 8,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.01 + Math.random() * 0.02,
      vy: 0.4 + Math.random() * 0.9,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.04,
      hue: Math.random() < 0.5 ? "#ffc2d4" : "#ffd9e2",
    };
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.hue;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    // 桜の花びら（くびれた楕円）
    ctx.moveTo(0, -p.r);
    ctx.bezierCurveTo(p.r, -p.r, p.r, p.r, 0, p.r);
    ctx.bezierCurveTo(-p.r, p.r, -p.r, -p.r, 0, -p.r);
    ctx.fill();
    ctx.restore();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of petals) {
      p.sway += p.swaySpeed;
      p.x += Math.sin(p.sway) * 0.8;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > canvas.height + 30) Object.assign(p, makePetal(), { y: -20 });
      drawPetal(p);
    }
    raf = requestAnimationFrame(tick);
  }

  function initPetals() {
    resize();
    const count = Math.min(46, Math.floor(window.innerWidth / 28));
    petals = Array.from({ length: count }, makePetal);
    if (!reduceMotion) tick();
    else petals.forEach(drawPetal);
  }

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) { ctx.clearRect(0,0,canvas.width,canvas.height); petals.forEach(drawPetal); }
  });
  initPetals();

  /* ===== ボタン押下：クロマ三色が弾ける ===== */
  function burst(x, y) {
    if (reduceMotion) return;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span");
      s.className = "spark";
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.background = CHROMA[i % CHROMA.length];
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 70;
      s.style.setProperty("--dx", Math.cos(a) * d + "px");
      s.style.setProperty("--dy", Math.sin(a) * d + "px");
      document.body.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }

  /* ===== クロマワイプ遷移 ===== */
  const wipe = document.getElementById("chromaWipe");
  function chromaTransition(after) {
    if (reduceMotion) { after && after(); return; }
    wipe.classList.remove("active");
    void wipe.offsetWidth; // reflow
    wipe.classList.add("active");
    setTimeout(() => after && after(), 420);
    setTimeout(() => wipe.classList.remove("active"), 760);
  }

  /* ===== メニュー操作 ===== */
  const actions = {
    start() {
      console.log("[SYNCHROMA] ゲーム開始へ（パズル盤面は次フェーズで実装）");
      // TODO: chromaTransition の後にゲーム画面をマウント
    },
    continue() { console.log("[SYNCHROMA] セーブデータ読み込み（未実装）"); },
    settings() { console.log("[SYNCHROMA] 設定画面（未実装）"); },
  };

  document.getElementById("menu").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    burst(e.clientX || rect.left + rect.width / 2, e.clientY || rect.top + rect.height / 2);
    const action = btn.dataset.action;
    chromaTransition(() => actions[action] && actions[action]());
  });
})();
