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

// 決着判定(毎フレーム、この順で評価)。結果は常に P1 視点。
//   outcome: 'win' | 'lose' | 'draw'  (P1 から見た勝敗)
//   winner : 'p1' | 'p2' | null       (ストーリー分岐へ繋ぐフック)
//   reason : 'topout' | 'emotion' | 'time'
// まだ決着していなければ null を返す。
export function resolveSync({ p1Over, p2Over, e1, e2, timeUp, goal = EMOTION.GOAL }) {
  // 1. トップアウト(盤面崩壊＝心の決壊)。まずは即負け扱い。
  if (p1Over || p2Over) {
    if (p1Over && p2Over) return { outcome: "draw", winner: null, reason: "topout" };
    const p1Wins = p2Over;
    return p1Wins
      ? { outcome: "win", winner: "p1", reason: "topout" }
      : { outcome: "lose", winner: "p2", reason: "topout" };
  }
  // 2. 感情ゲージが GOAL 到達(＝想いが届いた)。即座に決着。
  const r1 = e1 >= goal;
  const r2 = e2 >= goal;
  if (r1 || r2) {
    if (r1 && r2) return decideByGauge(e1, e2, "emotion");
    return r1
      ? { outcome: "win", winner: "p1", reason: "emotion" }
      : { outcome: "lose", winner: "p2", reason: "emotion" };
  }
  // 3. 時間切れ → ゲージが高い方の勝ち。同点は引き分け(＝すれ違い)。
  if (timeUp) return decideByGauge(e1, e2, "time");
  return null;
}

function decideByGauge(e1, e2, reason) {
  if (e1 === e2) return { outcome: "draw", winner: null, reason };
  return e1 > e2
    ? { outcome: "win", winner: "p1", reason }
    : { outcome: "lose", winner: "p2", reason };
}
