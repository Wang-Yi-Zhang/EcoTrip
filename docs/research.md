# 沙巴生態之旅事實查證摘要（查證日：2026-11-10）

完整資料與來源網址見 `research-data.json`。凡標示 UNVERIFIED 者表示未能查證，不可當成事實使用。

## 1. 最會影響行程決策的發現

1. **Tabin 官方套裝已含你私人報價的多數項目**（官方 https://tabinwildlife.com.my/?p=2041，4D3N Mud Volcano 套裝，每人 RM3,350 起、2 人成行）：含 Lahad Datu 往返定班接送、導覽步行（賞鳥、Lipad 瀑布、泥火山）、黃昏出車、夜間 safari、Lipad 觀景塔過夜。若私人報價是「疊加」在官方套裝上，私人導遊/私人車輛/私人接送/私人夜間 safari 有重複收費風險；若是「取代」套裝（只買住宿餐食），則不重複。需向報價方確認計價基礎。
2. **BRL（Borneo Rainforest Lodge）整修**：官方公告新會所與木屋施工 2025-01-01 至 2027-01-22（白天施工）。第三方（Amazing Borneo）另列 2026-12-12~21、2027-01-04~06 暫時休館；我們的 2027-01-29~02-06 不在其中，但建議訂房前書面確認工程已完工。
3. **農曆新年 2027-02-06（週六）**，初二 02-07（週日），正好是行程最後一天。官方內閣公布的假期表列 02-06、02-07 為全國假日；02-08（週一）是否為沙巴補假，各來源矛盾（我讀到的官方表中 02-08 只出現 Awal Ramadan，未標沙巴）。UNVERIFIED。回程航班與機場接送應提早訂妥。
4. **接送時間**：LDU → Tabin 約 1.5 小時（Tabin 官方）；LDU → BRL / DVFC 約 2.5 小時碎石路（BRL 官方頁、第三方）。
5. **東北季風**：約 11 月至 3 月，沙巴東岸常有持續降雨警告（MetMalaysia 經媒體報導；沒有 Lahad Datu 專屬月降雨數據）。預期路況泥濘與可能延誤。

## 2. iNaturalist 地點（T1）

- Tabin Wildlife Reserve：place_id **191532**；Danum Valley Conservation Area：place_id **191493**。兩者都是 iNat 的「公園/保護區」地點，有 bbox，place 篩選可用（未下載/檢視多邊形，只確認 bbox 與篩選結果）。
- Tabin bbox 偏大（約 37×55 km，含周邊與海域），優先用 place_id。另有 place 194853「Tabin Virgin Jungle Reserve」（較小，涵蓋度假村/Lipad 一帶）。

## 3. 物種資料（T2，共 37 種，已刪除 3 種：Hylobates muelleri、Paradoxurus hermaphroditus、Urva brachyura，理由見 JSON）

**關鍵警告（已實測驗證）**：瀕危物種（如紅毛猩猩、豬、亞洲象等）在 iNat 的座標會被「模糊化」（obscured=true）。用 place_id 篩選會把這些觀察排除，所以許多旗艦物種（猩猩、象、雲豹、馬來熊、長臂猿、穿山甲等）在 Tabin/Danum 的 place 計數是 **0**，這**不代表不存在**。bbox 查詢會回傳被隨機位移的點，數字僅供參考。App 不應拿 iNat 次數證明某物種在或不在。

- 有開放座標、可信的 place 計數例：紅葉猴（Danum 195 筆，最新 2026-09-04）、馬來亞飛狐猴（Danum 56 / Tabin 12）、馬來麝香貓（Danum 33 / Tabin 14）、棕鼯鼠、兩種鼷鹿。
- 文獻支持（僅讀到的來源）：
  - Tabin：Wikipedia（象、爪哇野牛、水鹿、猩猩、長鼻猴、雲豹）；UMS 論文摘要（雲豹、紅貓/Catopuma badia、大理石紋貓、豹貓皆有影像紀錄；扁頭貓 2002 年有紀錄，後續調查未再偵測）。
  - Danum：Borneo Forest Heritage 自然頁（爪哇野牛、象、雲豹、猩猩、長鼻猴）、Wikipedia（猩猩、馬來熊、雲豹）、KBA 16012 頁（2002 年資料，範圍 2,331 km²，比 DVCA 大，僅作弱證據）。
  - 其他物種：`lit_*` 為 "unknown"，只有 iNat 資料。**未宣稱任何物種為 Tabin 或 Danum 特有種。**
