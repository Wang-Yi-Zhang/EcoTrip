// 核心邏輯單元測試：直接從 index.html 抽出 core-js 與內建資料執行。
// 執行：node docs/tests/core.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const core = html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1];
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(core, ctx);
const C = ctx.EcoCore;
const data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const clone = o => JSON.parse(JSON.stringify(o));
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m); // vm 跨 realm 陣列需先序列化
const base = { pax: 4, rooms: 2, fx: 7.2, fxUsd: 4.2, danumPlan: "brl", scenario: "mid", contingencyPct: 0, includeFlights: false, includeExtras: false, optionalOn: {}, overrides: {}, activity: {}, lastNight: "ld" };
const tabinIds = ["tabin_base", "river_surcharge", "private_guide", "private_vehicle", "private_transfer", "night_safari"];
const tabinSum = b => b.lines.filter(l => tabinIds.includes(l.id)).reduce((a, l) => a + l.amountMYR, 0);
const line = (b, id) => b.lines.find(l => l.id === id);

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

t("資料集齊全且通過格式驗證", () => {
  for (const k of C.DATASETS) { assert.ok(data[k], "缺 " + k); eq(C.validateDataset(k, data[k]), [], k); }
});
t("資料參照完整（行程→地點／物種／費用、來源）", () => eq(C.validateReferences(data), []));
t("4 人預設：Tabin 報價合計 RM 26,320（與業者信件一致）", () => {
  const b = C.computeBudget(data, base);
  assert.equal(tabinSum(b), 26320);
  assert.equal(b.ctx.nightSafariNights, 3);
});
t("2 人（1 房）：Tabin 合計 RM 14,240，每人分攤固定成本變高", () => {
  const b = C.computeBudget(data, { ...base, pax: 2, rooms: 1 });
  assert.equal(tabinSum(b), 5100 * 2 + 250 * 2 + 270 * 4 + 270 * 4 + 300 * 2 + 130 * 2 * 3);
  assert.equal(tabinSum(b), 14240);
  assert.equal(b.ctx.singles, 0);
});
t("6 人（3 房）：Tabin 合計 RM 38,400", () => {
  const b = C.computeBudget(data, { ...base, pax: 6, rooms: 3 });
  assert.equal(tabinSum(b), 38400);
});
t("3 人 2 房：出現單人房，差額為未報價（null，不是 0）且列入未估價", () => {
  const b = C.computeBudget(data, { ...base, pax: 3, rooms: 2 });
  const s = line(b, "tabin_single");
  assert.equal(b.ctx.singles, 1); assert.equal(s.active, true); assert.equal(s.amountMYR, null);
  assert.ok(b.unpriced.some(l => l.id === "tabin_single"));
  assert.ok(b.warnings.some(w => w.msg.includes("單人入住")));
});
t("匯率變更：TWD = MYR × 匯率", () => {
  const b1 = C.computeBudget(data, { ...base, fx: 7.2 }), b2 = C.computeBudget(data, { ...base, fx: 6.8 });
  assert.equal(b1.total, b2.total);
  assert.ok(Math.abs(b2.totalTWD - b2.total * 6.8) < 1e-6);
  assert.ok(Math.abs(b1.perPersonTWD - b1.total * 7.2 / 4) < 1e-6);
});
t("TWD 計價項目（國際機票）換算成 MYR", () => {
  const b = C.computeBudget(data, { ...base, includeFlights: true });
  const f = line(b, "intl_flight");
  assert.equal(f.amountTWD, 20000 * 4); assert.ok(Math.abs(f.amountMYR - 80000 / 7.2) < 1e-6);
});
t("BRL／DVFC 切換：只啟用所選方案，另一方案不計入", () => {
  const b = C.computeBudget(data, { ...base, danumPlan: "brl" }), d = C.computeBudget(data, { ...base, danumPlan: "dvfc" });
  assert.equal(line(b, "brl_package").active, true); assert.equal(line(b, "dvfc_package").active, false);
  assert.equal(line(d, "brl_package").active, false); assert.equal(line(d, "dvfc_package").active, true);
});
t("重複計費檢查：Base Package 與私人嚮導／夜遊同時啟用時提出警告", () => {
  const b = C.computeBudget(data, base);
  assert.ok(b.warnings.filter(w => w.code === "duplicate").length >= 2);
});
t("每個費用項目都只出現一次（id 不重複）", () => {
  const ids = data.costs.items.map(i => i.id); assert.equal(new Set(ids).size, ids.length);
});
t("行程改選第 4 晚私人夜遊 → 夜遊 4 晚、金額 RM 2,080，並提醒與報價晚數不符", () => {
  const st = { ...base, activity: { "d5-night": { choice: 1 } } };
  const b = C.computeBudget(data, st);
  assert.equal(b.ctx.nightSafariNights, 4); assert.equal(line(b, "night_safari").amountMYR, 2080);
  assert.ok(C.checkItinerary(data, st).some(c => c.code === "quote" && c.msg.includes("4 晚")));
});
t("預備金 10%", () => {
  const b = C.computeBudget(data, { ...base, contingencyPct: 10 });
  assert.ok(Math.abs(b.contingency - b.subtotal * 0.1) < 1e-6); assert.ok(Math.abs(b.total - b.subtotal * 1.1) < 1e-6);
});
t("低／中／高情境：報價項目不變，示範項目改變", () => {
  const s = C.scenarios(data, { ...base, includeExtras: true });
  assert.equal(tabinSum(s.low), tabinSum(s.high));
  assert.ok(s.low.total < s.mid.total && s.mid.total < s.high.total);
});
t("使用者自訂單價覆寫並標為使用者輸入", () => {
  const b = C.computeBudget(data, { ...base, overrides: { fees_permits: 50 }, includeExtras: true });
  const l = line(b, "fees_permits"); assert.equal(l.status, "user"); assert.equal(l.amountMYR, 200);
});
t("住宿夜數驗證：Tabin 4 晚、Danum 2 晚、合計 8 晚，無錯誤", () => {
  const errs = C.checkItinerary(data, base).filter(c => c.level === "error");
  eq(errs.map(e => e.msg), []);
  const ln = C.lodgingNightsSummary(data, base); assert.equal(ln.total, 8);
});
t("住宿夜數驗證：把一晚 Tabin 改成 Danum → 回報夜數不符與連續性錯誤", () => {
  const d2 = clone(data); d2.itinerary.days[4].lodging = "brl";
  const errs = C.checkItinerary(d2, base).filter(c => c.level === "error");
  assert.ok(errs.some(e => e.code === "nights")); assert.ok(errs.some(e => e.code === "continuity"));
});
t("日期缺漏：刪掉一天 → 回報天數與日期錯誤", () => {
  const d2 = clone(data); d2.itinerary.days.splice(3, 1);
  const errs = C.checkItinerary(d2, base).filter(c => c.level === "error");
  assert.ok(errs.some(e => e.code === "days")); assert.ok(errs.some(e => e.code === "date"));
});
t("時間衝突：同日兩活動時間重疊 → 錯誤", () => {
  const d2 = clone(data); const acts = d2.itinerary.days[2].activities; acts[1].start = "06:30";
  assert.ok(C.checkItinerary(d2, base).some(c => c.code === "overlap"));
});
t("最後一晚未決定 → Day 8 住宿待確認（警告，不是假資料）", () => {
  const c = C.checkItinerary(data, { ...base, lastNight: "tbd" });
  assert.ok(c.some(x => x.code === "lodging" && x.day === 8));
});
t("春節提醒出現在 Day 8、Day 9", () => {
  const c = C.checkItinerary(data, base).filter(x => x.code === "holiday").map(x => x.day);
  eq(c, [8, 9]);
});
t("觀察可能性標籤規則（含座標遮蔽）", () => {
  const L = (rec, d, live, ob) => C.observabilityLabel(rec, d, live, ob).key;
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 56 } }, 2), "strong");
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 56 } }, 3), "recorded");
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 3 } }, 2), "recorded");
  assert.equal(L({ lit: "recorded", inat_snapshot: { total: 0 } }, 2), "recorded");
  assert.equal(L({ lit: "recorded", inat_snapshot: { total: 0 } }, 3), "rare");
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 0 } }, 2), "insufficient");
  assert.equal(L({ lit: "unknown" }, 2), "insufficient");
  // 座標遮蔽物種：Place 0 筆但近似範圍有紀錄
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 0 }, inat_bbox_snapshot: { total: 5 } }, 2, null, true), "recorded");
  // 近似範圍筆數再多也不能得到「較充分」
  assert.equal(L({ lit: "recorded", inat_snapshot: { total: 0 }, inat_bbox_snapshot: { total: 24 } }, 2, null, true), "recorded");
  // 弱文獻（如 KBA 2002）單獨不足以判斷
  assert.equal(L({ lit: "recorded", lit_weak: true, inat_snapshot: { total: 0 } }, 2, null, false), "insufficient");
  // 未遮蔽物種：只有近似範圍（周邊）有紀錄 → 資料不足
  assert.equal(L({ lit: "unknown", inat_snapshot: { total: 0 }, inat_bbox_snapshot: { total: 5 } }, 2, null, false), "insufficient");
  const live = C.observabilityLabel({ lit: "unknown", inat_snapshot: { total: 0 } }, 1, { place: 25, bbox: null, fetchedAt: "x" }, false);
  assert.equal(live.key, "strong"); assert.equal(live.usedLive, true);
});
t("USD 計價（BRL）以 USD 匯率換算", () => {
  const b = C.computeBudget(data, { ...base, fxUsd: 4.2 });
  const l = line(b, "brl_package");
  assert.equal(l.currency, "USD"); assert.ok(Math.abs(l.amountMYR - 2033 * 4 * 4.2) < 1e-6); assert.ok(Math.abs(l.amountTWD - 2033 * 4 * 4.2 * 7.2) < 1e-6);
});
t("Danum 方案的接送／單人差額只在對應方案啟用", () => {
  const b = C.computeBudget(data, { ...base, fxUsd: 4.2, pax: 3 });
  assert.equal(line(b, "brl_private_transfer").active, true); assert.equal(line(b, "dvfc_private_transfer").active, false);
  assert.equal(line(b, "brl_single").active, true); assert.equal(line(b, "dvfc_single").active, false);
  const d = C.computeBudget(data, { ...base, fxUsd: 4.2, pax: 3, danumPlan: "dvfc" });
  assert.equal(line(d, "dvfc_single").amountMYR, null); assert.ok(d.unpriced.some(l => l.id === "dvfc_single"));
});
t("GAS 信封驗證：schema 錯誤拒收、單一資料集錯誤不影響其他", () => {
  assert.equal(C.validateEnvelope({ schema: "x", data: {} }).ok, false);
  assert.equal(C.validateEnvelope("<html>").ok, false);
  const bad = clone(data.costs); bad.items[0].status = "unquoted"; // 有價格卻標未報價
  const v = C.validateEnvelope({ schema: "ecotrip2027/1", data: { costs: bad, trip: data.trip, foo: {} } });
  assert.equal(v.ok, true); assert.ok(!v.accepted.costs); assert.ok(v.accepted.trip); eq(v.ignored, ["foo"]);
  assert.ok(v.errors.some(e => e.includes("price 必須為 null")));
});
t("計價參數錯誤不會產生 NaN，且被驗證擋下", () => {
  const d2 = clone(data); d2.costs.items.find(i => i.id === "tabin_single").qty.rooms_from = "nope";
  const b = C.computeBudget(d2, { ...base, pax: 3 });
  assert.ok(Number.isFinite(b.total)); assert.equal(line(b, "tabin_single").amountMYR, null);
  assert.ok(C.validateDataset("costs", d2.costs).some(e => e.includes("rooms_from")));
});
t("遠端資料集缺必要欄位會被拒收", () => {
  const sp = clone(data.species); delete sp.items[0].records;
  assert.ok(C.validateDataset("species", sp).some(e => e.includes("records")));
  const es = clone(data.essentials); delete es.risks;
  assert.ok(C.validateDataset("essentials", es).length > 0);
});
t("重複計費警告不重複、雙向成立", () => {
  const w = C.computeBudget(data, base).warnings.filter(x => x.code === "duplicate").map(x => x.msg);
  assert.equal(new Set(w).size, w.length);
  assert.ok(w.some(m => m.includes("Private Vehicle")));
});
t("Day 6 可行性：關掉 BRL 私人接送時提出警告", () => {
  const on = C.checkItinerary(data, base).filter(c => c.code === "feasibility");
  const off = C.checkItinerary(data, { ...base, optionalOn: { brl_private_transfer: false } }).filter(c => c.code === "feasibility");
  assert.equal(on.length, 0); assert.equal(off.length, 1); assert.equal(off[0].day, 6);
});
t("CSV 公式注入防護", () => {
  const d2 = clone(data); d2.costs.items[0].name = "=HYPERLINK(\"x\")";
  const csv = C.budgetCSV(C.computeBudget(d2, base), d2.sources.items);
  assert.ok(csv.includes("'=HYPERLINK"));
});
t("CSV：含 BOM、未報價不寫成 0", () => {
  const csv = C.budgetCSV(C.computeBudget(data, { ...base, pax: 3 }), data.sources.items);
  assert.ok(csv.startsWith("﻿")); assert.ok(csv.includes("未報價"));
  assert.ok(!/單人入住差額[^\n]*,0(\.00)?,/.test(csv));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
