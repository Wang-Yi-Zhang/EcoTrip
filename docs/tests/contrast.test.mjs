// 對照旅行測試：用一趟結構完全不同的行程（docs/tests/fixtures/contrast-trip.json）跑同一個引擎。
// 另外檢查引擎與介面程式碼中不得出現行程專有字樣。
// 執行：node docs/tests/contrast.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", "..");
const html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const coreSrc = html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1];
const uiSrc = html.match(/<script id="ui-js">([\s\S]*?)<\/script>/)[1];
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(coreSrc, ctx);
const C = ctx.EcoCore;
const data = JSON.parse(readFileSync(join(here, "fixtures", "contrast-trip.json"), "utf8")); delete data._note;
const sabah = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)) sabah[m[1]] = JSON.parse(m[2]);
const J = o => JSON.parse(JSON.stringify(o));
const state = { pax: 2, rooms: 1, fx: 1, rates: {}, choices: {}, scenario: "mid", contingencyPct: 0, includeFlights: false, includeExtras: false, optionalOn: {}, overrides: {}, activity: {}, checklist: {} };
const line = (b, id) => b.lines.find(l => l.id === id);

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

t("對照旅行：7 個資料集通過格式驗證，跨資料集參照完整", () => {
  for (const k of C.DATASETS) assert.deepEqual(J(C.validateDataset(k, data[k])), [], k);
  assert.deepEqual(J(C.validateReferences(data)), []);
});
t("對照旅行：2 人 1 房、單一幣別的試算（手算 45,000）", () => {
  const b = C.computeBudget(data, state);
  assert.equal(line(b, "hotel").amountBase, 12000 * 1 * 2);
  assert.equal(line(b, "rail").amountBase, 5000 * 2);
  assert.equal(line(b, "dinner").amountBase, 8000);
  assert.equal(line(b, "tea").amountBase, 1500 * 2 * 1);          // 行程預設只選了 1 晚茶席
  assert.equal(b.total, 24000 + 10000 + 8000 + 3000);
  assert.equal(b.perPerson, 22500);
  assert.deepEqual(Object.keys(b.byCategory), ["stay", "move", "food"]);
  assert.equal(b.byCategory.food.base, 11000); assert.equal(b.byCategory.food.unpriced, 1);
});
t("對照旅行：沒有結算幣別時不換算、不出現匯率錯誤", () => {
  const b = C.computeBudget(data, state);
  assert.equal(b.totalHome !== null && b.currency.home !== null, false);
  assert.equal(b.currency.base, "JPY"); assert.equal(b.currency.home, null);
  assert.ok(!b.warnings.some(w => w.msg.includes("匯率")), JSON.stringify(b.warnings));
  assert.ok(C.budgetCSV(b, []).includes("金額(JPY)"));
});
t("對照旅行：未報價項目是 null，不是 0", () => {
  const b = C.computeBudget(data, state);
  assert.equal(line(b, "museum").amountBase, null); assert.deepEqual(J(b.unpriced.map(l => l.id)), ["museum"]);
});
t("對照旅行：行程選擇連動費用（任何費用 id 都可以，不限沙巴的夜遊）", () => {
  const b = C.computeBudget(data, { ...state, activity: { "a2-eve": { choice: 0 } } });
  assert.equal(b.ctx.activityCount.tea, 2); assert.equal(line(b, "tea").amountBase, 6000);
  const c1 = C.checkItinerary(data, state).filter(c => c.code === "quote");
  assert.equal(c1.length, 1); assert.ok(c1[0].msg.includes("1 晚茶席") && c1[0].msg.includes("2 晚"), c1[0].msg);
  assert.equal(C.checkItinerary(data, { ...state, activity: { "a2-eve": { choice: 0 } } }).filter(c => c.code === "quote").length, 0);
});
t("對照旅行：行程檢查沒有錯誤；夜數 2 晚", () => {
  assert.deepEqual(J(C.checkItinerary(data, state).filter(c => c.level === "error").map(c => c.msg)), []);
  assert.equal(C.lodgingNightsSummary(data, state).total, 2);
});
t("對照旅行：沒有選擇題時，比較功能回傳 null，不會出錯", () => {
  assert.equal(C.compareChoice(data, state, "anything"), null); assert.equal(J(C.choiceDefs(data)).length, 0);
});
t("銜接餘裕：足夠／偏緊／趕不上（手算）", () => {
  const c = Object.fromEntries(C.connections(data, state).map(x => [x.id, x]));
  assert.equal(c["c-ok"].totalMin, 75); assert.equal(c["c-ok"].arrive, "10:15"); assert.equal(c["c-ok"].slackMin, 45);
  assert.equal(c["c-ok"].latestDepart, "09:25"); assert.equal(c["c-ok"].status, "ok"); assert.deepEqual(J(c["c-ok"].missing), []);
  assert.equal(c["c-tight"].slackMin, 10); assert.equal(c["c-tight"].status, "tight");
  assert.equal(c["c-miss"].slackMin, -15); assert.equal(c["c-miss"].status, "miss");
});
t("銜接餘裕（沙巴，先 Danum 後 Tabin）：Day 2 下飛機接 DVFC 09:30 排程車；出發時間未確認時不會顯示為 ok；缺資料時列出缺什麼", () => {
  const st = { ...state, pax: 4, rooms: 2, rates: { USD: 4.2 }, choices: { last_night_choice: "ld" } };
  const list = C.connections(sabah, st);
  assert.deepEqual(J(list.map(x => x.id)), ["c-d2-bki", "c-d2-dvfc", "c-d9-ld"]);
  // 07:30 起飛、航程 1 小時＋走到 DVFC 辦公室 0.5 小時 → 09:00 到；09:30 發車，緩衝 30 分鐘 → 最晚 07:30 起飛，餘裕 30 分鐘
  const d2 = list.find(x => x.id === "c-d2-dvfc");
  assert.equal(d2.latestDepart, "07:30"); assert.equal(d2.slackMin, 30); assert.equal(d2.status, "assumed");
  const d10 = list.find(x => x.day === 10); assert.equal(d10.status, "insufficient"); assert.ok(d10.missing.length >= 3); assert.equal(d10.latestDepart, null);
  const kk = C.connections(sabah, { ...st, choices: { last_night_choice: "kk" } });
  assert.deepEqual(J(kk.map(x => x.id)), ["c-d2-bki", "c-d2-dvfc", "c-d9-kk-tabin"]);
  // Day 9：Tabin 排程回程 14:30 發車、1.5 小時 → 16:00 抵達；班機未訂所以仍是資料不足
  assert.equal(kk[2].arrive, "16:00"); assert.equal(kk[2].status, "insufficient");
  // option 為陣列時須全部選到：kk 與 ld 不可能同時成立 → 不列出
  const s2 = JSON.parse(JSON.stringify(sabah)); s2.itinerary.connections.find(c => c.id === "c-d9-kk-tabin").option = ["kk", "ld"];
  assert.ok(!C.connections(s2, { ...st, choices: { last_night_choice: "kk" } }).some(x => x.id === "c-d9-kk-tabin"));
});
t("待辦期限：排序、剩餘天數、逾期、前置未完成、期限未知不當成沒有期限", () => {
  const l = C.taskList(data, state, "2028-02-10");
  assert.deepEqual(J(l.map(x => x.id)), ["t-flight", "t-hotel", "t-unknown"]);
  assert.equal(l[0].daysLeft, -9); assert.equal(l[0].overdue, true); assert.equal(l[0].due_kind, "external");
  assert.equal(l[1].daysLeft, 20); assert.deepEqual(J(l[1].blocked_by), ["訂機票"]);
  assert.equal(l[2].due, null); assert.equal(l[2].due_kind, "unknown"); assert.equal(l[2].daysLeft, null);
  const done = C.taskList(data, { ...state, checklist: { "task:t-flight": true } }, "2028-02-10");
  assert.deepEqual(J(done.map(x => x.id)), ["t-hotel", "t-unknown", "t-flight"]); assert.deepEqual(J(done[0].blocked_by), []);
  assert.equal(done[2].overdue, false);
});
t("待辦期限（沙巴）：每筆都有逾期後果；期限晚於行程或前置不存在會被擋下", () => {
  for (const x of sabah.essentials.tasks) assert.ok(x.consequence && x.consequence.length > 5, x.id);
  const bad = J(sabah); bad.essentials.tasks[0].due = "2027-03-01"; bad.essentials.tasks[1].depends_on = ["nope"];
  const e = C.validateReferences(bad); assert.ok(e.some(m => m.includes("晚於行程結束日"))); assert.ok(e.some(m => m.includes("nope")));
});
t("每日備案表（沙巴）：10 天都有，每筆有徵兆／觸發條件／誰決定／備案；費用未知是 null 不是 0", () => {
  for (const d of sabah.itinerary.days) {
    assert.ok(d.contingencies.length >= 1, "Day " + d.day);
    for (const c of d.contingencies) { for (const k of ["sign", "trigger", "decider", "fallback"]) assert.ok(typeof c[k] === "string" && c[k].length >= 2, `Day ${d.day} ${k}`);
      assert.ok(c.extra_cost && (c.extra_cost.amount === null || c.extra_cost.amount > 0), `Day ${d.day} extra_cost`); assert.ok(c.extra_cost.note); }
  }
});
t("旅程後回填：實際花費對照試算", () => {
  const b = C.computeBudget(data, state), a = C.actualsSummary(b, { hotel: 25000, museum: 1800 });
  assert.equal(a.filled, 2); assert.equal(a.actualTotal, 26800); assert.equal(a.plannedForFilled, 24000);
  assert.equal(a.lines.find(l => l.id === "hotel").diff, 1000); assert.equal(a.lines.find(l => l.id === "museum").diff, null);
});
t("資料錯誤會被參照檢查擋下（區域、分類、幣別、選項）", () => {
  const d = J(data); d.itinerary.days[0].region = "mars"; d.costs.items[0].category = "x"; d.costs.items[1].price_currency = "EUR"; d.costs.items[2].applies = "plan_z";
  const e = C.validateReferences(d);
  for (const k of ["mars", "category「x」", "EUR", "plan_z"]) assert.ok(e.some(m => m.includes(k)), k + " ← " + e.join("｜"));
});

