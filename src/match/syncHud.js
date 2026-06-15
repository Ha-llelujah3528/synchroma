// 感情ゲージのバーと残り時間の描画。決定論コアの外側(VsSession)が持つ
// 勝敗レイヤーの状態を、各 Renderer が確定した盤面ジオメトリ(originX/Y,
// boardW/H, cell, ctx, dpr)の上に重ねて描く。ここはあくまで見た目だけで、
// 加算ロジックや決着判定は持たない(emotion.js が持つ)。

import { EMOTION, TIME_LIMIT_FRAMES } from "./emotion.js";

const PINK = { lit: "#ff5c8a", soft: "#ffd0e0" };

// 盤面の外側の縁に沿った縦ゲージ。下から上へ GOAL に向かって満ちる。
// side は盤面が接している画面の端('left' なら左端側に描く)。
export function drawEmotionGauge(rend, value, side, label) {
  const ctx = rend.ctx;
  const goal = EMOTION.GOAL;
  const frac = Math.max(0, Math.min(1, value / goal));
  const area = rend.area || { x: 0, w: rend.W };

  const barW = Math.max(12, Math.round(rend.cell * 0.5));
  const pad = 12;
  const top = rend.originY;
  const h = rend.boardH;
  let x;
  if (side === "left") x = Math.max(area.x + 4, rend.originX - pad - barW);
  else x = Math.min(area.x + area.w - barW - 4, rend.originX + rend.boardW + pad);

  ctx.save();
  ctx.scale(rend.dpr, rend.dpr);

  // track
  ctx.fillStyle = "rgba(8,16,36,0.72)";
  rend.roundRect(ctx, x, top, barW, h, 6);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(150,190,255,0.35)";
  rend.roundRect(ctx, x + 0.5, top + 0.5, barW - 1, h - 1, 6);
  ctx.stroke();

  // fill (bottom-up). glows brighter as it nears the goal — 本心に届く直前。
  const fillH = Math.round(h * frac);
  if (fillH > 1) {
    const fy = top + h - fillH;
    const near = frac > 0.82;
    const pulse = near ? 0.6 + 0.4 * Math.abs(Math.sin(rend.engine.frame * 0.25)) : 1;
    ctx.save();
    ctx.shadowColor = PINK.lit;
    ctx.shadowBlur = (8 + 18 * frac) * pulse;
    const grad = ctx.createLinearGradient(x, fy, x, top + h);
    grad.addColorStop(0, near ? "#ffffff" : PINK.soft);
    grad.addColorStop(1, PINK.lit);
    ctx.fillStyle = grad;
    rend.roundRect(ctx, x + 2, fy, barW - 4, fillH - 2, 4);
    ctx.fill();
    ctx.restore();
  }

  // numeric value above the bar
  ctx.fillStyle = frac > 0.82 ? "#fff" : PINK.soft;
  ctx.font = "bold 13px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(String(Math.round(value)), x + barW / 2, top - 3);

  // tiny label under the bar (e.g. heart marker)
  ctx.globalAlpha = 0.8;
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(label || "♥", x + barW / 2, top + h + 4);

  ctx.restore();
}

// 打開スキルのチャージバー。感情ゲージの内側に寄り添う細い縦バー(下から満ちる)。
// 満タンで点滅し「打開できる」ことを示す(発動は自動)。色は心の青系でゲージ(桃)と
// 役割を分ける。label はスキル名(満タン時に短く表示)。
export function drawSkillBar(rend, value, max, side, label) {
  const ctx = rend.ctx;
  const frac = Math.max(0, Math.min(1, value / max));
  const ready = frac >= 1;
  const area = rend.area || { x: 0, w: rend.W };

  const emoW = Math.max(12, Math.round(rend.cell * 0.5)); // 感情ゲージ幅(同式)
  const skillW = Math.max(5, Math.round(rend.cell * 0.2));
  const pad = 12;
  const top = rend.originY;
  const h = rend.boardH;
  let emoX;
  if (side === "left") emoX = Math.max(area.x + 4, rend.originX - pad - emoW);
  else emoX = Math.min(area.x + area.w - emoW - 4, rend.originX + rend.boardW + pad);
  const x = side === "left" ? emoX + emoW + 2 : emoX - skillW - 2;

  ctx.save();
  ctx.scale(rend.dpr, rend.dpr);

  ctx.fillStyle = "rgba(8,16,36,0.72)";
  rend.roundRect(ctx, x, top, skillW, h, 4);
  ctx.fill();

  const fillH = Math.round(h * frac);
  if (fillH > 1) {
    const fy = top + h - fillH;
    const blink = ready && (rend.engine.frame >> 3) % 2 === 0;
    ctx.save();
    ctx.shadowColor = "#5fd0ff";
    ctx.shadowBlur = ready ? (blink ? 16 : 6) : 4;
    ctx.fillStyle = ready ? (blink ? "#ffffff" : "#7fe0ff") : "rgba(110,200,255,0.85)";
    rend.roundRect(ctx, x + 1, fy, skillW - 2, fillH - 1, 3);
    ctx.fill();
    ctx.restore();
  }

  if (ready) {
    ctx.fillStyle = "#bdefff";
    ctx.font = "bold 10px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label || "SKILL", x + skillW / 2, top + h + 18);
  }

  ctx.restore();
}

// 残り時間を画面上部中央に MM:SS で表示(1戦に1つ、両盤面で共有)。
export function drawSyncTimer(rend, timeLeftFrames) {
  const ctx = rend.ctx;
  const secs = Math.max(0, Math.ceil(timeLeftFrames / 60));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const text = `${m}:${String(s).padStart(2, "0")}`;
  const low = timeLeftFrames <= 10 * 60; // 残り10秒で警告色＋点滅
  const blink = low && (rend.engine.frame >> 3) % 2 === 0;

  ctx.save();
  ctx.scale(rend.dpr, rend.dpr);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "rgba(190,210,255,0.7)";
  ctx.fillText("TIME", rend.W / 2, 8);
  ctx.font = "bold 30px ui-monospace, Menlo, monospace";
  ctx.fillStyle = low ? (blink ? "#fff" : "#ff5c6e") : "#e3ecff";
  ctx.shadowColor = low ? "#ff3b5c" : "rgba(150,190,255,0.6)";
  ctx.shadowBlur = low ? 16 : 8;
  ctx.fillText(text, rend.W / 2, 20);
  ctx.restore();
}

// progress fraction (使うかもしれない補助)
export function timeFrac(timeLeftFrames) {
  return Math.max(0, Math.min(1, timeLeftFrames / TIME_LIMIT_FRAMES));
}
