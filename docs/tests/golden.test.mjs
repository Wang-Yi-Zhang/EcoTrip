// 黃金檔測試：把沙巴行程在多組設定下的試算、行程檢查、比較、CSV、物種標籤結果，
// 與 docs/tests/golden/sabah2027.json 逐字比對。重構引擎後結果必須完全相同。
// 執行：node docs/tests/golden.test.mjs          （比對）
//       node docs/tests/golden.test.mjs --update （重建黃金檔；只有在刻意改變行為時才用）
// 投影（projection）使用與引擎欄位名稱無關的固定鍵名，因此引擎內部改名不影響比對，數值與文字才是比對對象。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.EcoCore;
const data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const pick = (...v) => v.find(x => x !== undefined);

// 同時提供新舊兩種設定鍵名：舊引擎讀 danumPlan／lastNight／fxUsd，新引擎讀 choices／rates。
function mkState(o) {
  const plan = o.plan || "brl", last = o.last || "ld";
  return { pax: o.pax ?? 4, rooms: o.rooms ?? 2, fx: o.fx ?? 7.2, fxUsd: 4.2, rates: { USD: 4.2 },
    danumPlan: plan, lastNight: last, choices: { danum_choice: plan, last_night_choice: last },
    scenario: o.scenario || "mid", contingencyPct: o.cont ?? 10, includeFlights: !!o.flights, includeExtras: !!o.extras,
    optionalOn: o.optionalOn || {}, overrides: o.overrides || {}, activity: o.activity || {} };
}
function projBudget(b) {
  return {
    ctx: { pax: b.ctx.pax, rooms: b.ctx.rooms, singles: b.ctx.singles, triples: b.ctx.triples,
      counted: pick(b.ctx.nightSafariNights, b.ctx.activityCount && b.ctx.activityCount.night_safari) },
    subtotal: b.subtotal, contingencyPct: b.contingencyPct, contingency: b.contingency, total: b.total,
    totalHome: pick(b.totalHome, b.totalTWD), perPerson: b.perPerson, perPersonHome: pick(b.perPersonHome, b.perPersonTWD),
    fixed: b.fixed, variable: b.variable,
    byCategory: Object.fromEntries(Object.entries(b.byCategory).map(([k, v]) => [k, { base: pick(v.base, v.myr), unpriced: v.unpriced }])),
    completeness: b.completeness, unpriced: b.unpriced.map(l => l.id),
    warnings: b.warnings.map(w => ({ level: w.level, code: w.code || null, msg: w.msg })),
    lines: b.lines.map(l => ({ id: l.id, name: l.name, category: l.category, unit: l.unit, unitLabel: l.unitLabel, currency: l.currency,
      unitPrice: l.unitPrice, qty: l.qty, qtyText: l.qtyText, base: pick(l.amountBase, l.amountMYR), home: pick(l.amountHome, l.amountTWD),
      status: l.status, baseStatus: l.baseStatus, active: l.active, fixed: l.fixed, paramError: l.paramError, optional: l.optional }))
  };
}
function projCompare(s) {
  if (C.compareDanum) { const c = C.compareDanum(data, s); return { total: { brl: c.brl.total, dvfc: c.dvfc.total }, cat: { brl: c.brlDanum, dvfc: c.dvfcDanum }, diff: c.diffTotal, comparable: c.comparable }; }
  const c = C.compareChoice(data, s, "danum_choice");
  return { total: { brl: c.options.brl.budget.total, dvfc: c.options.dvfc.budget.total }, cat: { brl: c.options.brl.categoryTotal, dvfc: c.options.dvfc.categoryTotal },
    diff: c.options.brl.budget.total - c.options.dvfc.budget.total, comparable: c.comparable };
}
function snapshot(o) {
  const s = mkState(o), sc = C.scenarios(data, s);
  return { budget: projBudget(C.computeBudget(data, s)), checks: C.checkItinerary(data, s).map(c => ({ level: c.level, code: c.code, day: c.day ?? null, msg: c.msg })),
    nights: C.lodgingNightsSummary(data, s), compare: projCompare(s), scenarios: { low: sc.low.total, mid: sc.mid.total, high: sc.high.total },
    csv: C.budgetCSV(C.computeBudget(data, s), data.sources.items) };
}

const cases = {};
for (const [pax, rooms] of [[4, 2], [2, 1], [6, 3], [3, 2], [1, 1], [5, 2]]) for (const plan of ["brl", "dvfc"]) for (const all of [false, true])
  cases[`pax${pax}-rooms${rooms}-${plan}-${all ? "all" : "core"}`] = { pax, rooms, plan, flights: all, extras: all };
Object.assign(cases, {
  "scenario-low": { scenario: "low", flights: true, extras: true }, "scenario-high": { scenario: "high", flights: true, extras: true, plan: "dvfc" },
  "last-kk": { last: "kk" }, "last-tbd": { last: "tbd" }, "cont0": { cont: 0 }, "fx68": { fx: 6.8, flights: true },
  "night4": { activity: { "d5-night": { choice: 1 } } }, "night-rest": { activity: { "d2-night": { choice: 2 }, "d3-night": { choice: 1 } } },
  "no-brl-transfer": { optionalOn: { brl_private_transfer: false } }, "dvfc-guide-on": { plan: "dvfc", optionalOn: { dvfc_private_guide: true, dvfc_private_transfer: false } },
  "override": { extras: true, overrides: { fees_permits: 50, tabin_single: 0 }, pax: 3, rooms: 2 },
  "status-override": { activity: { "d6-t1": { status: "confirmed" }, "d3-am": { status: "confirmed" } } }
});

const out = { cases: {}, static: {} };
for (const [k, o] of Object.entries(cases)) out.cases[k] = snapshot(o);
out.static.references = C.validateReferences(data);
out.static.datasetErrors = Object.fromEntries(C.DATASETS.map(k => [k, C.validateDataset(k, data[k])]));
out.static.categoryLabels = C.CATEGORY_LABEL || C.categoryLabels(data);
out.static.species = Object.fromEntries(data.species.items.map(sp => [sp.id, Object.fromEntries(Object.keys(sp.records).map(a => {
  const l = C.observabilityLabel(sp.records[a], sp.difficulty, null, !!sp.inat_obscured);
  return [a, { key: l.key, label: l.label, basis: l.basis, uncertainty: l.uncertainty, A: l.A, B: l.B }];
}))]));

const file = join(here, "golden", "sabah2027.json");
const text = JSON.stringify(out, null, 1) + "\n";
if (process.argv.includes("--update") || !existsSync(file)) {
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text);
  console.log(`已寫入黃金檔（${Object.keys(cases).length} 組設定，${text.length} 字元）`); process.exit(0);
}
const want = readFileSync(file, "utf8").replace(/\r\n/g, "\n");   // 不受 git 換行設定影響
if (want === text) { console.log(`✔ 黃金檔相符（${Object.keys(cases).length} 組設定）\n\n1 passed, 0 failed`); process.exit(0); }
const a = JSON.parse(want), diffs = [];
(function walk(x, y, p) {
  if (diffs.length >= 15) return;
  if (x && y && typeof x === "object" && typeof y === "object") { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + "/" + k); }
  else if (x !== y) diffs.push(`${p}\n    黃金檔：${JSON.stringify(x)}\n    目前：  ${JSON.stringify(y)}`);
})(a, out, "");
console.log("✘ 與黃金檔不符（列出前 15 處）：\n" + diffs.join("\n") + "\n\n0 passed, 1 failed"); process.exit(1);
