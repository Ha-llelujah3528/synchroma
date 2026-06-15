// session.js - A "session" wraps a running mode: it owns the engine(s) and
// renderer(s), advances them one 60Hz step at a time, and reports a result.
// The app loop just calls stepFrame()/render() and reads .finished/.result.

import { Engine } from "./core/engine.js";
import { Renderer } from "./render/renderer.js";
import { CpuPlayer } from "./ai/cpuPlayer.js";
import { queueGarbage } from "./core/garbage.js";
import { Ev } from "./core/types.js";
import {
  EMOTION,
  TIME_LIMIT_FRAMES,
  SKILL,
  TOPOUT,
  emotionGainFromEvents,
  skillGainFromEvents,
  resolveSync,
} from "./match/emotion.js";
import { CHARACTERS, activateSkill } from "./match/characters.js";
import { purgeTop } from "./match/topout.js";
import { drawEmotionGauge, drawSkillBar, drawSyncTimer } from "./match/syncHud.js";

const seed32 = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
const COUNTDOWN = 180; // 3s "READY" countdown before play begins
const OVER_HOLD = 90; // 1.5s to show the stone/defeat before the result screen

// Countdown / start-flash label shared by sessions ("3","2","1","START!").
function cdLabel(s) {
  if (s.countdown > 0) return String(Math.ceil(s.countdown / 60));
  if (s.goFlash > 0) return "START!";
  return null;
}

// Endless or Time-Attack (sprint to a target score).
export class SingleSession {
  constructor({ canvas, audio, input, mode, target = 0 }) {
    this.mode = mode;
    this.target = target;
    this.audio = audio;
    this.input = input;
    this.engine = new Engine(seed32(), { startRows: 6 });
    this.renderer = new Renderer(canvas, this.engine, {
      primary: true,
      showOverlays: false, // result is shown via the DOM result screen
      useTouchInset: true,
    });
    this.frames = 0;
    this.finished = false;
    this.result = null;
    this.countdown = COUNTDOWN;
    this.goFlash = 0;
    this.overHold = 0;
  }

  setPaused(p) {
    this.renderer.paused = p;
    this.audio.setPaused(p);
  }

  countdownLabel() {
    return cdLabel(this);
  }
  readyForResult() {
    return this.finished && this.overHold <= 0;
  }

  stepFrame(paused) {
    const cmds = this.input.drainFrameCommands();
    if (paused) return;
    if (this.countdown > 0) {
      this.countdown--;
      if (this.countdown === 0) this.goFlash = 30;
      return;
    }
    if (this.goFlash > 0) this.goFlash--;
    if (this.finished) {
      if (this.overHold > 0) this.overHold--;
      return;
    }
    this.engine.tick(cmds);
    this.renderer.consumeEvents(this.engine.events);
    this.audio.consumeEvents(this.engine.events);
    this.frames++;

    if (this.mode === "sprint" && !this.engine.gameOver && this.engine.score >= this.target) {
      this.finished = true;
      this.overHold = 30;
      this.result = { outcome: "clear", score: this.engine.score, frames: this.frames };
    } else if (this.engine.gameOver) {
      this.finished = true;
      this.overHold = OVER_HOLD;
      this.result = { outcome: "over", score: this.engine.score, frames: this.frames };
    }
  }

  render() {
    this.renderer.draw();
  }

  hudHtml() {
    if (this.mode === "sprint") {
      return `<span>TARGET <b>${this.target}</b></span><span>TIME <b>${fmtTime(this.frames)}</b></span>`;
    }
    return "";
  }
}

