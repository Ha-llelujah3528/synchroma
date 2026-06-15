// 感情ゲージ ── シンクロの「勝敗レイヤー」。
//
// トーンは「相手を倒す」ではなく「気持ちが届くかどうか」。だから勝敗は
// Engine 内部スコア(HP的な殴り合い)ではなく、満たした側が勝つ感情ゲージで
// 決める。これは決定論コア(src/core)の外側、VsSession(対戦の器)が持つ状態。
//
// 連鎖は後段ほど大きく報われる ── 核の「落下の隙間に手で連鎖を仕込む腕」が
// そのまま勝敗に効くように。係数・制限時間はすべて仮で、ここ1か所に集約して
// 後から遊んで調整する(constants.js と同じ思想)。

import { Ev } from "../core/types.js";

// 仮のチューニング面。実際に遊んで調整する。
export const EMOTION = {
  GOAL: 100, // 先に到達した側の勝ち(＝想いが届いた)
  MATCH_PER_PANEL: 1.0, // 通常マッチ: Ev.MATCH.count × this
  COMBO_PER_EXTRA: 1.5, // コンボ(4個以上): (Ev.COMBO.count − 3) × this
  CHAIN_PER_LINK: 3.0, // 連鎖: Ev.CHAIN_LINK.chain × this (2連鎖=+6, 3連鎖=+9 …)
};

// 1戦の制限時間(フレーム)。FPS=60 なので 75秒。
export const TIME_LIMIT_FRAMES = 75 * 60;

// 打開スキルのチャージ(0〜MAX)。ハイブリッド: 主に連鎖・コンボ(腕)で溜まり、
// 加えてごく少量を毎フレーム自然回復する。後者は「完全に埋もれて一手も消せない
// 時の安全弁」── 純粋なクールタイム待ち(核§1の禁則)にはしない。
export const SKILL = {
  MAX: 100,
  PER_PANEL: 1.2, // Ev.MATCH.count × this
  PER_COMBO_EXTRA: 2.0, // (Ev.COMBO.count − 3) × this
  PER_CHAIN: 4.0, // Ev.CHAIN_LINK.chain × this
  IDLE_PER_FRAME: 0.06, // 自然回復(埋もれても ~28秒で満タンになる安全弁)
};

// トップアウト(盤面崩壊)は即負けにしない。「死なない・すれ違い」のトーンに
// 合わせ、崩壊＝決壊として上段が崩れ落ち(救済)、相手に想いが流れ込む(ペナルティ)
// 形にする。勝敗はあくまで感情ゲージ一本。
export const TOPOUT = {
  OPPONENT_EMOTION_BONUS: 22, // 圧倒された側 → 相手ゲージへ加算
  PURGE_ROWS: 3, // 決壊時に崩れ落ちる上段の行数(救済)
  RELIEF_FRAMES: 120, // 救済後の rise 停止(立て直しの猶予)
  LOCK_FRAMES: 90, // 連続ペナルティ防止
};

// この tick に Engine が出したイベント列から、感情ゲージの加算量を求める。
// engine.detectMatches は1回のクリアで Ev.MATCH を必ず1つ、4個以上消しなら
// Ev.COMBO、2連鎖以上なら Ev.CHAIN_LINK を加算的に emit する(engine.js 参照)。
export function emotionGainFromEvents(events) {
  let gain = 0;
  for (const ev of events) {
    switch (ev.type) {
      case Ev.MATCH:
        gain += ev.count * EMOTION.MATCH_PER_PANEL;
        break;
      case Ev.COMBO:
        gain += Math.max(0, ev.count - 3) * EMOTION.COMBO_PER_EXTRA;
        break;
      case Ev.CHAIN_LINK:
        gain += ev.chain * EMOTION.CHAIN_PER_LINK;
        break;
    }
  }
  return gain;
}

// この tick のイベント列から、打開スキルのチャージ加算量を求める。
export function skillGainFromEvents(events) {
  let gain = 0;
  for (const ev of events) {
    switch (ev.type) {
      case Ev.MATCH:
        gain += ev.count * SKILL.PER_PANEL;
        break;
      case Ev.COMBO:
        gain += Math.max(0, ev.count - 3) * SKILL.PER_COMBO_EXTRA;
        break;
      case Ev.CHAIN_LINK:
        gain += ev.chain * SKILL.PER_CHAIN;
        break;
    }
  }
  return gain;
}

// 決着判定(毎フレーム、この順で評価)。結果は常に P1 視点。
//   outcome: 'win' | 'lose' | 'draw'  (P1 から見た勝敗)
//   winner : 'p1' | 'p2' | null       (ストーリー分岐へ繋ぐフック)
//   reason : 'emotion' | 'time'
// まだ決着していなければ null を返す。
// 勝敗軸は感情ゲージ一本。トップアウトはここでは扱わない(死なせず、相手ゲージへの
// ペナルティ＋盤面救済として VsSession 側で処理する)。
export function resolveSync({ e1, e2, timeUp, goal = EMOTION.GOAL }) {
  // 1. 感情ゲージが GOAL 到達(＝想いが届いた)。即座に決着。
  const r1 = e1 >= goal;
  const r2 = e2 >= goal;
  if (r1 || r2) {
    if (r1 && r2) return decideByGauge(e1, e2, "emotion");
    return r1
      ? { outcome: "win", winner: "p1", reason: "emotion" }
      : { outcome: "lose", winner: "p2", reason: "emotion" };
  }
  // 2. 時間切れ → ゲージが高い方の勝ち。同点は引き分け(＝すれ違い)。
  if (timeUp) return decideByGauge(e1, e2, "time");
  return null;
}

function decideByGauge(e1, e2, reason) {
  if (e1 === e2) return { outcome: "draw", winner: null, reason };
  return e1 > e2
    ? { outcome: "win", winner: "p1", reason }
    : { outcome: "lose", winner: "p2", reason };
}
