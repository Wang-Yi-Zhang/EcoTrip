# 進度紀錄（供新 session 接手）

最後更新：2026-11-11（第三輪）。分支：`deepen-engine`（尚未併回 `main`，尚未 push）。

## 現況

- `index.html`：引擎（`core-js`）與介面（`ui-js`）不含任何行程專有內容；沙巴的細節全部在 7 個 `data-*` 區塊。
- 測試 4 支，全部通過：`core`（31）、`gas`（10）、`golden`（36 組設定）、`contrast`（16）。
- 新功能：待辦與期限、銜接餘裕、每日備案表、單日列印、離線（`sw.js`）、旅程後回填。
- 工具：`tools/build-trip.mjs`（用另一份資料產生網頁）、`tools/gas-allowed.mjs`（重寫 `Code.gs` 的下拉允許值）。
- 報價信原文（2026-11-04）已逐項對照，數字相符，見 `docs/05`。

## 先讀哪幾份

1. `docs/07-引擎通用化與用在其他旅行.md`：這一輪的變更、資料格式、測試結果、沒做到的事。
2. `docs/05-報價信對照.md`：報價信原文與費用資料。
3. `docs/06-旅伴三題測試與手機離線確認.md`：要使用者自己做的兩項驗證。

`docs/01`、`docs/02` 的資料模型段落有部分過時，不一致處列在 `docs/07` 2.4。

## 還沒做（依重要性）

1. **第一手資料查證**：2027 年 TPE–BKI、BKI–LDU 班表；DVFC 發車時刻；BRL 官方價與集合地點；沙巴 2/8 是否補假。查到後填入 `itinerary.connections` 的 `time` 與 `essentials.tasks` 的 `due`。
2. **物種紀錄的原始依據**：以 iNaturalist 原始觀測與相機陷阱論文取代 11 筆弱文獻。
3. `docs/01`、`docs/02` 的過時段落改寫（目前只在 `docs/07` 列出差異）。

## 待使用者決定或執行

- 寄出 `docs/向業者確認問題清單.md`（待辦第一項，自訂目標日 2026-11-18）。
- 是否把 `deepen-engine` 併回 `main`；建立 GitHub repo 並 push（步驟見 `docs/03`，記得連 `sw.js` 一起上傳）。
- push 之後看 GitHub Actions 是否全綠。
- 旅伴三題測試、手機飛航模式測試（`docs/06`）。
- 業者回覆後：更新 `data-costs`、`essentials.tasks` 的期限、`itinerary.connections` 的出發時間與 `status`。
