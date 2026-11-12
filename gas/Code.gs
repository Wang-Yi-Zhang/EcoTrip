/** @OnlyCurrentDoc */
/*
 * ↑ 上面這行是授權範圍標註，請保留：讓 Apps Script 只申請 spreadsheets.currentonly
 *   （只能存取本腳本所綁定的這一份試算表），而不是存取你帳號中所有試算表的 spreadsheets 權限。
 *   因此本腳本必須是「綁定在試算表上」的腳本，只能用 getActiveSpreadsheet()，不能用 openById()。
 *
 * 讀寫分工（重要）：
 *   - doGet()       公開端點，任何知道網址的人都能觸發 → 嚴格唯讀，請勿加入任何寫入呼叫，也不要加 doPost。
 *   - setupSheets() 只由擁有者在 Apps Script 編輯器手動執行（選函式 → 執行），用來建立／補齊欄位。
 *     兩者使用同一個授權範圍（currentonly 本來就含讀寫目前這份試算表），所以不需擴大權限。
 */
/**
 * EcoTrip 2027 — Google Apps Script 遠端資料端點範例
 *
 * 用途：讓旅伴在 Google 試算表更新價格／行程，網站讀取最新資料。
 * 建表：貼上本檔 → 在編輯器上方選 setupSheets → 執行（第一次需授權）。可重複執行，只補缺少的部分。
 * 部署：部署 → 新增部署作業 → 類型「網頁應用程式」
 *       執行身分：我；存取權：任何人（不是「任何擁有 Google 帳戶的使用者」）
 *       取得 https://script.google.com/macros/s/XXXX/exec 網址，貼到網站「⚙ 資料／匯出」。
 *
 * 試算表結構（工作表名稱固定；欄位定義見下方 COSTS_HEADERS）：
 *   costs ：每列一個費用項目。欄位依「欄名」讀取，順序不限，可自行增加備註欄（不會被讀取）。
 *   json  ：A 欄 dataset、B 欄 json（整份資料集的 JSON 文字）。
 *           注意：Google 試算表每格上限 50,000 字元；species 壓縮後約 40,000 字元（2026-11 實測），
 *           再大幅新增物種前請先確認長度。
 * 只回傳有資料的資料集；網站會逐一驗證，驗證失敗的資料集保留網站內建版本。
 *
 * 注意：這個端點是公開的，任何人知道網址都能讀取，請勿放入個資、護照號碼、訂位代號。
 *
 * 維護：網站（index.html 的 validateDataset）新增欄位或允許值時，請同步更新下方常數，
 *       再重新執行 setupSheets() 並「管理部署作業 → 編輯 → 新版本」。
 */

/* ===================== 欄位定義（建表與讀取共用，唯一一份） ===================== */
var SHEET_COSTS = "costs";
var SHEET_JSON = "json";

// 允許值的唯一來源是網站（index.html 的 EcoCore.allowedValues）。這一段由 node tools/gas-allowed.mjs --write 產生，
// 請勿手改；docs/tests/gas.test.mjs 會比對兩邊是否相同。
var ALLOWED = {
  category: ["group_fixed", "per_person", "danum", "other"],
  unit: ["per_person", "per_group", "per_group_per_day", "per_person_per_night", "per_room_per_night", "per_person_trip", "per_person_day", "per_room"],
  status: ["confirmed", "quoted", "public_rate", "third_party", "estimate", "demo", "unquoted"],
  applies: ["always", "flights", "extras", "optional", "brl", "dvfc"],
  price_currency: ["MYR", "TWD", "USD"],
  when: ["singles", "plan_brl", "plan_dvfc"],
  qty_from: ["pax", "rooms", "singles", "triples", "activity_count"],
  dataset: ["trip", "itinerary", "costs", "species", "locations", "sources", "essentials"]
};

/**
 * costs 工作表欄位。kind 決定建表時的資料驗證：
 *   list:<ALLOWED 鍵>  下拉選單（不接受清單外的值）
 *   number             非負數字（留空＝未知，不要填 0 代表未報價）
 *   bool               核取方塊
 *   text               自由文字；多值欄位以「;」分隔
 *   json               JSON 文字
 */