- 分類變動：北婆羅洲灰長臂猿為 Hylobates funereus（舊資料寫 H. muelleri）；豹貓 Prionailurus javanensis（舊作 bengalensis）；Herpestes → Urva；Echinosorex gymnura 在 iNat 拼作 gymnurus；iNat 把小爪水獺/江獺列為 Lutra cinerea / Lutra perspicillata；Danum 的棕櫚貂其實是 Paradoxurus philippinensis（22 筆），不是 P. hermaphroditus。
- IUCN 等級取自 iNat 全球 IUCN 欄位，**未**在 iucnredlist.org 交叉核對。
- 繁體中文名：**全部留 null**（未查 TaiCOL/中文維基）。iNat zh-TW 社群名稱當作候選放在各物種 notes，但可靠度不足（部分用簡體字）。
- 活動時段（日行/夜行）為一般常識，沒有查來源，`activity_source` 為 null。

## 4. 地點座標（T3）

多數取自 OpenStreetMap（Nominatim），精度可用：LDU 機場 (5.0325, 118.3243)、Tabin Wildlife Resort (5.1884, 118.5009)、Lipad 泥火山 (5.2097, 118.5080)、BRL (5.0197, 117.7461)、Lahad Datu 市區 (5.0216, 118.3276)。
**近似/未驗證**：Danum 區域中心 (4.9397, 117.6957)（各來源相差約 0.1 度）；Danum Valley Field Centre (4.964, 117.803) 只是依 iNat 開放座標群聚與 International Parks 推估，UNVERIFIED。

## 5. 住宿（T4/T5）

- **BRL 官方**（borneonaturetours.com）：未公布價格，有 30 間木屋，全包套裝含導覽與 LDU–BRL 往返接送；訂房走官方網站訂房系統或 KK 業務辦公室。borneorainforestlodge.com 因 SSL 失敗未能讀取。
- **BRL 第三方**（Amazing Borneo，非官方）：3D2N 共乘，2026-04-01~2027-03-31 國際市場每人：Jungle Chalet 雙人房 USD 2,033、單人 2,897；Deluxe 2,165/3,160；Premium Deluxe 2,725/4,247。含餐、LDU 往返定班接送、保育區入場許可與稅、導覽、冠層步道、夜間出車、夜間步行；不含機票、酒精/碳酸飲料、旅遊稅（外國人 USD 2/房/晚）。頁面每個價格旁還有一個未標示的較高數字，無法判定哪個是實際價；網頁上的「馬來西亞市場」低價不適用我們。
- **DVFC 官方**（borneoforestheritage.org.my）：貴賓房/休息屋/宿舍/露營；價目頁 404，官方價格未取得；官方頁稱 DVFC–LDU 交通僅週一、三、五（第三方說每日，矛盾）。
- **DVFC 第三方**（Amazing Borneo）：4D3N 2027 國際市場 2–3 人同行每人 USD 1,560（宿舍）~1,710（Superior Deluxe）；單人加價 USD 215~289；含 1 次夜間出車與 1 次日出出車；設施「非常簡陋」。同樣有未標示的較高數字。
- **Tabin**（官方）：河畔木屋 10 間，雙床、可住 3 人、冷氣、熱水、陽台、俯瞰 Lipad 河；官方頁未列房價。官方套裝見上方第 1 點。有業者說 Lipad 觀景塔曾暫停開放維修，目前狀態 UNVERIFIED。

