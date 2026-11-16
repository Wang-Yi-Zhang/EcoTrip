// gas/Code.gs 模擬測試：以記憶體中的假 SpreadsheetApp 執行 setupSheets() 與 doGet()。
// 執行：node docs/tests/gas.test.mjs
// 注意：這是模擬環境，只驗證程式邏輯；真實 Google 服務的行為（授權、CORS、配額）仍需實際部署確認。
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gasSrc = readFileSync(join(root, "gas", "Code.gs"), "utf8");
const html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const coreCtx = { globalThis: {} }; coreCtx.globalThis = coreCtx; vm.createContext(coreCtx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], coreCtx);
const C = coreCtx.EcoCore;
const data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const J = o => JSON.parse(JSON.stringify(o));

/* ---------- 假 SpreadsheetApp ---------- */
function makeSheet(name) {
  const cells = new Map(), notes = new Map(), validation = new Map(), protections = [];
  const key = (r, c) => r + "," + c;
  const sh = {
    name, frozen: 0, maxRows: 1000, maxCols: 26, cells, notes, validation, protections,
    getLastRow() { let m = 0; for (const [k, v] of cells) if (v !== "") m = Math.max(m, +k.split(",")[0]); return m; },
    getLastColumn() { let m = 0; for (const [k, v] of cells) if (v !== "") m = Math.max(m, +k.split(",")[1]); return m; },
    getMaxRows() { return this.maxRows; }, getMaxColumns() { return Math.max(this.maxCols, this.getLastColumn()); },
    setFrozenRows(n) { this.frozen = n; },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(cells.has(key(r + i, c + j)) ? cells.get(key(r + i, c + j)) : ""); out.push(row); } return out; },
        setValue(v) { cells.set(key(r, c), v); return this; },
        setFontWeight() { return this; },
        setNote(t) { notes.set(key(r, c), t); return this; },
        setDataValidation(rule) { validation.set(c, { rule, rows: nr, from: r }); return this; },
        protect() { const p = { desc: "", warn: false, setDescription(d) { this.desc = d; return this; }, setWarningOnly(w) { this.warn = w; return this; }, getDescription() { return this.desc; } }; protections.push(p); return p; }
      };
    },
    getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); },
    getProtections() { return protections; },
    writeRow(r, arr) { arr.forEach((v, j) => cells.set(key(r, j + 1), v)); }
  };
  return sh;
}
function makeEnv() {
  const sheets = new Map();
  const ss = { getSpreadsheetTimeZone: () => "Asia/Taipei", getSheetByName: n => sheets.get(n) || null, insertSheet: n => { const s = makeSheet(n); sheets.set(n, s); return s; } };
  const dv = () => { const r = { k: null }; const b = { requireValueInList(l) { r.k = "list"; r.list = l; return b; }, requireNumberGreaterThanOrEqualTo(n) { r.k = "num"; return b; }, requireCheckbox() { r.k = "bool"; return b; }, requireValueInRange(rg) { r.k = "range"; r.range = rg; return b; }, requireDate() { r.k = "date"; return b; }, setAllowInvalid(a) { r.allowInvalid = a; return b; }, setHelpText() { return b; }, build() { return r; } }; return b; };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: dv, ProtectionType: { RANGE: "RANGE" } },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Utilities: { formatDate: (d, tz, f) => { assert.equal(tz, "Asia/Taipei"); assert.equal(f, "yyyy-MM-dd"); return d.toISOString().slice(0, 10); } },
    Logger: { log() {} }, JSON, Date, String, Number, Math, Object, Array
  };
  vm.createContext(ctx); vm.runInContext(gasSrc, ctx);
  return { ctx, ss, sheets };
}
const headRow = sh => { const n = sh.getLastColumn(); return sh.getRange(1, 1, 1, n).getValues()[0]; };

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

