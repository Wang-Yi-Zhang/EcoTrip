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
| `docs/tests/gas.test.mjs` | `Code.gs` 模擬測試（假試算表，不連 Google） |

## 資料授權與限制

- **地圖**：© OpenStreetMap contributors、OpenTopoMap（CC-BY-SA）。
- **觀測資料與照片**：iNaturalist。照片只顯示帶有 CC 授權的，並標示作者。
- **觀測筆數的解讀**：iNaturalist 研究級筆數不等於物種分布，也不等於觀察成功率。座標被遮蔽的物種（例如紅毛猩猩、象）在保護區範圍內的查詢會顯示 0 筆，這不代表不存在。
- **報價公開性**：本網站部署在公開的 repo，裡面的業者報價任何人都看得到。請勿放入個資。