var COSTS_HEADERS = [
  { name: "id", kind: "text", note: "唯一代碼（英數與底線），例如 tabin_base" },
  { name: "name", kind: "text", note: "顯示名稱" },
  { name: "category", kind: "list:category", note: "group_fixed 團體固定｜per_person 按人｜danum Danum 套裝｜other 其他" },
  { name: "unit", kind: "list:unit", note: "計價單位" },
  { name: "price", kind: "number", note: "固定單價（報價／公開價）。估算請改填 price_low/mid/high；未報價請留空" },
  { name: "price_low", kind: "number", note: "低情境單價（估算／示範用）" },
  { name: "price_mid", kind: "number", note: "中情境單價" },
  { name: "price_high", kind: "number", note: "高情境單價" },
  { name: "price_currency", kind: "list:price_currency", note: "留空＝MYR" },
  { name: "status", kind: "list:status", note: "unquoted 時價格欄一律留空" },
  { name: "applies", kind: "list:applies", note: "何時計入；留空＝always" },
  { name: "when", kind: "list:when", note: "額外條件（可留空）" },
  { name: "default_on", kind: "bool", note: "applies=optional 時是否預設勾選" },
  { name: "qty_days", kind: "number", note: "天數（per_group_per_day、per_person_day）" },
  { name: "qty_nights", kind: "number", note: "晚數（per_person_per_night、per_room_per_night）" },
  { name: "qty_trips", kind: "number", note: "趟數（per_person_trip）" },
  { name: "qty_nights_from", kind: "list:qty_from", note: "晚數改由計算情境取得（activity_count＝行程中選到此項目的活動數）" },
  { name: "qty_rooms_from", kind: "list:qty_from", note: "房數改由計算情境取得（例如 singles）" },
  { name: "quoted_nights", kind: "number", note: "報價晚數（與行程不符時提醒）" },
  { name: "count_label", kind: "text", note: "晚數提醒文字裡用的簡稱（選填），例如 私人夜遊" },
  { name: "days_check", kind: "json", note: '報價天數檢查（選填），例如 {"segment":"tabin","msg":"…{span}…{days}…"}' },
  { name: "notes", kind: "text", note: "補充說明（選填，顯示在費用明細）" },
  { name: "includes", kind: "text", note: "包含項目，以 ; 分隔" },
  { name: "excludes", kind: "text", note: "不含項目，以 ; 分隔" },
  { name: "assumption", kind: "text", note: "假設與說明（估算必填）" },
  { name: "source_ids", kind: "text", note: "來源 id，以 ; 分隔（需存在於 sources）" },
  { name: "duplicate_risk", kind: "text", note: "可能重複計費的項目 id，以 ; 分隔" },
  { name: "itinerary_check", kind: "json", note: '行程可行性檢查（選填），例如 {"plan":"brl","day":6,"msg":"…"}' }
];
var JSON_HEADERS = [
  { name: "dataset", kind: "list:dataset", note: "資料集名稱" },
  { name: "json", kind: "text", note: "整份資料集 JSON（每格上限 50,000 字元）" }
];

/* ===================== 公開端點（唯讀） ===================== */
function doGet(e) {
  var out = { schema: "ecotrip/1", updated_at: new Date().toISOString(), data: {} };
  var errors = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var costs = ss.getSheetByName(SHEET_COSTS);
    if (costs && costs.getLastRow() >= 2) {
      // 核取方塊欄位會讓空白列也算「有資料」，所以要真的讀到費用列才回傳；否則空的費用表會蓋掉網站全部費用
      var c = readCosts_(costs, errors);
      if (c.items.length) out.data.costs = c;
    }
    var js = ss.getSheetByName(SHEET_JSON);
    if (js) {
      var rows = js.getDataRange().getValues();
      for (var i = 0; i < rows.length; i++) {
        var name = String(rows[i][0] || "").trim();
        var text = String(rows[i][1] || "").trim();
        if (!name || !text || name === "dataset") continue;   // 略過空列與表頭列
        try { out.data[name] = JSON.parse(text); }          // json 工作表的同名資料集會覆蓋 costs 工作表
        catch (err) { errors.push("json!" + name + " 不是合法 JSON：" + err.message); }
      }
    }
  } catch (err) {
    out = { schema: "ecotrip/1", error: String(err), data: {} };
  }
  if (errors.length) out.errors = errors;
  // ContentService 回傳 JSON；以「任何人」部署時瀏覽器可跨網域讀取（GET，不要加自訂 header）。
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function readCosts_(sheet, errors) {
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  COSTS_HEADERS.forEach(function (h) { col[h.name] = head.indexOf(h.name); });   // 只讀已定義的欄位；其他欄位視為備註
  var missing = COSTS_HEADERS.filter(function (h) { return col[h.name] < 0; }).map(function (h) { return h.name; });
  if (missing.length) errors.push("costs 工作表缺少欄位：" + missing.join(", ") + "（請執行 setupSheets 補齊）");
  var num = function (v) { return v === "" || v === null || v === undefined ? null : Number(v); };
  var list = function (v) { return String(v || "").split(/[;；]/).map(function (s) { return s.trim(); }).filter(String); };
  var items = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    COSTS_HEADERS.forEach(function (h) { row[h.name] = col[h.name] >= 0 ? values[r][col[h.name]] : ""; });
    if (!row.id) continue;
    var price = num(row.price);
    var lo = num(row.price_low), mid = num(row.price_mid), hi = num(row.price_high);
    if (price === null && (lo !== null || mid !== null || hi !== null)) price = { low: lo, mid: mid, high: hi };
    var qty = {};
    if (num(row.qty_days) !== null) qty.days = num(row.qty_days);
    if (num(row.qty_nights) !== null) qty.nights = num(row.qty_nights);
    if (num(row.qty_trips) !== null) qty.trips = num(row.qty_trips);
    if (row.qty_nights_from) qty.nights_from = String(row.qty_nights_from);
    if (row.qty_rooms_from) qty.rooms_from = String(row.qty_rooms_from);
    var item = {
      id: String(row.id).trim(), name: String(row.name || row.id), category: String(row.category), unit: String(row.unit),
      qty: qty, price: String(row.status) === "unquoted" ? null : price,
      price_currency: row.price_currency ? String(row.price_currency) : "MYR",
      status: String(row.status), applies: String(row.applies || "always"),
      includes: list(row.includes), excludes: list(row.excludes), assumption: String(row.assumption || ""),
      source_ids: list(row.source_ids), duplicate_risk: list(row.duplicate_risk)
    };
    if (row.when) item.when = String(row.when);
    if (row.default_on !== "" && row.default_on !== undefined) item.default_on = row.default_on === true || String(row.default_on).toLowerCase() === "true";
    if (num(row.quoted_nights) !== null) item.quoted_nights = num(row.quoted_nights);
    if (String(row.count_label || "").trim()) item.count_label = String(row.count_label).trim();
    if (String(row.notes || "").trim()) item.notes = String(row.notes).trim();
    if (String(row.days_check || "").trim()) {
      try { item.days_check = JSON.parse(String(row.days_check)); }
      catch (err) { errors.push("costs!" + item.id + " 的 days_check 不是合法 JSON"); }
    }
    if (String(row.itinerary_check || "").trim()) {
      try { item.itinerary_check = JSON.parse(String(row.itinerary_check)); }
      catch (err) { errors.push("costs!" + item.id + " 的 itinerary_check 不是合法 JSON"); }
    }
    items.push(item);
  }
  // compare（方案比較）不在試算表中維護：網站會沿用內建的 compare。
  return { currency: "MYR", items: items, compare: null };
}

