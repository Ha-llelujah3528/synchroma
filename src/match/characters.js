// キャラ定義フォーマット(レイヤー2の種) ── 「能力＝心の癖」。
//
// 各キャラは打開スキルを1つ持つ。スキル効果は match 層の関数で、core の公開
// データ/関数だけを使って盤面に作用する(src/core は無改変)。効果はキャラごとに
// 差し替えられる ── これが「相手を理解すること＝攻略」の土台になる。
//
// 効果関数は ctx = { self, opp } を受け取る(どちらも Engine)。発動できた時 true、
// 不発(対象なし)の時 false を返す。false の間チャージは満タンのまま保持され、
// 条件が整い次第その場で発動する(例: 貫くお邪魔がまだ盤面に無い)。

import { GRID_W } from "../core/constants.js";
import { GState } from "../core/types.js";
import { queueGarbage } from "../core/garbage.js";

// 透の原型「貫き」── 自盤面の一番下のお邪魔(ためらいの壁)を1スラブだけ貫いて
// 消す。壁が消えると上に積もったパネルが落ちて掘り起こされる ── 埋もれを打開する
// ための"消し"。全消しはしない(下の1スラブだけ)＝1チャージぶんの救済。発動して
// 連鎖に繋ぐタイミングは自分で計る(核§1「便利すぎ／待たせる」を避ける)。
function pierce(ctx) {
  const garbages = ctx.self.board.garbages;
  let target = null;
  for (const g of garbages) {
    if (g.state !== GState.IDLE) continue; // 落下中・変換中のものは対象外
    if (!target || g.y + g.h > target.y + target.h) target = g; // 一番下のスラブ
  }
  if (!target) return false;
  garbages.splice(garbages.indexOf(target), 1); // 壁ごと消す → 上が落ちる
  return true;
}

// 莉央の原型「きらめき」── 相手盤面に きらめきのお邪魔を一段送る攻めの心の癖。
function glitter(ctx) {
  queueGarbage(ctx.opp, GRID_W, 2);
  return true;
}

export const SKILL_EFFECTS = { pierce, glitter };

// 暫定のキャラ。今は YOU / CPU の見た目だが、スキルは既に別物(効果がキャラ別で
// 変わることの実証)。レイヤー2で透・莉央として心象風景・物語まで肉付けする。
export const CHARACTERS = {
  toru: { id: "toru", name: "YOU", skill: { name: "貫き", effect: "pierce" } },
  rio: { id: "rio", name: "CPU", skill: { name: "きらめき", effect: "glitter" } },
};

export function activateSkill(character, ctx) {
  const fn = SKILL_EFFECTS[character.skill.effect];
  return fn ? fn(ctx) : false;
}
