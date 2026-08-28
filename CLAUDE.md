# 和菓子店 予約承り表タブレットアプリ

仕様の正本＝リポジトリ外の仕様書（uketamawari_spec.md v1）。ここは実装で確定した決定事項の引き継ぎ。

## 概要
- 店頭タブレット（**iPad・Safari**。仕様書のAndroid/Mopriaから変更）で予約入力→A4承り表を印刷
- サーバなし・素のHTML/JS/CSS・IndexedDB保存。ビルド工程なし、index.htmlを開くだけ
- 公開: https://fumisato407-crypto.github.io/uketamawari/ （GitHub Pages・mainにpushで自動反映）
- push手段: ポータブルgh（%LOCALAPPDATA%\gh-portable\bin\gh.exe）で認証済み。通常のgit pushが通る

## 確定した運用・設計判断
- **操作分担**: 商品選び＝店主、お客様情報画面だけタブレットをお客に渡す。
  その画面の間は上部メニュー（予約一覧・設定）を非表示＝body.customer-mode（他客の個人情報保護）
- **印刷レイアウト**: A4横1枚に同じ承り表を左右2面（各A5相当・中央に切り取り線）。
  各面: 明細は常に10行（手書き用空行）・右側に菓子・包材の大枠（御来店日時の高さ〜紙面下端近く）・
  左列に御来店日時/配送/熨斗/表書き/備考。店の指示による配置なので勝手に変えない
- 価格null商品＝単価テンキー手入力。商品×入数=1SKU。注文時点の名前/価格をコピー保存
- iPad注意: Safariは未使用7日でサイトデータを消すことがある→運用は「ホーム画面に追加」必須＋JSONバックアップ

## 検証のやり方（Streamlit等は無関係。ヘッドレスChromeで目視相当まで可能）
- 構文: `node --check js/app.js`
- 画面: `chrome --headless=new --screenshot=... --window-size=1280,900 --virtual-time-budget=3000 "file:///C:/Users/fumi/Documents/uketamawari/index.html?demo=1"`
  （ヘッドレスは幅500px未満に縮まらない。スマホ幅の検証は500pxで行い実機で最終確認）
- 印刷: `--print-to-pdf=... --no-pdf-header-footer` でPDFを出して紙面確認（これが実印刷イメージ）
- IndexedDB系: `--timeout=5000`（実時間待ち。virtual-timeはIDB完了前に撮影されるので不可）
- URLパラメータ: `?demo=1`=ダミーデータ投入 / `&screen=screen-xxx`=画面直行 /
  `&tap=ボタンID`=自動タップ / `&selftest=1`=デモ予約を保存→一覧表示
- ボタンを追加したら必ず ?tap= で実際にタップ経路を確認（data-goto付け忘れ事故の再発防止）

## 進捗（実装順1-7）
- 済: 1骨組み / 2受注入力 / 3顧客フォーム / 4印刷レイアウト＋2面化 / 5保存・予約一覧・再印刷
- 残: **6 商品マスタ編集画面**（カテゴリ・商品・価格・写真・担当者の登録、IndexedDBを正にする）
- 残: **7 JSONエクスポート/インポート＋PWA manifest**
- 残: 実機印刷テスト（iPad→AirPrint→Canon TS3730）。紙の承り表の現物写真をもらって最終調整
