# 進度紀錄（供新 session 接手）

最後更新：2026-11-11

## 已完成

- **需求審查與共識**：日期 1/29–2/6 不動，春節列為一級風險；Tabin 報價依信件內容正規化；只收哺乳類，另有自訂 iNat 查詢；手寫 CSS，不用 Tailwind；push 與寄信由使用者自己做。
- **研究**：`docs/research-data.json`、`docs/research.md`，查核日 2026-11-10。
- **`index.html`**：7 個模組、7 個內建資料集；GAS、iNaturalist、匯出入、列印。
- **單元測試**：`docs/tests/core.test.mjs`，26 項通過。
- **瀏覽器實測**：試算、LocalStorage、GAS 成功／失敗／過期、iNat 即時／429／離線／過期、手機版寬度、匯出入。
- **已 commit 的 checkpoint**：`7fca4a6`。

## 已完成（第二輪）

- **獨立審核**：Sonnet subagent 跑一次，提出 20 項建議；已修正高、中優先項目與大部分低優先項目，未修的見下方。
- **單元測試**：31 項通過；瀏覽器回歸測試已完成（見 `docs/04-測試結果.md`）。

## 審核中刻意未處理的項目

- 業者報價的信件日期：需要使用者提供，目前顯示「待補」。
- 桌面版與行動版的 tab 清單重複，各自有一組 `aria-controls`：行為正常，未重構。

## 待使用者決定或執行

- 寄出 `docs/向業者確認問題清單.md`（Tabin、BRL、DVFC）。
- 自己建立 GitHub repo 並 push（步驟見 `docs/03`）。
- 業者回覆後更新 `data-costs`（`status` 改為 `quoted`）與 `data-itinerary`。
