# 雑学クイズ

## プロジェクト概要
〇×形式の雑学クイズアプリ。Firebase Realtime Database で「みんなの回答率」をリアルタイム共有する。

## 技術構成
- 単一HTMLファイル（index.html）にHTML/CSS/JS をすべて記述
- Firebase Realtime Database（みんなの投票データ保存）
  - URL：https://trivia-quiz-otani-default-rtdb.firebaseio.com
- localStorage：通算スコアの保存

## データ構造
```js
quizData = [
  { id: 数字, q: "問題文", isTrue: true/false, cat: "カテゴリ", ex: "解説" }
]
```
- id は 0 始まりの連番（重複禁止）
- cat の種類：生き物 / 日本 / 人体 / 食べ物 / 歴史 / 科学

## デザインルール
- カラー：ピンク系グラデーション（#e94560 赤、#f5a623 オレンジ、#9b59b6 紫）
- 背景：ほぼ白（#fffdf9 → #fff5f0 → #fdf5ff のグラデーション）
- 〇ボタン：緑、×ボタン：赤

## 作業ルール
- 単一ファイル構成を維持する
- 問題を追加するときは quizData 配列の末尾に追加し、id を連番で振る
- 問題文は「。」で終わる断言形式で書く
- 正解が false（嘘）の問題も半数程度含める
- 日本語コメントを使う
