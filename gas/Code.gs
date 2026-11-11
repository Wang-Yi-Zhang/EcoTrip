/** @OnlyCurrentDoc */
/*
 * ↑ 上面這行是授權範圍標註，請保留：讓 Apps Script 只申請 spreadsheets.currentonly
 *   （只能存取本腳本所綁定的這一份試算表），而不是存取你帳號中所有試算表的 spreadsheets 權限。
 *   因此本腳本必須是「綁定在試算表上」的腳本，只能用 getActiveSpreadsheet()，不能用 openById()。
 *   本端點刻意維持唯讀：請勿加入寫入呼叫或 doPost。
 */
/**
 * EcoTrip 2027 — Google Apps Script 遠端資料端點範例
 *
 * 用途：讓旅伴在 Google 試算表更新價格／行程，網站讀取最新資料。
 * 部署：擴充功能 → Apps Script → 貼上本檔 → 部署 → 新增部署作業 → 類型「網頁應用程式」
 *       執行身分：我；存取權：任何人（不是「任何擁有 Google 帳戶的使用者」）
 *       取得 https://script.google.com/macros/s/XXXX/exec 網址，貼到網站「⚙ 資料／匯出」。
 *
 * 試算表結構（工作表名稱固定）：
 *   costs  ：第 1 列為欄名 id | name | category | unit | price | price_low | price_mid | price_high |
 *            price_currency | status | applies | qty_days | qty_nights | qty_trips | includes | excludes |
 *            assumption | source_ids | when | default_on | duplicate_risk | quoted_nights | qty_nights_from | qty_rooms_from
 *   json   ：A 欄 dataset 名稱（trip / itinerary / species / locations / sources / essentials），B 欄整份 JSON 文字。
 *            （行程與物種結構較深，直接放 JSON 最不易出錯。）
 * 只回傳有資料的資料集；網站會逐一驗證，驗證失敗的資料集保留網站內建版本。
 *
 * 注意：這個端點是公開的，任何人知道網址都能讀取，請勿放入個資、護照號碼、訂位代號。
 */
function doGet(e) {
  var out = { schema: "ecotrip2027/1", updated_at: new Date().toISOString(), data: {} };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var costs = ss.getSheetByName("costs");
    if (costs) out.data.costs = readCosts_(costs);
    var js = ss.getSheetByName("json");
    if (js) {
      var rows = js.getDataRange().getValues();
      for (var i = 0; i < rows.length; i++) {
        var name = String(rows[i][0] || "").trim();
        var text = String(rows[i][1] || "").trim();
        if (!name || !text) continue;
        try { out.data[name] = JSON.parse(text); }
        catch (err) { out.errors = (out.errors || []).concat(["json!" + name + " 不是合法 JSON：" + err.message]); }
      }
    }
  } catch (err) {
    out = { schema: "ecotrip2027/1", error: String(err), data: {} };
  }
  // ContentService 回傳 JSON；以「任何人」部署時瀏覽器可跨網域讀取（GET，不要加自訂 header）。
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function readCosts_(sheet) {
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var items = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    head.forEach(function (h, i) { row[h] = values[r][i]; });
    if (!row.id) continue;
    var num = function (v) { return v === "" || v === null || v === undefined ? null : Number(v); };
    var list = function (v) { return String(v || "").split(/[;；]/).map(function (s) { return s.trim(); }).filter(String); };
    var price = num(row.price);
    if (price === null && (row.price_low !== "" || row.price_mid !== "" || row.price_high !== "")) {
      price = { low: num(row.price_low), mid: num(row.price_mid), high: num(row.price_high) };
    }
    var qty = {};
    if (num(row.qty_days) !== null) qty.days = num(row.qty_days);
    if (num(row.qty_nights) !== null) qty.nights = num(row.qty_nights);
    if (num(row.qty_trips) !== null) qty.trips = num(row.qty_trips);
    if (row.qty_nights_from) qty.nights_from = String(row.qty_nights_from);
    if (row.qty_rooms_from) qty.rooms_from = String(row.qty_rooms_from);
    var item = {
      id: String(row.id), name: String(row.name || row.id), category: String(row.category), unit: String(row.unit),
      qty: qty, price: String(row.status) === "unquoted" ? null : price,
      price_currency: row.price_currency ? String(row.price_currency) : "MYR",
      status: String(row.status), applies: String(row.applies || "always"),
      includes: list(row.includes), excludes: list(row.excludes), assumption: String(row.assumption || ""),
      source_ids: list(row.source_ids), duplicate_risk: list(row.duplicate_risk)
    };
    if (row.when) item.when = String(row.when);
    if (row.default_on !== "" && row.default_on !== undefined) item.default_on = row.default_on === true || String(row.default_on).toLowerCase() === "true";
    if (num(row.quoted_nights) !== null) item.quoted_nights = num(row.quoted_nights);
    items.push(item);
  }
  // compare 區塊沿用網站內建資料時，請在 json 工作表另放完整 costs，或接受此處不含 compare。
  return { currency: "MYR", items: items, compare: null };
}