// Versus CPU with garbage exchange. P1 = human, P2 = CPU.
// Win/lose is decided by the 感情ゲージ (emotion layer, see match/emotion.js),
// not by HP — the tone is "気持ちが届くかどうか" rather than "倒す".
export class VsSession {
  constructor({ canvas, audio, input, cpuReaction = 7, onResolve = null }) {
    this.audio = audio;
    this.input = input;
    this.onResolve = onResolve; // story-branch hook, called once on decision
    const seed = seed32();
    this.p1 = new Engine(seed, { startRows: 6 });
    this.p2 = new Engine((seed ^ 0x9e3779b9) >>> 0, { startRows: 6 });
    this.cpu = new CpuPlayer(this.p2, { reaction: cpuReaction });
    const a = this._areas();
    this.rendP1 = new Renderer(canvas, this.p1, {
      primary: true, showOverlays: false, useTouchInset: true, label: "YOU", area: a.left,
    });
    this.rendP2 = new Renderer(canvas, this.p2, {
      primary: false, showOverlays: false, useTouchInset: true, label: "CPU", area: a.right,
    });
    this.frames = 0;
    this.finished = false;
    this.result = null;
    this.countdown = COUNTDOWN;
    this.goFlash = 0;
    this.overHold = 0;
    // emotion layer state (lives outside the deterministic engines)
    this.p1Char = CHARACTERS.toru; // human
    this.p2Char = CHARACTERS.rio; // CPU
    this.p1Emotion = 0;
    this.p2Emotion = 0;
    this.p1Skill = 0; // 打開スキルのチャージ
    this.p2Skill = 0;
    this.p1TopLock = 0; // トップアウト連続ペナルティ防止
    this.p2TopLock = 0;
    this.timeLeft = TIME_LIMIT_FRAMES;
    this._onResize = () => this._layout();
    window.addEventListener("resize", this._onResize);
  }

  countdownLabel() {
    return cdLabel(this);
  }
  readyForResult() {
    return this.finished && this.overHold <= 0;
  }

  _areas() {
    const W = window.innerWidth, H = window.innerHeight;
    return { left: { x: 0, y: 0, w: W / 2, h: H }, right: { x: W / 2, y: 0, w: W / 2, h: H } };
  }
  _layout() {
    const a = this._areas();
    this.rendP1.setArea(a.left);
    this.rendP2.setArea(a.right);
  }

  setPaused(p) {
    this.rendP1.paused = p;
    this.rendP2.paused = p;
    this.audio.setPaused(p);
  }

  stepFrame(paused) {
    const c1 = this.input.drainFrameCommands();
    if (paused) return;
    if (this.countdown > 0) {
      this.countdown--;
      if (this.countdown === 0) this.goFlash = 30;
      return;
    }
    if (this.goFlash > 0) this.goFlash--;
    if (this.finished) {
      if (this.overHold > 0) this.overHold--;
      return;
    }
    const skillPressed = this.input.takeSkill(); // 手動スキル(P1)
    const c2 = this.cpu.frame();
    this.p1.tick(c1);
    this.p2.tick(c2);
    // route outgoing garbage to the opponent
    this._route(this.p1, this.p2);
    this._route(this.p2, this.p1);
    // 感情ゲージ: 連鎖を後段ほど大きく積む(満たした側が勝つ勝敗レイヤー)
    this.p1Emotion = Math.min(EMOTION.GOAL, this.p1Emotion + emotionGainFromEvents(this.p1.events));
    this.p2Emotion = Math.min(EMOTION.GOAL, this.p2Emotion + emotionGainFromEvents(this.p2.events));
    // 打開スキル(ハイブリッド: 連鎖等 + 少量の自然回復)
    this.p1Skill = Math.min(SKILL.MAX, this.p1Skill + skillGainFromEvents(this.p1.events) + SKILL.IDLE_PER_FRAME);
    this.p2Skill = Math.min(SKILL.MAX, this.p2Skill + skillGainFromEvents(this.p2.events) + SKILL.IDLE_PER_FRAME);
    // プレイヤー(P1)は手動発動 ── 満タン時に SKILL を押した時だけ撃つ。
    // 不発(対象なし)ならチャージは満タンのまま保持され、押し直せる。
    if (skillPressed && this.p1Skill >= SKILL.MAX) {
      if (activateSkill(this.p1Char, { self: this.p1, opp: this.p2 })) this.p1Skill = 0;
    }
    // CPU(P2)は満タンで自動発動。
    if (this.p2Skill >= SKILL.MAX && activateSkill(this.p2Char, { self: this.p2, opp: this.p1 })) this.p2Skill = 0;

    this.rendP1.consumeEvents(this.p1.events);
    this.rendP2.consumeEvents(this.p2.events);
    this.audio.consumeEvents(this.p1.events); // only the human side drives SFX
    this.frames++;
    if (this.timeLeft > 0) this.timeLeft--;

    // トップアウトは即負けにしない: 相手ゲージへ加算 + 上段を崩して立て直す
    if (this.p1.gameOver && this.p1TopLock <= 0) this._handleTopout("p1");
    if (this.p2.gameOver && this.p2TopLock <= 0) this._handleTopout("p2");
    if (this.p1TopLock > 0) this.p1TopLock--;
    if (this.p2TopLock > 0) this.p2TopLock--;

    // 決着判定(毎フレーム / ゲージ100 → 時間切れ の順)
    const decision = resolveSync({
      e1: this.p1Emotion,
      e2: this.p2Emotion,
      timeUp: this.timeLeft <= 0,
    });
    if (decision) this._finish(decision);
  }