## 6. 旅遊資訊（T6）

- **入境**：臺灣外交部領事事務局頁面：我國護照免簽 30 天；入境前 3 天內須上網填 MDAC（免費）；機場不接受信用卡作財力證明。該頁更新日期標示為 2022-06-21，但內文有 2024 年資訊，建議出發前再核對。馬來西亞移民局 MDAC 官網讀取逾時、護照效期要求未能確認。沙巴自行管理入境（只有第三方來源說明；官方未證實）。
- **航班**：維基百科只列 AirBorneo 飛 LDU（往 BKI、SDK）；其他來源矛盾；第三方行程引用 BKI–LDU 約 55 分鐘。2027 年實際班表/航班號 UNVERIFIED，不要寫入定案。
- **iNaturalist API**：官方「API Recommended Practices」頁被 Cloudflare 擋下（403），確切限制 UNVERIFIED。保守作法：每秒不超過 1 次、快取、設定 User-Agent（我約 300 次呼叫、每 1.1 秒一次，沒有被限流）。「每日 1 萬次」未能證實。
- **照片授權**：taxon default_photo.license_code 實測有 cc-by、cc-by-nc、cc-by-nc-sa、cc-by-nc-nd、cc-by-sa，以及 null（保留所有權利）。需顯示攝影者與授權；NC 不可商用；null 不可直接使用。
- **OpenTopoMap**：允許嵌入，不鼓勵大量下載，不保證可用性，商用可但需標示、CC-BY-SA。標示文字：`Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: © OpenTopoMap (CC-BY-SA)`（來源 https://opentopomap.org/about）。

## 7. 未能查證清單（摘要）

繁中名稱、IUCN 交叉核對、活動時段來源、各物種完整名錄（Tabin/Danum）、Lipad 觀景塔目前是否開放、BRL 官方 2027 價格與單人加價、DVFC 官方價目與座標、沙巴農曆新年補假、MDAC 官網與護照效期、LDU 2027 年航班、iNat 官方限流數字。詳見 JSON 的 `unverified`。

---

## 後續補充（主 session，2026-11-11）

- **中文名**：研究時中文名一律留空。之後主 session 透過中文維基百科 API 查詢條目的臺灣正體名稱，補上 30 / 37 種。每一種都附有該條目的連結（`src_zhwiki_<id>`）。維基條目名稱不等於官方或學術標準譯名；查不到的 7 種維持 null，只顯示英文名。
- **弱證據標記**：文獻依據只有 Wikipedia 或 KBA 2002 年資料的紀錄，標為 `lit_weak`（共 11 筆）。這類紀錄單獨不足以產生「有歷史紀錄」標籤。
- **扁頭豹貓**：Tabin 的紀錄是 2002 年的影像，後續調查未再偵測到，已加註說明。

---

## 第一手資料補查（主 session，2026-11-12）

這一節取代上面第 1 節第 3 點（2/8 補假）與第 5 節 DVFC 交通的說法。

### 查到並已寫入資料的

| 項目 | 來源 | 結果 |
|---|---|---|
| DVFC 排程車 | Sabah Foundation 官方頁 https://borneoforestheritage.org.my/dvca/dvca.htm（頁面沒有標示更新日期） | 8 人座，每週一、三、五；15:00 從 Lahad Datu Town 發車、預計 17:30 抵達；08:30 從 Danum 發車、預計 11:00 抵達；每人單程 RM85；需事先預約 |
| DVFC 包車 | 同上 | 4WD（4 人座）每輛單程 RM350，出發時間彈性 |
| DVFC 辦公室 | 同上 | 在 Lahad Datu 機場正對面；入園許可要在這裡辦 |
| 2027 春節假期 | FMM 通函 GI/15/2026（2026-08-27），轉載首相署公告；PDF 全文已讀 | 2/6（六）、2/7（日）沙巴欄為 N（全國假期）。2/8（一）表中列為 Awal Ramadan，只適用 Johor、Kedah。附註 1：假期落在每週休息日時次日補假，依此沙巴 2/8 補假。這是由附註推得 |

