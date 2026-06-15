// キャラ定義フォーマット(レイヤー2の種) ── 「能力＝心の癖」。
//
// 各キャラは打開スキルを1つ持つ。スキル効果は match 層の関数で、core の公開
// データ/関数だけを使って盤面に作用する(src/core は無改変)。効果はキャラごとに
// 差し替えられる ── これが「相手を理解すること＝攻略」の土台になる。
//
// 効果関数は ctx = { self, opp } を受け取る(どちらも Engine)。発動できた時 true、
// 不発(対象なし)の時 false を返す。false の間チャージは満タンのまま保持され、
// 条件が整い次第その場で発動する(例: 貫くお邪魔がまだ盤面に無い)。

import { GRID_W, GARBAGE_FLASH } from "../core/constants.js";
import { GState } from "../core/types.js";
import { queueGarbage } from "../core/garbage.js";

// 透の原型「貫き」── 自盤面の一番下のお邪魔(ためらいの壁)を1スラブだけ貫いて
// 通常パネルへ変換する。core 本来のトリガー(FLASHING + 大 strength)を再利用する
// ので、見た目・挙動は自然な消し返しと同じ。全消しはしない＝打開のきっかけだけ
// 作り、そこから連鎖で点にするのは自分の腕(核§1「便利すぎ」を避ける)。
function pierce(ctx) {
  const slabs = ctx.self.board.garbages.filter((g) => g.state === GState.IDLE);
  if (slabs.length === 0) return false;
  slabs.sort((a, b) => b.y + b.h - (a.y + a.h)); // 一番下のスラブ
  const target = slabs[0];
  target.state = GState.FLASHING;
  target.timer = GARBAGE_FLASH;
  target.strength = 99; // スラブ全段を変換(core 側で g.h に丸められる)
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
