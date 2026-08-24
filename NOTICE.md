# 第三者の著作物について

このリポジトリに含まれる第三者の著作物は、以下の 1 件だけです。

## Material Symbols（アイコン）

- 出所: https://github.com/google/material-design-icons
- 対象: `src/ui/icons.ts` に埋め込んでいる SVG のパスデータ（volume_up / volume_off / pause / play_arrow / refresh / home、Rounded スタイル）
- 権利者: Google
- ライセンス: Apache License 2.0
- 改変: SVG ファイルから `d` 属性の値のみを取り出し、TypeScript の定数として埋め込んでいます。図形自体は変更していません。

ウェブフォントとして CDN から読み込む形にしていないのは、このアプリが
CSP で `connect-src 'none'` を宣言していて、外部へ通信しに行く経路をそもそも持たないためです。

## それ以外

- ボムの絵、アイコン画像、UI、効果音・BGM はすべてこのリポジトリのコードが生成しています。
  絵は Canvas 2D の手続き的描画、音は Web Audio API の合成で、画像ファイルも音源ファイルも同梱していません。
- 文字は OS 標準のフォント（`system-ui`）を使っており、ウェブフォントは同梱・参照していません。
- ソースコードのライセンスは `LICENSE`（MIT）に従います。
