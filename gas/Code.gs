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
 * 代墊與付款管理（docs/SDD-002）：members、ledger 兩張工作表也會由 doGet 回傳。
 *   - 人員只放暱稱，不放本名、帳號、卡號、訂位代號。
 *   - ledger 的 note 欄是私人備註，doGet 不回傳；旅伴自己加的欄位也不回傳（只讀 MEMBERS_HEADERS／LEDGER_HEADERS 定義的欄位）。
 *   - 帳本只新增、不修改：改錯就新增一筆 type=reversal、ref_id=被沖銷那筆的 id，再新增正確的一筆。
 *
 * 維護：網站（sabah2027/index.html 的 validateDataset）新增欄位或允許值時，請同步更新下方常數，
 *       再重新執行 setupSheets() 並「管理部署作業 → 編輯 → 新版本」。
 */

/* ===================== 欄位定義（建表與讀取共用，唯一一份） ===================== */
var SHEET_COSTS = "costs";
var SHEET_JSON = "json";
var SHEET_MEMBERS = "members";
var SHEET_LEDGER = "ledger";

// 允許值的唯一來源是網站（sabah2027/index.html 的 EcoCore.allowedValues）。這一段由 node tools/gas-allowed.mjs --write 產生，
// 請勿手改；docs/tests/gas.test.mjs 會比對兩邊是否相同。
var ALLOWED = {
  category: ["group_fixed", "per_person", "danum", "other"],
  unit: ["per_person", "per_group", "per_group_per_day", "per_person_per_night", "per_room_per_night", "per_person_trip", "per_person_day", "per_room"],
  status: ["confirmed", "quoted", "public_rate", "third_party", "estimate", "demo", "unquoted"],
  applies: ["always", "flights", "extras", "optional"],
  price_currency: ["MYR", "TWD", "USD"],
  when: ["singles"],
  qty_from: ["pax", "rooms", "singles", "triples", "activity_count"],
  dataset: ["trip", "itinerary", "costs", "species", "locations", "sources", "essentials"],
  ledger_type: ["plan", "payment", "share", "repayment", "refund", "reversal"],
  member_status: ["active", "withdrawn"]
};

/**
 * costs 工作表欄位。kind 決定建表時的資料驗證：
 *   list:<ALLOWED 鍵>  下拉選單（不接受清單外的值）
 *   number             非負數字（留空＝未知，不要填 0 代表未報價）
 *   bool               核取方塊
 *   text               自由文字；多值欄位以「;」分隔
 *   json               JSON 文字
 *   date               日期（doGet 轉成 yyyy-MM-dd）
 *   member             從 members 工作表的 nick 欄選
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
/** members 工作表：一列一位旅伴（只放暱稱） */
var MEMBERS_HEADERS = [
  { name: "nick", kind: "text", note: "暱稱（唯一；不要填本名）" },
  { name: "room", kind: "text", note: "預設房間代號，同房的人填同一個（房間類費用依此分攤）" },
  { name: "status", kind: "list:member_status", note: "active 同行｜withdrawn 退出；留空＝active" },
  { name: "withdrawn_on", kind: "date", note: "退出日期（這天起的 to=all 不含此人）" },
  { name: "confirmed_through", kind: "text", note: "這位旅伴已核對到的最後一筆 ledger id（旅伴回覆後由擁有者代填）" }
];
/** ledger 工作表：一列一筆事件，只新增不修改 */
var LEDGER_HEADERS = [
  { name: "id", kind: "text", note: "唯一編號，例如 L001" },
  { name: "date", kind: "date", note: "實際日期（付款、還款、退款）；plan 填建立日" },
  { name: "type", kind: "list:ledger_type", note: "plan 預計｜payment 付款｜share 指定分攤｜repayment 旅伴還款｜refund 業者退款｜reversal 沖銷" },
  { name: "payer", kind: "member", note: "付錢的人（repayment＝還錢的人）；share、reversal 留空" },
  { name: "to", kind: "text", note: "all，或以 ; 分隔的暱稱；repayment＝收錢的那一位" },
  { name: "amount", kind: "number", note: "原幣金額（大於 0）" },
  { name: "currency", kind: "list:price_currency", note: "原幣幣別；留空＝結算幣別" },
  { name: "home_actual", kind: "number", note: "卡片／銀行實際入帳的結算幣別金額；未入帳留空（網站用匯率暫估）" },
  { name: "cost_id", kind: "text", note: "對應 costs 的費用 id（選填）" },
  { name: "vendor_due", kind: "date", note: "付業者期限（plan 必填）" },
  { name: "repay_due", kind: "date", note: "旅伴還款期限；留空＝date + 7 天" },
  { name: "evidence", kind: "text", note: "憑證位置，例如「Gmail 2026-11-15 確認信」；不要貼內容" },
  { name: "ref_id", kind: "text", note: "關聯的另一筆：reversal→被沖銷的；share→付款；payment→預計；refund→原付款" },
  { name: "note", kind: "text", note: "私人備註，doGet 不回傳" }
];
var PRIVATE_FIELDS = ["note"];

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
    // 帳本：放在 json 之後，同名資料集以工作表為準
    var tz = ss.getSpreadsheetTimeZone();
    var mem = ss.getSheetByName(SHEET_MEMBERS);
    if (mem) { var mi = readRows_(mem, SHEET_MEMBERS, MEMBERS_HEADERS, "nick", tz, errors); if (mi.length) out.data.members = { items: mi }; }
    var led = ss.getSheetByName(SHEET_LEDGER);
    if (led) { var li = readRows_(led, SHEET_LEDGER, LEDGER_HEADERS, "id", tz, errors); if (li.length) out.data.ledger = { items: li }; }
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

