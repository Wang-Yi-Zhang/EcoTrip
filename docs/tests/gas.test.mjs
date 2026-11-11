// gas/Code.gs 模擬測試：以記憶體中的假 SpreadsheetApp 執行 setupSheets() 與 doGet()。
// 執行：node docs/tests/gas.test.mjs
// 注意：這是模擬環境，只驗證程式邏輯；真實 Google 服務的行為（授權、CORS、配額）仍需實際部署確認。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gasSrc = readFileSync(join(root, "gas", "Code.gs"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
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
  const ss = { getSheetByName: n => sheets.get(n) || null, insertSheet: n => { const s = makeSheet(n); sheets.set(n, s); return s; } };
  const dv = () => { const r = { k: null }; const b = { requireValueInList(l) { r.k = "list"; r.list = l; return b; }, requireNumberGreaterThanOrEqualTo(n) { r.k = "num"; return b; }, requireCheckbox() { r.k = "bool"; return b; }, setAllowInvalid(a) { r.allowInvalid = a; return b; }, setHelpText() { return b; }, build() { return r; } }; return b; };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: dv, ProtectionType: { RANGE: "RANGE" } },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} }, JSON, Date, String, Number, Math, Object, Array
  };
  vm.createContext(ctx); vm.runInContext(gasSrc, ctx);
  return { ctx, ss, sheets };
}
const headRow = sh => { const n = sh.getLastColumn(); return sh.getRange(1, 1, 1, n).getValues()[0]; };

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

t("Code.gs 第一行是 @OnlyCurrentDoc，且 doGet 內沒有寫入呼叫", () => {
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
t("下拉允許值與網站驗證一致（unit / status / category / 幣別 / qty_from）", () => {
  const { ctx } = makeEnv();
  const units = Object.keys(C.UNIT_LABEL).filter(u => u !== "percent");
  assert.deepEqual([...ctx.ALLOWED.unit].sort(), units.sort());
  assert.deepEqual([...ctx.ALLOWED.category].sort(), Object.keys(C.CATEGORY_LABEL).sort());
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
      quoted_nights: it.quoted_nights ?? "", includes: (it.includes || []).join(";"), excludes: (it.excludes || []).join(";"), assumption: it.assumption || "",
      source_ids: (it.source_ids || []).join(";"), duplicate_risk: (it.duplicate_risk || []).join(";"), itinerary_check: it.itinerary_check ? JSON.stringify(it.itinerary_check) : "" };
    sh.writeRow(i + 2, names.map(n => row[n]));
  });
  const env = JSON.parse(ctx.doGet({}).text);
  assert.equal(env.errors, undefined, JSON.stringify(env.errors));
  const v = C.validateEnvelope(env);
  assert.equal(v.ok, true, JSON.stringify(v.errors)); assert.ok(v.accepted.costs);
  const merged = { ...data, costs: { ...v.accepted.costs, compare: data.costs.compare } };
  assert.deepEqual(J(C.validateReferences(merged)), []);
  for (const st of [{ pax: 4, rooms: 2 }, { pax: 3, rooms: 2, danumPlan: "dvfc" }, { pax: 6, rooms: 3, includeExtras: true, includeFlights: true, scenario: "high" }]) {
    const s = { fx: 7.2, fxUsd: 4.2, danumPlan: "brl", scenario: "mid", contingencyPct: 10, includeFlights: false, includeExtras: false, optionalOn: {}, overrides: {}, activity: {}, lastNight: "ld", ...st };
    const a = C.computeBudget(data, s), b = C.computeBudget(merged, s);
    assert.ok(Math.abs(a.total - b.total) < 1e-6, `${JSON.stringify(st)}: ${a.total} vs ${b.total}`);
    assert.equal(a.unpriced.length, b.unpriced.length);
  }
  assert.ok(C.checkItinerary(merged, { danumPlan: "brl", optionalOn: { brl_private_transfer: false }, activity: {}, lastNight: "ld" }).some(c => c.code === "feasibility"));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