/* ===================== 建表（只由擁有者手動執行） ===================== */
/**
 * 建立／補齊 costs 與 json 工作表的欄位與資料驗證。可重複執行（冪等）：
 *   - 工作表不存在才建立；已存在就沿用。
 *   - 只把「缺少的欄名」加到最右邊；既有欄位、順序、資料列、旅伴自己加的欄位都不動。
 *   - 重新套用下拉選單／數字／核取方塊驗證到第 2 列以下（不改動儲存格內容）。
 *   - 凍結第 1 列；表頭加上說明註解與「編輯前警告」保護（警告而非鎖定，擁有者仍可修改）。
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  [[SHEET_COSTS, COSTS_HEADERS], [SHEET_JSON, JSON_HEADERS]].forEach(function (pair) {
    var name = pair[0], defs = pair[1];
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); report.push("建立工作表 " + name); }
    var added = ensureHeaders_(sh, defs);
    if (added.length) report.push(name + " 新增欄位：" + added.join(", "));
    applyValidation_(sh, defs);
    sh.setFrozenRows(1);
    protectHeader_(sh);
  });
  var msg = report.length ? report.join("\n") : "欄位已齊全，未做任何變更（驗證規則已重新套用）。";
  Logger.log(msg);
  return msg;
}

/** 只補缺少的欄名到最右邊，回傳新增的欄名 */
function ensureHeaders_(sh, defs) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var empty = head.every(function (h) { return h === ""; });
  var existing = empty ? [] : head;
  var added = [];
  var nextCol = empty ? 1 : sh.getLastColumn() + 1;
  defs.forEach(function (d) {
    if (existing.indexOf(d.name) >= 0) return;
    sh.getRange(1, nextCol).setValue(d.name);
    nextCol++; added.push(d.name);
  });
  // 表頭樣式與說明（只改第 1 列格式與註解，不動資料）
  var finalHead = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  defs.forEach(function (d) {
    var c = finalHead.indexOf(d.name) + 1;
    if (c > 0) sh.getRange(1, c).setFontWeight("bold").setNote(d.note + "（" + d.kind + "）");
  });
  return added;
}

/** 依欄位 kind 套用資料驗證到第 2 列以下 */
function applyValidation_(sh, defs) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  defs.forEach(function (d) {
    var c = head.indexOf(d.name) + 1;
    if (c <= 0) return;
    var range = sh.getRange(2, c, rows, 1);
    var rule = null;
    if (d.kind.indexOf("list:") === 0) {
      rule = SpreadsheetApp.newDataValidation().requireValueInList(ALLOWED[d.kind.slice(5)], true)
        .setAllowInvalid(false).setHelpText("請從清單選擇：" + ALLOWED[d.kind.slice(5)].join(", ")).build();
    } else if (d.kind === "number") {
      rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false).setHelpText("請填非負數字；未知請留空，不要填 0").build();
    } else if (d.kind === "bool") {
      rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    }
    if (rule) range.setDataValidation(rule);
  });
}

/** 表頭列加上「編輯前警告」（不鎖定，避免誤改欄名） */
function protectHeader_(sh) {
  var exists = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(function (p) { return p.getDescription() === "EcoTrip 表頭"; });
  if (exists) return;
  sh.getRange(1, 1, 1, sh.getMaxColumns()).protect().setDescription("EcoTrip 表頭").setWarningOnly(true);
}
