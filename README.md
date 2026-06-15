# synchroma

青春学園系パズルゲーム「シンクローマ（SYNCHROMA）」

> Synchro（同調）× Chroma（色彩）。光と色を“シンクロ”させて解く、放課後の青春パズル。

## 現在のフェーズ：ビジュアル作り込み

まずタイトル画面とキャラクター／UI演出から作り込んでいます。

### 動かす
ブラウザで `index.html` を開くだけ（ビルド不要）。

```bash
# 簡易サーバ例
python3 -m http.server 8000
# → http://localhost:8000
```

### 構成
```
index.html               タイトル画面
assets/css/style.css     夕暮れ背景・ロゴ・メニュー・クロマワイプ演出
assets/js/title.js       花びらアニメ／ボタン演出／画面遷移
assets/img/              キャラ仮立ち絵（SVGプレースホルダ）
docs/art-direction.md    アートディレクション・カラーパレット・タイポ
docs/character-design.md キャラクター設定書（漫画タッチの発注仕様）
```

> 漫画タッチの最終立ち絵は絵師／AI画像生成で用意し、`assets/img/` の仮ビジュアルと差し替えます。
> 詳細は [docs/art-direction.md](docs/art-direction.md) を参照。