t("Code.gs 第一行是 @OnlyCurrentDoc，且 doGet 與各讀取函式內沒有寫入呼叫", () => {
  assert.ok(gasSrc.startsWith("/** @OnlyCurrentDoc */"));
  const body = gasSrc.slice(gasSrc.indexOf("function doGet"), gasSrc.indexOf("function readCosts_"));
  const reader = gasSrc.slice(gasSrc.indexOf("function readCosts_"), gasSrc.indexOf("function setupSheets"));
  for (const w of ["setValue", "insertSheet", "setDataValidation", "protect(", "setNote", "openById", "doPost"]) { assert.ok(!body.includes(w), "doGet 含 " + w); assert.ok(!reader.includes(w), "readCosts_ 含 " + w); }
  assert.ok(!gasSrc.includes("function doPost"));
});
t("空白試算表：setupSheets 建立兩個工作表、完整表頭、凍結首列、套用驗證", () => {
  const { ctx, sheets } = makeEnv();
  ctx.setupSheets();
  const c = sheets.get("costs"), j = sheets.get("json");
  assert.deepEqual(J(headRow(c)), J(ctx.COSTS_HEADERS.map(h => h.name)));
  assert.deepEqual(J(headRow(j)), ["dataset", "json"]);
  assert.equal(c.frozen, 1);
  const unitCol = ctx.COSTS_HEADERS.findIndex(h => h.name === "unit") + 1;
  assert.equal(c.validation.get(unitCol).rule.k, "list"); assert.equal(c.validation.get(unitCol).rule.allowInvalid, false);
  assert.equal(c.protections.length, 1); assert.equal(c.protections[0].warn, true);
});
t("重複執行 setupSheets 為冪等：不新增欄位、不重複保護", () => {
  const { ctx, sheets } = makeEnv();
  ctx.setupSheets(); const before = J(headRow(sheets.get("costs")));
  const msg = ctx.setupSheets();
  assert.deepEqual(J(headRow(sheets.get("costs"))), before);
  assert.equal(sheets.get("costs").protections.length, 1);
  assert.ok(msg.includes("未做任何變更"));
});
t("既有工作表（缺欄位、順序不同、有自訂欄與資料）：只把缺少的欄名加到最右邊，資料不動", () => {
  const { ctx, ss, sheets } = makeEnv();
  const sh = ss.insertSheet("costs");
  sh.writeRow(1, ["name", "id", "旅伴備註", "price", "status", "unit", "category"]);
  sh.writeRow(2, ["Tabin base", "tabin_base", "阿明負責問", 5100, "quoted", "per_person", "per_person"]);
  ctx.setupSheets();
  const h = headRow(sheets.get("costs"));
  assert.deepEqual(J(h.slice(0, 7)), ["name", "id", "旅伴備註", "price", "status", "unit", "category"]);
  assert.equal(h.length, 7 + ctx.COSTS_HEADERS.length - 6);
  assert.deepEqual(J(sh.getRange(2, 1, 1, 7).getValues()[0]), ["Tabin base", "tabin_base", "阿明負責問", 5100, "quoted", "per_person", "per_person"]);
});
t("單一來源：Code.gs 的 ALLOWED 與網站 EcoCore.allowedValues(data) 逐項相同（10 個欄位）", () => {
  const { ctx } = makeEnv(), want = J(C.allowedValues(data)), got = J(ctx.ALLOWED);
  assert.deepEqual(Object.keys(got).sort(), Object.keys(want).sort());
  for (const k of Object.keys(want)) assert.deepEqual([...got[k]].sort(), [...want[k]].sort(), `${k} 不一致：請執行 node tools/gas-allowed.mjs --write`);
  // 下拉選得到的每個 applies／when／幣別，網站的參照檢查都要接受
  for (const [field, vals] of [["applies", got.applies], ["when", got.when], ["price_currency", got.price_currency]]) for (const v of vals) {
    const d = J(data); d.costs.items[0][field] = v; assert.deepEqual(J(C.validateReferences(d)), [], `${field}=${v}`);
  }
});
t("下拉允許值與網站驗證一致（unit / status / category / 幣別/ qty_from）", () => {
  const { ctx } = makeEnv();
  const units = Object.keys(C.UNIT_LABEL).filter(u => u !== "percent");
  assert.deepEqual([...ctx.ALLOWED.unit].sort(), units.sort());
  assert.deepEqual([...ctx.ALLOWED.category].sort(), Object.keys(C.categoryLabels(data)).sort());
  assert.deepEqual([...ctx.ALLOWED.dataset].sort(), [...C.DATASETS].sort());
  // status：網站接受的每個值都能從下拉選到，且下拉沒有網站不接受的值
  const bad = J(data.costs); for (const s of ctx.ALLOWED.status) { bad.items[0].status = s; bad.items[0].price = s === "unquoted" ? null : 1; assert.deepEqual(J(C.validateDataset("costs", bad)), [], s); }
  for (const k of ctx.ALLOWED.qty_from) { const d = J(data.costs); d.items[0].qty = { nights_from: k }; assert.deepEqual(J(C.validateDataset("costs", d)), [], k); }
});
t("往返測試：內建 costs 寫入試算表 → doGet → 通過網站驗證，且試算結果與內建資料相同", () => {
  const { ctx, sheets } = makeEnv();
  ctx.setupSheets();
  const sh = sheets.get("costs"), names = ctx.COSTS_HEADERS.map(h => h.name);
  data.costs.items.forEach((it, i) => {
    const p = it.price, q = it.qty || {};
    const row = { id: it.id, name: it.name, category: it.category, unit: it.unit,
      price: typeof p === "number" ? p : "", price_low: p && typeof p === "object" ? p.low : "", price_mid: p && typeof p === "object" ? p.mid : "", price_high: p && typeof p === "object" ? p.high : "",
      price_currency: it.price_currency || "", status: it.status, applies: it.applies, when: it.when || "", default_on: it.default_on === undefined ? "" : it.default_on,
      qty_days: q.days ?? "", qty_nights: q.nights ?? "", qty_trips: q.trips ?? "", qty_nights_from: q.nights_from || "", qty_rooms_from: q.rooms_from || "",
      quoted_nights: it.quoted_nights ?? "", count_label: it.count_label || "", days_check: it.days_check ? JSON.stringify(it.days_check) : "", notes: it.notes || "", includes: (it.includes || []).join(";"), excludes: (it.excludes || []).join(";"), assumption: it.assumption || "",
      source_ids: (it.source_ids || []).join(";"), duplicate_risk: (it.duplicate_risk || []).join(";"), itinerary_check: it.itinerary_check ? JSON.stringify(it.itinerary_check) : "" };
    sh.writeRow(i + 2, names.map(n => row[n]));
  });
  const env = JSON.parse(ctx.doGet({}).text);
  assert.equal(env.errors, undefined, JSON.stringify(env.errors));
  const v = C.validateEnvelope(env);
  assert.equal(v.ok, true, JSON.stringify(v.errors)); assert.ok(v.accepted.costs);
  const merged = { ...data, costs: { ...v.accepted.costs, compare: data.costs.compare, categories: data.costs.categories } };
  assert.deepEqual(J(C.validateReferences(merged)), []);
  for (const st of [{ pax: 4, rooms: 2 }, { pax: 3, rooms: 2, choices: { last_night_choice: "ld" } }, { pax: 6, rooms: 3, includeExtras: true, includeFlights: true, scenario: "high" }]) {
    const s = { fx: 7.2, rates: { USD: 4.2 }, choices: { last_night_choice: "ld" }, scenario: "mid", contingencyPct: 10, includeFlights: false, includeExtras: false, optionalOn: {}, overrides: {}, activity: {}, ...st };
    const a = C.computeBudget(data, s), b = C.computeBudget(merged, s);
    assert.ok(Math.abs(a.total - b.total) < 1e-6, `${JSON.stringify(st)}: ${a.total} vs ${b.total}`);
    assert.equal(a.unpriced.length, b.unpriced.length);
  }
  // 行程檢查的訊息也要逐字相同（count_label、days_check 經試算表往返後不能遺失）
  for (const ch of [{ last_night_choice: "ld" }, { last_night_choice: "kk" }]) {
    const s2 = { pax: 4, rooms: 2, choices: ch, optionalOn: {}, activity: { "d5-night": { choice: 1 } } };
    assert.deepEqual(J(C.checkItinerary(merged, s2)), J(C.checkItinerary(data, s2)));
  }
  // 費用明細的每一行（名稱、單價、數量、金額、狀態、包含／不含、假設、補充說明、來源、重複風險）也要逐欄相同
  const sAll = { pax: 3, rooms: 2, fx: 7.2, rates: { USD: 4.2 }, choices: { last_night_choice: "ld" }, scenario: "mid", contingencyPct: 10, includeFlights: true, includeExtras: true, optionalOn: {}, overrides: {}, activity: {} };
  assert.deepEqual(J(C.computeBudget(merged, sAll).lines), J(C.computeBudget(data, sAll).lines));
  assert.ok(C.checkItinerary(merged, { choices: { last_night_choice: "ld" }, optionalOn: { dvfc_private_transfer: false }, activity: {} }).some(c => c.code === "feasibility"));
});
t("json 工作表：略過表頭列；壞 JSON 回報錯誤但不影響其他資料集", () => {
  const { ctx, sheets } = makeEnv();
  ctx.setupSheets();
  const j = sheets.get("json");
  j.writeRow(2, ["trip", JSON.stringify(data.trip)]);
  j.writeRow(3, ["essentials", "{壞掉"]);
  const env = JSON.parse(ctx.doGet({}).text);
  assert.ok(env.data.trip); assert.ok(!env.data.essentials); assert.ok(!env.data.dataset);
  assert.ok(env.errors.some(e => e.includes("essentials")));
  assert.ok(!env.data.costs, "只有表頭的 costs 工作表不應回傳空的 costs（否則會蓋掉網站全部費用）");
});
t("核取方塊讓空白列看起來有資料時，doGet 不回傳空的 costs（2026-11-12 實際部署發現）", () => {
  const { ctx, sheets } = makeEnv();
  ctx.setupSheets();
  const sh = sheets.get("costs"), col = ctx.COSTS_HEADERS.findIndex(h => h.name === "default_on") + 1;
  for (let r = 2; r <= 50; r++) sh.getRange(r, col).setValue(false);      // 核取方塊欄：空白列的值是 false，不是空字串
  assert.ok(sh.getLastRow() >= 2);
  const env = JSON.parse(ctx.doGet({}).text);
  assert.ok(!env.data.costs, "不應回傳沒有任何項目的 costs");
});
t("costs 缺欄位時 doGet 回報要執行 setupSheets", () => {
  const { ctx, ss } = makeEnv();
  const sh = ss.insertSheet("costs");
  sh.writeRow(1, ["id", "name", "category", "unit", "price", "status"]);
  sh.writeRow(2, ["x", "X", "other", "per_group", 1, "estimate"]);
  const env = JSON.parse(ctx.doGet({}).text);
  assert.ok(env.errors.some(e => e.includes("setupSheets")));
});
t("內建資料集單格長度低於 50,000 字元上限", () => {
  for (const [k, v] of Object.entries(data)) assert.ok(JSON.stringify(v).length < 50000, `${k} ${JSON.stringify(v).length}`);
});