/**
 * 讀取 members／ledger 這類「一列一筆」的工作表（唯讀）。
 * 只讀 defs 定義的欄位，且略過 PRIVATE_FIELDS；key 欄空白的列略過。
 * 日期轉成 yyyy-MM-dd（依試算表時區），數字欄留空回傳 null，其他一律去頭尾空白的文字。
 */
function readRows_(sheet, label, defs, key, tz, errors) {
  var values = sheet.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var col = {};
  defs.forEach(function (h) { col[h.name] = head.indexOf(h.name); });
  var missing = defs.filter(function (h) { return col[h.name] < 0; }).map(function (h) { return h.name; });
  if (missing.length) errors.push(label + " 工作表缺少欄位：" + missing.join(", ") + "（請執行 setupSheets 補齊）");
  var items = [];
  for (var r = 1; r < values.length; r++) {
    var k = col[key] >= 0 ? String(values[r][col[key]] === null || values[r][col[key]] === undefined ? "" : values[r][col[key]]).trim() : "";
    if (!k) continue;
    var item = {};
    defs.forEach(function (h) {
      if (PRIVATE_FIELDS.indexOf(h.name) >= 0) return;
      var v = col[h.name] >= 0 ? values[r][col[h.name]] : "";
      if (v instanceof Date) v = Utilities.formatDate(v, tz, "yyyy-MM-dd");
      else if (h.kind === "number") v = (v === "" || v === null || v === undefined) ? null : Number(v);
      else v = String(v === null || v === undefined ? "" : v).trim();
      item[h.name] = v;
    });
    items.push(item);
  }
  return items;
}

/* ===================== 建表（只由擁有者手動執行） ===================== */
/**
 * 建立／補齊 costs、json、members、ledger 工作表的欄位與資料驗證。可重複執行（冪等）：
 *   - 工作表不存在才建立；已存在就沿用。
 *   - 只把「缺少的欄名」加到最右邊；既有欄位、順序、資料列、旅伴自己加的欄位都不動。
 *   - 重新套用下拉選單／數字／核取方塊驗證到第 2 列以下（不改動儲存格內容）。
 *   - 凍結第 1 列；表頭加上說明註解與「編輯前警告」保護（警告而非鎖定，擁有者仍可修改）。
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  // members 要在 ledger 之前，ledger 的 payer 下拉選單從 members 的 nick 欄取值
  [[SHEET_COSTS, COSTS_HEADERS], [SHEET_JSON, JSON_HEADERS], [SHEET_MEMBERS, MEMBERS_HEADERS], [SHEET_LEDGER, LEDGER_HEADERS]].forEach(function (pair) {
    var name = pair[0], defs = pair[1];
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); report.push("建立工作表 " + name); }
    var added = ensureHeaders_(sh, defs);
    if (added.length) report.push(name + " 新增欄位：" + added.join(", "));
    applyValidation_(ss, sh, defs);
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
function applyValidation_(ss, sh, defs) {
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
    } else if (d.kind === "date") {
      rule = SpreadsheetApp.newDataValidation().requireDate()
        .setAllowInvalid(false).setHelpText("請填日期，例如 2026-11-30").build();
    } else if (d.kind === "member") {
      var m = ss.getSheetByName(SHEET_MEMBERS);
      var mh = m.getRange(1, 1, 1, Math.max(m.getLastColumn(), 1)).getValues()[0].map(function (h) { return String(h).trim(); });
      var nc = mh.indexOf("nick") + 1;
      if (nc > 0) rule = SpreadsheetApp.newDataValidation().requireValueInRange(m.getRange(2, nc, Math.max(m.getMaxRows() - 1, 1), 1), true)
        .setAllowInvalid(false).setHelpText("請從 members 工作表的暱稱選擇").build();
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
