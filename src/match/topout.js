// トップアウト(盤面崩壊)の救済。即負けにせず「決壊しても立て直す」ための処理。
// core は無改変のまま、外側から盤面状態を整える(core の公開データ/関数のみ使用)。

import { GRID_W } from "../core/constants.js";
import { Color } from "../core/types.js";
import { makeBlock } from "../core/block.js";
import { idx } from "../core/board.js";
import { TOPOUT } from "./emotion.js";

// 上から rows 行を崩し落とし(空に)、その領域に食い込んだお邪魔スラブを取り除き、
// gameOver から復帰させる。立て直しの猶予として rise を少し止める。
export function purgeTop(engine, rows = TOPOUT.PURGE_ROWS) {
  const board = engine.board;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < GRID_W; x++) board.cells[idx(x, y)] = makeBlock(Color.NONE);
  }
  // 天井付近に残るお邪魔スラブは崩落に巻き込んで除去(救済)
  board.garbages = board.garbages.filter((g) => g.y >= rows);
  board.riseStopTimer = Math.max(board.riseStopTimer, TOPOUT.RELIEF_FRAMES);
  engine.gameOver = false;
  engine.danger = false;
}