t("試算表工具可用在另一趟旅行（--trip）：依該行程的分類、幣別產生下拉允許值與可貼上的費用表", () => {
  const dir = "_test_trip_tools", abs = join(root, dir), node = process.execPath, run = (...a) => execFileSync(node, a, { cwd: root, encoding: "utf8" });
  try {
    mkdirSync(abs, { recursive: true });
    run(join(root, "tools", "build-trip.mjs"), join(root, "docs", "tests", "fixtures", "contrast-trip.json"), join(abs, "index.html"));
    const before = readFileSync(join(root, "gas", "Code.gs"), "utf8");
    run(join(root, "tools", "gas-allowed.mjs"), "--trip", dir, "--write");
    assert.equal(readFileSync(join(root, "gas", "Code.gs"), "utf8"), before, "不可改到沙巴的 gas/Code.gs");
    const g = { JSON, Date, String, Number, Math, Object, Array }; vm.createContext(g); vm.runInContext(readFileSync(join(abs, "Code.gs"), "utf8"), g);
    assert.deepEqual(J(g.ALLOWED.category), ["stay", "move", "food"]); assert.deepEqual(J(g.ALLOWED.price_currency), ["JPY"]);
    assert.deepEqual(J(g.ALLOWED.applies), J(C.BUILTIN_APPLIES)); assert.deepEqual(J(g.ALLOWED.when), ["singles"]);
    assert.deepEqual(J(g.COSTS_HEADERS.map(h => h.name)), J(makeEnv().ctx.COSTS_HEADERS.map(h => h.name)), "欄位定義應與範本相同");
    const msg = run(join(root, "tools", "sheet-export.mjs"), "--trip", dir);
    assert.ok(msg.includes(dir + "/costs-for-sheet.tsv"), msg);
    const rows = readFileSync(join(abs, "costs-for-sheet.tsv"), "utf8").trim().split("\r\n").map(r => r.split("\t"));
    assert.deepEqual(rows[0], J(g.COSTS_HEADERS.map(h => h.name))); assert.equal(rows.length, 1 + 5);
    const col = n => rows[0].indexOf(n), tea = rows.find(r => r[0] === "tea"), museum = rows.find(r => r[0] === "museum");
    assert.equal(tea[col("price")], "1500"); assert.equal(tea[col("qty_nights_from")], "activity_count"); assert.equal(tea[col("count_label")], "茶席");
    assert.equal(museum[col("price")], "", "未報價要留空，不是 0"); assert.equal(museum[col("status")], "unquoted"); assert.equal(museum[col("default_on")], "TRUE");
  } finally { if (existsSync(abs)) rmSync(abs, { recursive: true, force: true }); }
});

