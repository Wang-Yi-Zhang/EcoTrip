// 把 index.html 內建的費用資料轉成可以直接貼進 Google 試算表 costs 工作表的檔案，並可檢查已部署的端點。
// 用法：
//   node tools/sheet-export.mjs                產生 gas/costs-for-sheet.tsv（含表頭列，欄位順序與 Code.gs 的 COSTS_HEADERS 相同）
//   node tools/sheet-export.mjs --check <網址>  讀取已部署的 /exec 網址，用網站同一套規則驗證，並和內建資料比對試算結果
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([^]*?)<\/script>/)[1], ctx);
const C = ctx.EcoCore, data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([^]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const gas = { JSON, Date, String, Number, Math, Object, Array }; vm.createContext(gas);
vm.runInContext(readFileSync(join(root, "gas", "Code.gs"), "utf8"), gas);
const headers = gas.COSTS_HEADERS.map(h => h.name);

const ci = process.argv.indexOf("--check");
if (ci < 0) {
  const cell = v => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  const rows = [headers.join("\t")];
  for (const it of data.costs.items) {
    const p = it.price, q = it.qty || {}, obj = p && typeof p === "object";
    const row = { id: it.id, name: it.name, category: it.category, unit: it.unit,
      price: typeof p === "number" ? p : "", price_low: obj ? p.low : "", price_mid: obj ? p.mid : "", price_high: obj ? p.high : "",
      price_currency: it.price_currency || "", status: it.status, applies: it.applies, when: it.when || "",
      default_on: it.default_on === undefined ? "FALSE" : it.default_on ? "TRUE" : "FALSE",
      qty_days: q.days ?? "", qty_nights: q.nights ?? "", qty_trips: q.trips ?? "", qty_nights_from: q.nights_from || "", qty_rooms_from: q.rooms_from || "",
      quoted_nights: it.quoted_nights ?? "", count_label: it.count_label || "", days_check: it.days_check ? JSON.stringify(it.days_check) : "", notes: it.notes || "", includes: (it.includes || []).join("; "), excludes: (it.excludes || []).join("; "), assumption: it.assumption || "",
      source_ids: (it.source_ids || []).join("; "), duplicate_risk: (it.duplicate_risk || []).join("; "), itinerary_check: it.itinerary_check ? JSON.stringify(it.itinerary_check) : "" };
    const unknown = headers.filter(h => !(h in row)); if (unknown.length) throw new Error("Code.gs 有這裡沒處理的欄位：" + unknown.join(", "));
    rows.push(headers.map(h => cell(row[h])).join("\t"));
  }
  const out = join(root, "gas", "costs-for-sheet.tsv");
  writeFileSync(out, rows.join("\r\n") + "\r\n");
  // 試算表不維護、由網站內建沿用的欄位：提醒使用者
  const known = new Set(["id", "name", "category", "unit", "qty", "price", "price_currency", "status", "applies", "when", "default_on", "quoted_nights", "count_label", "days_check", "notes", "includes", "excludes", "assumption", "source_ids", "duplicate_risk", "itinerary_check"]);
  const notInSheet = [...new Set(data.costs.items.flatMap(i => Object.keys(i)))].filter(k => !known.has(k));
  console.log(`已產生 gas/costs-for-sheet.tsv：${data.costs.items.length} 個費用項目、${headers.length} 欄（含表頭列）`);
  if (notInSheet.length) console.log(`注意：試算表沒有這些欄位，改用遠端資料後它們會消失：${notInSheet.join("、")}`);
  process.exit(0);
}

const url = process.argv[ci + 1];
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url || "")) { console.error("請提供結尾是 /exec 的 Apps Script 網址"); process.exit(2); }
const res = await fetch(url, { redirect: "follow" });
const text = await res.text();
let env; try { env = JSON.parse(text); } catch (e) { console.error("端點回應不是 JSON（可能是登入頁：部署的「誰可以存取」要選「任何人」）。開頭：" + text.slice(0, 120)); process.exit(1); }
console.log(`端點回應：schema=${env.schema}，updated_at=${env.updated_at}，資料集=${Object.keys(env.data || {}).join(", ") || "（無）"}`);
if (env.errors) console.log("試算表端回報的問題：\n- " + env.errors.join("\n- "));
const v = C.validateEnvelope(env);
if (v.errors.length) console.log("網站驗證不通過：\n- " + v.errors.join("\n- "));
if (!v.accepted || !v.accepted.costs) { console.log("結果：網站不會採用遠端 costs（沒有資料或驗證失敗），會繼續使用內建資料。"); process.exit(v.ok ? 0 : 1); }
if (!v.accepted.costs.items.length) { console.log("結果：costs 工作表沒有任何費用列。網站讀到空的費用表會因參照錯誤而拒收，繼續使用內建資料。請先貼入費用資料。"); process.exit(1); }
const merged = { ...data, ...v.accepted, costs: { ...v.accepted.costs } };
for (const k of ["compare", "categories", "quoted_label", "toggle_labels"]) if (merged.costs[k] == null) merged.costs[k] = data.costs[k];
const refs = C.validateReferences(merged);
if (refs.length) { console.log("合併後參照錯誤（網站會整份退回內建資料）：\n- " + refs.join("\n- ")); process.exit(1); }
const state = { pax: data.trip.default_pax, rooms: data.trip.default_rooms || 2, fx: data.trip.default_fx, rates: C.currencyOf(data).defaultRates, choices: {}, scenario: "mid", contingencyPct: 10, includeFlights: true, includeExtras: true, optionalOn: {}, overrides: {}, activity: {} };
let same = true;
for (const c of C.choiceDefs(data).filter(c => c.compare_category)) for (const o of c.options) {
  const st = { ...state, choices: { [c.id]: o.key } }, a = C.computeBudget(data, st), b = C.computeBudget(merged, st);
  const diff = b.lines.filter(l => { const x = a.lines.find(y => y.id === l.id); return !x || x.amountBase !== l.amountBase || x.active !== l.active; }).map(l => l.id);
  const gone = a.lines.filter(l => !b.lines.some(y => y.id === l.id)).map(l => l.id);
  console.log(`${c.label}＝${o.label}：內建 ${Math.round(a.total)}，試算表 ${Math.round(b.total)}${diff.length || gone.length ? "　不同的項目：" + diff.concat(gone.map(g => g + "（試算表沒有）")).join(", ") : "　相同"}`);
  if (diff.length || gone.length) same = false;
}
console.log(same ? "結果：試算表的費用與內建資料算出來完全相同，可以在網站切換為遠端資料。" : "結果：試算表與內建資料不同。如果是你刻意修改的價格，這是預期的；否則請檢查上面列出的項目。");