// ---------- 專有字樣：引擎與介面程式碼裡不得出現任何一趟行程的專有名詞 ----------
// tabin 後面接 dex 的是 HTML 的 tabindex，不算；RM 只比對大寫加空白（幣別符號）
const FIXED = [/tabin(?!dex)/i, /danum/i, /brl/i, /dvfc/i, /sabah/i, /沙巴/, /lahad/i, /lipad/i, /borneo/i, /婆羅/, /kinabalu/i, /2027/, /2028/, /MYR/i, /TWD/i, /USD/i, /JPY/i, /NT\$/, /\bRM\s/, /春節/, /除夕/, /哺乳/, /夜遊/, /night_?safari/i, /private_guide/i, /last_?night/i, /ecotrip2027/i];
function termHits(src, extraIds) {
  const hits = [];
  const lines = src.split("\n");
  const res = FIXED.concat(extraIds.map(id => new RegExp(`(?<![A-Za-z0-9_-])${id}(?![A-Za-z0-9_-])`)));
  lines.forEach((ln, i) => { for (const re of res) if (re.test(ln)) hits.push(`第 ${i + 1} 行 /${re.source}/：${ln.trim().slice(0, 100)}`); });
  return hits;
}
// 從兩趟行程的資料自動取出專有 id（費用、地點、選擇題、區域、物種），長度 4 以上才列入，避免誤判常見英文字
const GENERIC = new Set(["hotel", "station", "city", "move", "stay", "food", "other", "transit", "insurance", "personal", "museum", "rail", "dinner", "per_person", "tarsier", "colugo", "gibbon"]);
const ids = new Set();
for (const d of [sabah, data]) {
  for (const i of d.costs.items) ids.add(i.id); for (const p of d.locations.pois) ids.add(p.id); for (const c of d.trip.choices || []) ids.add(c.id);
  for (const k of Object.keys(d.trip.regions || {})) ids.add(k); for (const k of Object.keys(d.costs.categories || {})) ids.add(k); for (const s of d.species.items) ids.add(s.id);
}
const extra = [...ids].filter(x => x.length >= 4 && !GENERIC.has(x));
t(`專有字樣：引擎（core-js）為 0（固定字樣 ${FIXED.length} 個＋資料中的 id ${extra.length} 個）`, () => {
  const h = termHits(coreSrc, extra); assert.equal(h.length, 0, "\n    " + h.slice(0, 20).join("\n    "));
});
t("專有字樣：介面（ui-js）為 0", () => {
  const h = termHits(uiSrc, extra); assert.equal(h.length, 0, "\n    " + h.slice(0, 20).join("\n    "));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