/* ---------- 代墊與付款管理（SDD-002 第 3 步）：members、ledger 工作表 ---------- */
const M_ROWS = [["A", "r1", "active", "", "L003"], ["B", "r1", "", "", ""], ["C", "r2", "", "", ""], ["D", "r2", "withdrawn", new Date(Date.UTC(2026, 11, 1)), ""]];
const dt = (y, m, dd) => new Date(Date.UTC(y, m - 1, dd));
// 欄位順序：id date type payer to rooms amount currency home_actual cost_id vendor_due repay_due evidence ref_id note
const L_ROWS = [
  ["P1", dt(2026, 11, 16), "plan", "A", "all", "", 10200, "MYR", "", "dvfc_package", dt(2026, 11, 30), "", "", "", "私人：訂位代號寫在這裡也不會外流"],
  ["L001", dt(2026, 11, 15), "payment", "A", "all", "", 68357.6, "TWD", "", "intl_flight", "", "", "確認信", "", ""],
  ["L002", dt(2026, 11, 15), "share", "", "A", "", 17570.62, "", "", "", "", "", "", "L001", ""],
  ["L003", dt(2026, 11, 15), "share", "", "B;C;D", "", 50786.98, "", "", "", "", "", "", "L001", ""],
  ["L004", dt(2026, 11, 20), "payment", "A", "all", "", 3000, "MYR", 25800, "", "", dt(2026, 11, 22), "", "P1", ""],
  ["L005", dt(2026, 11, 21), "repayment", "B", "A", "", 5000, "TWD", "", "", "", "", "", "", ""],
  ["L006", dt(2026, 11, 14), "payment", "A", "all", "A;B;C;D", 1800, "TWD", "", "", "", "", "訂房確認", "", ""],
  ["L007", dt(2026, 11, 14), "payment", "A", "all", "A;B|C;D", 3000, "MYR", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
];
function ledgerEnv() {
  const env = makeEnv(); env.ctx.setupSheets();
  const m = env.sheets.get("members"), l = env.sheets.get("ledger");
  M_ROWS.forEach((r, i) => m.writeRow(i + 2, r)); L_ROWS.forEach((r, i) => l.writeRow(i + 2, r));
  return env;
}
const ledgerOpts = { home: "TWD", base: "MYR", fx: 8.563, rates: { USD: 3.872 }, today: "2026-11-25", costs: data.costs.items };
t("setupSheets 建立 members、ledger：表頭、下拉（類型／狀態／幣別）、日期驗證、付款人從 members 選", () => {
  const { ctx, sheets } = makeEnv(); ctx.setupSheets();
  const m = sheets.get("members"), l = sheets.get("ledger");
  assert.deepEqual(J(headRow(m)), ["nick", "room", "status", "withdrawn_on", "confirmed_through"]);
  assert.deepEqual(J(headRow(l)), ["id", "date", "type", "payer", "to", "rooms", "amount", "currency", "home_actual", "cost_id", "vendor_due", "repay_due", "evidence", "ref_id", "note"]);
  const col = (sh, n) => headRow(sh).indexOf(n) + 1, rule = (sh, n) => sh.validation.get(col(sh, n)).rule;
  assert.deepEqual(J(rule(l, "type").list), J(C.LEDGER_TYPES)); assert.equal(rule(l, "type").allowInvalid, false);
  assert.deepEqual(J(rule(m, "status").list), ["active", "withdrawn"]);
  assert.deepEqual(J(rule(l, "currency").list), J(C.allowedValues(data).price_currency));
  for (const n of ["date", "vendor_due", "repay_due"]) assert.equal(rule(l, n).k, "date", n);
  assert.equal(rule(m, "withdrawn_on").k, "date");
  assert.equal(rule(l, "payer").k, "range"); assert.equal(rule(l, "amount").k, "num"); assert.equal(rule(l, "home_actual").k, "num");
  assert.equal(m.frozen, 1); assert.equal(l.frozen, 1); assert.equal(l.protections.length, 1);
  assert.ok(ctx.setupSheets().includes("未做任何變更"));
});
t("doGet 回傳 members、ledger：日期轉成 yyyy-MM-dd、空白列略過、數字留空變 null", () => {
  const { ctx } = ledgerEnv();
  const env = JSON.parse(ctx.doGet({}).text);
  assert.equal(env.errors, undefined, JSON.stringify(env.errors));
  assert.deepEqual(env.data.members.items.map(x => x.nick), ["A", "B", "C", "D"]);
  assert.equal(env.data.members.items[3].withdrawn_on, "2026-12-01");
  assert.equal(env.data.ledger.items.length, 8);
  assert.equal(env.data.ledger.items[7].rooms, "A;B|C;D");
  const p1 = env.data.ledger.items[0];
  assert.equal(p1.date, "2026-11-16"); assert.equal(p1.vendor_due, "2026-11-30"); assert.equal(p1.home_actual, null); assert.equal(p1.amount, 10200);
  assert.equal(env.data.ledger.items[4].home_actual, 25800);
});
t("隱私：note 欄與旅伴自己加的欄位都不會回傳", () => {
  const { ctx, sheets } = ledgerEnv();
  const m = sheets.get("members"), l = sheets.get("ledger");
  m.getRange(1, 6).setValue("本名"); m.getRange(2, 6).setValue("不該外流的本名");
  l.getRange(1, 16).setValue("卡號末四碼"); l.getRange(2, 16).setValue("1234");
  const text = ctx.doGet({}).text;
  for (const w of ["私人", "訂位代號", "本名", "不該外流", "卡號", "1234"]) assert.ok(!text.includes(w), "回傳內容含 " + w);
  const env = JSON.parse(text);
  for (const it of env.data.ledger.items) assert.ok(!("note" in it));
  assert.deepEqual(Object.keys(env.data.members.items[0]).sort(), ["confirmed_through", "nick", "room", "status", "withdrawn_on"]);
});
t("往返測試：試算表 → doGet → computeLedger，與直接用原始資料算的結果相同", () => {
  const { ctx } = ledgerEnv();
  const env = JSON.parse(ctx.doGet({}).text);
  const iso = v => v instanceof Date ? v.toISOString().slice(0, 10) : v;
  const keys = ["id", "date", "type", "payer", "to", "rooms", "amount", "currency", "home_actual", "cost_id", "vendor_due", "repay_due", "evidence", "ref_id"];
  const direct = { items: L_ROWS.map(r => Object.fromEntries(keys.map((k, i) => [k, iso(r[i])]))) };
  const mem = { items: M_ROWS.map(r => ({ nick: r[0], room: r[1], status: r[2], withdrawn_on: iso(r[3]), confirmed_through: r[4] })) };
  const a = J(C.computeLedger(env.data.members, env.data.ledger, ledgerOpts)), b = J(C.computeLedger(mem, direct, ledgerOpts));
  assert.deepEqual(a, b);
  assert.deepEqual(a.warnings, []);
  assert.equal(a.members.reduce((s, x) => s + x.net, 0), 0);
  assert.equal(a.plans[0].remaining, 7200);
  assert.deepEqual(J(a.pending.A), ["L004", "L005", "L006", "L007"]);
  // 網站把帳本放在 v.ledger，不和行程資料混在一起
  const v = C.validateEnvelope(env);
  assert.ok(v.ok); assert.ok(v.ledger.members && v.ledger.ledger); assert.ok(!v.ignored.includes("ledger")); assert.ok(!v.accepted.ledger);
});
t("members、ledger 只有表頭：doGet 不回傳這兩個資料集", () => {
  const { ctx } = makeEnv(); ctx.setupSheets();
  const env = JSON.parse(ctx.doGet({}).text);
  assert.ok(!env.data.members); assert.ok(!env.data.ledger);
});
t("ledger 缺欄位時 doGet 回報要執行 setupSheets", () => {
  const { ctx, ss } = makeEnv();
  const sh = ss.insertSheet("ledger"); sh.writeRow(1, ["id", "date", "type"]); sh.writeRow(2, ["L1", "2026-11-01", "payment"]);
  const env = JSON.parse(ctx.doGet({}).text);
  assert.ok(env.errors.some(e => e.includes("ledger") && e.includes("setupSheets")), JSON.stringify(env.errors));
});
t("Code.gs 檔頭寫明帳本只放暱稱、note 不回傳", () => {
  const head = gasSrc.slice(0, gasSrc.indexOf("var SHEET_COSTS"));
  assert.ok(head.includes("只放暱稱")); assert.ok(head.includes("note"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