  _handleTopout(side) {
    if (side === "p1") {
      this.p2Emotion = Math.min(EMOTION.GOAL, this.p2Emotion + TOPOUT.OPPONENT_EMOTION_BONUS);
      purgeTop(this.p1);
      this.p1TopLock = TOPOUT.LOCK_FRAMES;
    } else {
      this.p1Emotion = Math.min(EMOTION.GOAL, this.p1Emotion + TOPOUT.OPPONENT_EMOTION_BONUS);
      purgeTop(this.p2);
      this.p2TopLock = TOPOUT.LOCK_FRAMES;
    }
  }

  _finish(decision) {
    this.finished = true;
    this.overHold = OVER_HOLD;
    this.result = {
      outcome: decision.outcome, // 'win' | 'lose' | 'draw' (P1 視点)
      winner: decision.winner, // 'p1' | 'p2' | null — ストーリー分岐フック
      reason: decision.reason, // 'topout' | 'emotion' | 'time'
      emotion: Math.round(this.p1Emotion),
      oppEmotion: Math.round(this.p2Emotion),
      score: this.p1.score,
      frames: this.frames,
    };
    if (this.onResolve) this.onResolve(this.result);
  }

  _route(from, to) {
    for (const ev of from.events) {
      if (ev.type === Ev.SEND_GARBAGE) queueGarbage(to, ev.w, ev.h);
    }
  }

  render() {
    this.rendP1.draw();
    this.rendP2.draw();
    // emotion layer overlay (drawn on top of both boards)
    drawEmotionGauge(this.rendP1, this.p1Emotion, "left", "♥");
    drawEmotionGauge(this.rendP2, this.p2Emotion, "right", "♥");
    drawSkillBar(this.rendP1, this.p1Skill, SKILL.MAX, "left", this.p1Char.skill.name);
    drawSkillBar(this.rendP2, this.p2Skill, SKILL.MAX, "right", this.p2Char.skill.name);
    drawSyncTimer(this.rendP1, this.timeLeft);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
  }

  hudHtml() {
    return `<span>VS CPU</span>`;
  }
}

// Attract-mode demo: a CPU plays itself behind the title/menu overlays.
export class DemoSession {
  constructor({ canvas }) {
    this.engine = new Engine(seed32(), { startRows: 7 });
    this.cpu = new CpuPlayer(this.engine, { reaction: 5 });
    this.renderer = new Renderer(canvas, this.engine, {
      primary: true, showOverlays: false, useTouchInset: false,
    });
  }
  stepFrame() {
    if (this.engine.gameOver) {
      // restart the demo on a fresh board
      this.engine = new Engine(seed32(), { startRows: 7 });
      this.cpu = new CpuPlayer(this.engine, { reaction: 5 });
      this.renderer.engine = this.engine;
      return;
    }
    const cmds = this.cpu.frame();
    this.engine.tick(cmds);
    this.renderer.consumeEvents(this.engine.events);
  }
  render() {
    this.renderer.draw();
  }
}

export function fmtTime(frames) {
  const totalMs = (frames / 60) * 1000;
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const cs = Math.floor((totalMs % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