第三方資料稱 DVFC 排程車「每日 08:30 發車」，與官方不一致；資料以官方為準，並在方案比較中註明兩者不同。

### 查不到的（維持未查證）

| 項目 | 嘗試過的來源 | 結果 |
|---|---|---|
| BRL 接送時刻與集合地點 | borneonaturetours.com 首頁與 Borneo Rainforest Lodge 頁 | 官方只寫「2.5 hours overland drive from Lahad Datu」與套裝含 LDU–BRL–LDU 接送，沒有時刻。09:30 發車仍只有第三方資料，而且各家旅行社寫的時間不同（08:30、09:30） |
| BRL 官方 2027 價格 | 官方訂房系統 secure-hotel-booking.com | 沒有嘗試操作訂房系統 |
| 政府假期公告原始頁 | kabinet.gov.my/hari-kelepasan-am | 連線被拒，兩種方式都讀不到 |
| BKI–LDU 2027 班表 | airborneo.com | WebFetch 回應 403；瀏覽器開啟得到 HTTP 500 錯誤頁。搜尋到的只有第三方航班追蹤網站的 2026 年資料，沒有採用 |
| TPE–BKI 2027 班表 | 未查 | 航空公司的班表頁需要互動查詢，這一輪沒有進行 |
| 沙巴假期條例的補假條文 | sagc.sabah.gov.my 的 Holidays Ordinance PDF | 已下載，但本機缺少轉換工具，無法讀取內容 |

### 物種：以已發表的調查取代弱文獻

先試了 iNaturalist 原始觀測：抓取紅毛猩猩在 Tabin 近似範圍內的 29 筆研究級紀錄，每一筆都是座標遮蔽、地名只寫「Sabah, MY」或「Kinabatangan」。也就是說，遮蔽物種的原始觀測無法用來證明在 Tabin 或 Danum 出現，這條路走不通。

改查已發表論文後，11 筆弱文獻紀錄的處理結果：

| 物種／地區 | 結果 | 依據 |
|---|---|---|
| 紅毛猩猩／Tabin | 改為可靠文獻 | Ancrenaz et al. 2005, PLoS Biology：2002–2003 年空中巢數調查，約 1,400 隻 |
| 婆羅洲象／Tabin | 改為可靠文獻 | Alfred et al. 2010：2007–2008 年糞堆樣線調查，Tabin 為五個範圍之一（只核對到摘要，不引用數量） |
| 爪哇野牛／Tabin | 改為可靠文獻 | Prosser et al. 2016, BMC Zoology：相機陷阱辨識 16 頭個體 |
| 馬來熊／Danum | 改為可靠文獻 | Nakabayashi et al. 2021, Scientific Reports：BRL 周邊相機陷阱 10 筆以上 |
| 豬尾獼猴／Danum、長尾獼猴／Danum | 改為可靠文獻 | Hanya et al. 2020, American Journal of Primatology：25 個月路線調查（只核對到摘要） |
| 長鼻猴／Tabin、水鹿／Tabin | 維持弱證據 | 沒找到已發表的 Tabin 紀錄 |
| 獺狸／Danum | 維持弱證據 | 沒找到已發表紀錄 |
| 褐貓／Danum | 維持弱證據 | 兩篇論文各有 1 筆，但我無法確認地點是 Danum（其中一篇的表格是圖檔） |
| 扁頭豹貓／Tabin | 維持弱證據 | 來源可靠但紀錄是 2002 年，後續調查未再偵測到 |

另外，同一篇 Nakabayashi et al. 2021 也支持馬來熊在 Tabin 的紀錄，原本是「未查證」，已補上。

標籤因此改變的只有兩筆：爪哇野牛／Tabin、馬來熊／Danum，從「資料不足」變成「罕見或高度仰賴運氣」。其餘只是判斷依據的文字更新。
