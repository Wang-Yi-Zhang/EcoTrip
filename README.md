# 2027 沙巴雨林生態探索規劃系統

Tabin Wildlife Reserve × Danum Valley｜2027/01/29–02/06｜9 天 8 夜｜預設 4 人

這是一個單一檔案的靜態網站（`index.html`），可以直接部署到 GitHub Pages，用來協助旅伴回答以下問題：

- 行程合不合理、還有哪些沒確認？
- 費用多少？人數和方案改了會怎樣？
- BRL 和 DVFC 值不值得價差？
- 哪些物種有歷史觀測證據？
- 遇到大雨或延誤該怎麼辦？

**資訊可信度優先。** 每個數字都帶有狀態標籤：業者報價、公開／第三方價、估算、示範資料、未報價、待確認。未報價的項目不會以 0 計入。

## 快速開始

- **本機使用**：直接用瀏覽器開啟 `index.html`。行程、試算、物種介紹、清單都能離線使用；地圖圖磚和 iNaturalist 查詢需要網路。
- **部署**：見 [docs/03-部署與維護.md](docs/03-部署與維護.md) 的 A 節。
- **單元測試**（需要 Node.js 18 以上）：

```bash
node docs/tests/core.test.mjs
```

```bash
node docs/tests/gas.test.mjs
```

```bash
node docs/tests/golden.test.mjs
```

```bash
node docs/tests/contrast.test.mjs
```

## 用在另一趟旅行

程式碼不含任何沙巴的細節，行程內容都在資料裡。準備一份行程資料檔（範本：`docs/tests/fixtures/contrast-trip.json`），執行下面的指令就會產生新行程的網頁。詳見 [docs/07](docs/07-引擎通用化與用在其他旅行.md) 第 3 節。

```bash
node tools/build-trip.mjs 我的行程.json 我的行程.html
```

## 檔案

| 檔案 | 內容 |
|---|---|
| `index.html` | 完整網站：HTML、CSS、JS、7 個內建 JSON 資料集 |
| [docs/01-需求審查與資料模型.md](docs/01-需求審查與資料模型.md) | 階段 1–2：日曆與過夜檢查、已知與未知、關鍵假設、資料模型 |
| [docs/02-資料結構說明.md](docs/02-資料結構說明.md) | JSON Schema、費用欄位、資料關聯、GAS 格式 |
| [docs/03-部署與維護.md](docs/03-部署與維護.md) | GitHub Pages 部署；更新行程、價格、物種、POI；GAS 設定；確認 iNaturalist 查詢 |
| [docs/04-測試結果.md](docs/04-測試結果.md) | 實際執行過的測試，以及尚未測試的項目 |
| [docs/research.md](docs/research.md)、`docs/research-data.json` | 事實查證結果（附來源與查核日期） |
| [docs/向業者確認問題清單.md](docs/向業者確認問題清單.md) | 寄給 Tabin、BRL、DVFC 的中英對照問題 |
| `gas/Code.gs` | Google Apps Script 遠端資料端點範例，含 `setupSheets()` 自動建立欄位 |
| `docs/tests/core.test.mjs` | 核心計算與檢查邏輯的單元測試 |
| `docs/tests/golden.test.mjs` | 黃金檔：沙巴行程在 36 組設定下的結果不得改變 |
| `docs/tests/contrast.test.mjs` | 對照旅行（結構不同的另一趟行程）跑同一個引擎；程式碼不得含行程專有字樣 |
| [docs/05-報價信對照.md](docs/05-報價信對照.md) | Tabin 報價信原文與費用資料逐項對照 |
| [docs/06-旅伴三題測試與手機離線確認.md](docs/06-旅伴三題測試與手機離線確認.md) | 需要人來做的兩項驗證 |
| [docs/07-引擎通用化與用在其他旅行.md](docs/07-引擎通用化與用在其他旅行.md) | 現行資料格式、怎麼裝另一趟旅行、最新測試結果與未完成事項 |
| `sw.js` | 離線支援（Service Worker），要和 `index.html` 放在同一層 |
| `tools/build-trip.mjs` | 用另一趟行程的資料檔產生網頁 |
| `tools/gas-allowed.mjs` | 依行程資料重寫 `gas/Code.gs` 的下拉允許值 |
| `docs/tests/gas.test.mjs` | `Code.gs` 模擬測試（假試算表，不連 Google） |

## 資料授權與限制

- **地圖**：© OpenStreetMap contributors、OpenTopoMap（CC-BY-SA）。
- **觀測資料與照片**：iNaturalist。照片只顯示帶有 CC 授權的，並標示作者。
- **觀測筆數的解讀**：iNaturalist 研究級筆數不等於物種分布，也不等於觀察成功率。座標被遮蔽的物種（例如紅毛猩猩、象）在保護區範圍內的查詢會顯示 0 筆，這不代表不存在。
- **報價公開性**：本網站部署在公開的 repo，裡面的業者報價任何人都看得到。請勿放入個資。
