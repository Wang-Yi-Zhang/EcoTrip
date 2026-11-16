// 代墊與付款管理（SDD-002）：EcoCore.computeLedger 的單元測試。
// 全部用虛構暱稱 A、B、C、D；金額單位是結算幣別的「分」（整數）。
// 執行：node docs/tests/ledger.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const core = html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1];
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(core, ctx);
const C = ctx.EcoCore;
const J = o => JSON.parse(JSON.stringify(o)); // vm 跨 realm 物件先序列化再比較

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

// 幣別：結算幣別 H（本國）、本位幣 B（當地）；1 B = 8.563 H；1 X = 3.872 B
const OPTS = { home: "H", base: "B", fx: 8.563, rates: { X: 3.872 }, today: "2026-11-16",
  costs: [{ id: "room_cost", unit: "per_room_per_night" }, { id: "pp_cost", unit: "per_person" }, { id: "air", unit: "per_person_trip" }] };
const M4 = [{ nick: "A", room: "r1" }, { nick: "B", room: "r1" }, { nick: "C", room: "r2" }, { nick: "D", room: "r2" }];
const run = (ledger, members = M4, opts = {}) => J(C.computeLedger({ items: members }, { items: ledger }, { ...OPTS, ...opts }));
const nets = r => Object.fromEntries(r.members.map(m => [m.nick, m.net]));
const shares = r => Object.fromEntries(r.members.map(m => [m.nick, m.share]));
const warnIds = r => r.warnings.map(w => w.code + ":" + (w.id || ""));
const sumNet = r => r.members.reduce((a, m) => a + m.net, 0);
const pay = (id, payer, amount, extra = {}) => ({ id, date: "2026-11-15", type: "payment", payer, to: "all", amount, currency: "H", ...extra });

t("核心有 computeLedger", () => assert.equal(typeof C.computeLedger, "function"));

// ---------- golden：已購機票（2026-11-16 使用者提供的付款結構，三筆都已刷卡；人名改成 A–D） ----------
// A 自付國際線 17,570.62（PROGRESS.md）；B 代墊 B、C、D 三人國際線合計 50,856.58；A 代墊四人國內線 14,135。
// 50,856.58 是使用者 2026-11-16 更正後的數字（原記 50,786.98）。三人國際線每人金額未知，先平分。
t("golden：A 自付國際線、B 代墊三人國際線、A 代墊四人國內線", () => {
  const r = run([
    pay("L001", "A", 17570.62, { to: "A", cost_id: "air", evidence: "已刷卡" }),
    pay("L002", "B", 50856.58, { to: "B;C;D", cost_id: "air" }),
    pay("L003", "A", 14135, { cost_id: "air" }),
  ]);
  assert.deepEqual(shares(r), { A: 2110437, B: 2048595, C: 2048594, D: 2048594 }, "50,856.58 ÷ 3 多出的 1 分由付款人 B 吸收");
  assert.deepEqual(nets(r), { A: 1060125, B: 3037063, C: -2048594, D: -2048594 });
  assert.equal(sumNet(r), 0);
  assert.equal(r.totals.paid, 8256220);
  assert.deepEqual(r.settle, [{ from: "C", to: "B", cents: 2048594 }, { from: "D", to: "A", cents: 1060125 }, { from: "D", to: "B", cents: 988469 }]);
  assert.equal(r.final, true, "全部是結算幣別，沒有暫估");
  assert.deepEqual(r.warnings, []);
});

// ---------- 分攤 ----------
t("平分：尾數由付款人吸收", () => {
  const r = run([pay("L1", "A", 100, { to: "A;B;C" })]);
  assert.deepEqual(shares(r), { A: 3334, B: 3333, C: 3333, D: 0 });
});
t("付款人不在名單裡：尾數由名單上依 members 順序排第一位的人吸收", () => {
  const r = run([pay("L1", "A", 100, { to: "D;C;B" })]);
  assert.deepEqual(shares(r), { A: 0, B: 3334, C: 3333, D: 3333 });
  assert.deepEqual(nets(r), { A: 10000, B: -3334, C: -3333, D: -3333 });
});
t("房間類費用：先按房間平分，再由同房的人平分（單人房的人負擔整間）", () => {
  const m = [{ nick: "A", room: "r1" }, { nick: "B", room: "r1" }, { nick: "C", room: "r2" }];
  const r = run([pay("L1", "A", 900, { cost_id: "room_cost" })], m);
  assert.deepEqual(shares(r), { A: 22500, B: 22500, C: 45000 });
});
t("非房間類費用即使有房間代號也按人平分", () => {
  const m = [{ nick: "A", room: "r1" }, { nick: "B", room: "r1" }, { nick: "C", room: "r2" }];
  const r = run([pay("L1", "A", 900, { cost_id: "pp_cost" })], m);
  assert.deepEqual(shares(r), { A: 30000, B: 30000, C: 30000 });
});
// ---------- 每筆的房間分法（rooms 欄：| 分隔房間、; 分隔同房的人） ----------
const M3 = [{ nick: "A", room: "r1" }, { nick: "B", room: "r1" }, { nick: "C", room: "r2" }];
t("rooms 欄優先於 members 的預設房間：這晚三人同一間 → 平分", () => {
  const r = run([pay("L1", "A", 900, { cost_id: "room_cost", rooms: "A;B;C" })], M3);
  assert.deepEqual(shares(r), { A: 30000, B: 30000, C: 30000 });
});
t("rooms 欄有填時，沒有 cost_id 也按房間分攤", () => {
  const r = run([pay("L1", "A", 900, { rooms: "A;B|C" })], M3);
  assert.deepEqual(shares(r), { A: 22500, B: 22500, C: 45000 });
});
t("不同晚不同分法：一晚三人一間、一晚兩間，各記一筆", () => {
  const r = run([pay("L1", "A", 900, { date: "2027-01-29", rooms: "A;B;C" }), pay("L2", "A", 900, { date: "2027-01-30", rooms: "A;B|C" })], M3);
  assert.deepEqual(shares(r), { A: 52500, B: 52500, C: 75000 });
});
t("四人一間與兩兩一間：四人時兩種分法每人金額相同", () => {
  const a = run([pay("L1", "A", 2000, { rooms: "A;B;C;D" })]), b = run([pay("L1", "A", 2000, { rooms: "A;C|B;D" })]);
  assert.deepEqual(shares(a), { A: 50000, B: 50000, C: 50000, D: 50000 });
  assert.deepEqual(shares(b), shares(a));
});
t("rooms 的檢查：不認識的暱稱、同一人列兩次、對象不在任何房間、房間裡的人不在對象中", () => {
  let r = run([pay("L1", "A", 100, { rooms: "A;Z" })]);
  assert.deepEqual(warnIds(r), ["unknown_member:L1"]);
  r = run([pay("L1", "A", 100, { rooms: "A;B|B;C|D" })]);
  assert.deepEqual(warnIds(r), ["bad_rooms:L1"]);
  r = run([pay("L1", "A", 900, { rooms: "A;B" })], M3);
  assert.deepEqual(warnIds(r), ["rooms_mismatch:L1"]);
  assert.deepEqual(shares(r), { A: 22500, B: 22500, C: 45000 }, "沒列進房間的人自己一間");
  r = run([pay("L1", "A", 900, { to: "A;B", rooms: "A|B;C" })], M3);
  assert.deepEqual(warnIds(r), ["rooms_mismatch:L1"]);
  assert.deepEqual(shares(r), { A: 45000, B: 45000, C: 0 }, "不在對象中的人不分攤");
});
t("退款也照該筆的 rooms 分", () => {
  const r = run([pay("L1", "A", 900, { rooms: "A;B|C" }), { id: "L2", type: "refund", payer: "A", to: "all", rooms: "A;B|C", amount: 300, currency: "H", ref_id: "L1" }], M3);
  assert.deepEqual(shares(r), { A: 15000, B: 15000, C: 30000 });
});

t("個人費用：to 指定一人（例如單人房差價）", () => {
  const r = run([pay("L1", "A", 510, { to: "C" })]);
  assert.deepEqual(shares(r), { A: 0, B: 0, C: 51000, D: 0 });
});

// ---------- 幣別 ----------
t("外幣沒有實際入帳金額：用匯率暫估，標示暫估且不是最終結清", () => {
  const r = run([pay("L1", "A", 100, { currency: "B" })]);
  assert.equal(r.totals.paid, 85630);
  assert.equal(r.entries[0].estimated, true);
  assert.equal(r.final, false);
  assert.equal(r.members[0].estimated, true);
});
t("有 home_actual 時以實際入帳金額為準", () => {
  const r = run([pay("L1", "A", 100, { currency: "B", home_actual: 870 })]);
  assert.equal(r.totals.paid, 87000);
  assert.equal(r.final, true);
  assert.deepEqual(r.warnings, []);
});
t("第三種幣別：先換本位幣再換結算幣別", () => {
  const r = run([pay("L1", "A", 10, { currency: "X" })]);
  assert.equal(r.totals.paid, Math.round(10 * 3.872 * 8.563 * 100));
});
t("實際入帳與換算差超過 5% 時提醒（可能抄錯）", () => {
  const r = run([pay("L1", "A", 100, { currency: "B", home_actual: 1000 })]);
  assert.deepEqual(warnIds(r), ["actual_mismatch:L1"]);
});
t("沒有匯率可換算：該筆不計入並警告", () => {
  const r = run([pay("L1", "A", 100, { currency: "B" })], M4, { fx: null });
  assert.equal(r.totals.paid, 0);
  assert.deepEqual(warnIds(r), ["no_rate:L1"]);
});
t("不允許的幣別：警告且不計入", () => {
  const r = run([pay("L1", "A", 100, { currency: "Q" })]);
  assert.deepEqual(warnIds(r), ["bad_currency:L1"]);
  assert.equal(r.totals.paid, 0);
});

// ---------- 指定分攤 ----------
t("share 列：外幣付款依 share 比例分配實際入帳金額，尾數歸付款人", () => {
  const r = run([
    pay("L1", "A", 300, { currency: "B", home_actual: 2600 }),
    { id: "L2", type: "share", ref_id: "L1", to: "A", amount: 100 },
    { id: "L3", type: "share", ref_id: "L1", to: "B", amount: 200 },
  ]);
  assert.deepEqual(shares(r), { A: 86667, B: 173333, C: 0, D: 0 });
});
t("share 加總不等於付款金額：警告，該筆改用 to 平分", () => {
  const r = run([pay("L1", "A", 400), { id: "L2", type: "share", ref_id: "L1", to: "B", amount: 100 }]);
  assert.deepEqual(warnIds(r), ["share_sum:L1"]);
  assert.deepEqual(shares(r), { A: 10000, B: 10000, C: 10000, D: 10000 });
});
t("share 指到不存在的付款：警告", () => {
  const r = run([{ id: "L2", type: "share", ref_id: "L9", to: "B", amount: 100 }]);
  assert.deepEqual(warnIds(r), ["bad_ref:L2"]);
});

// ---------- 退款、沖銷、退出 ----------
t("退款：付款人收回、指定的人分攤減少", () => {
  const r = run([pay("L1", "A", 1000), { id: "L2", date: "2026-11-20", type: "refund", payer: "A", to: "D", amount: 400, currency: "H", ref_id: "L1" }]);
  assert.deepEqual(shares(r), { A: 25000, B: 25000, C: 25000, D: -15000 });
  assert.deepEqual(nets(r), { A: 35000, B: -25000, C: -25000, D: 15000 });
  assert.equal(sumNet(r), 0);
});
t("沖銷：被沖銷的那筆完全失效，更正後的那筆生效", () => {
  const r = run([pay("L1", "A", 1000), { id: "L2", type: "reversal", ref_id: "L1" }, pay("L3", "A", 100)]);
  assert.equal(r.totals.paid, 10000);
  assert.equal(r.entries.find(e => e.id === "L1").reversedBy, "L2");
});
t("沖銷規則：不能沖銷兩次、不能沖銷沖銷列、指到不存在的列要警告", () => {
  const r = run([pay("L1", "A", 100), { id: "L2", type: "reversal", ref_id: "L1" }, { id: "L3", type: "reversal", ref_id: "L1" },
    { id: "L4", type: "reversal", ref_id: "L2" }, { id: "L5", type: "reversal", ref_id: "L404" }]);
  assert.deepEqual(warnIds(r), ["double_reversal:L3", "reverse_reversal:L4", "bad_ref:L5"]);
  assert.equal(r.totals.paid, 0);
});
t("退出：退出日當天與之後的 to=all 不含退出者；之前的分攤照算", () => {
  const m = M4.map(x => x.nick === "D" ? { ...x, status: "withdrawn", withdrawn_on: "2026-12-01" } : x);
  const r = run([pay("L1", "A", 400, { date: "2026-11-20" }), pay("L2", "A", 300, { date: "2026-12-01" })], m);
  assert.deepEqual(shares(r), { A: 20000, B: 20000, C: 20000, D: 10000 });
});
t("退出者在退出日之後被明確列入 to：警告（但照列入計算）", () => {
  const m = M4.map(x => x.nick === "D" ? { ...x, status: "withdrawn", withdrawn_on: "2026-12-01" } : x);
  const r = run([pay("L1", "A", 100, { date: "2026-12-05", to: "C;D" })], m);
  assert.deepEqual(warnIds(r), ["withdrawn_member:L1"]);
});

// ---------- 還款與到期 ----------
t("滾動結清：每筆付款產生旅伴對付款人的還款項目，預設期限是付款日 +7 天", () => {
  const r = run([pay("L1", "A", 400, { date: "2026-11-20" }), { id: "L2", date: "2026-11-25", type: "repayment", payer: "B", to: "A", amount: 100, currency: "H" }],
    M4, { today: "2026-11-28" });
  const d = Object.fromEntries(r.dues.map(x => [x.from, x]));
  assert.deepEqual(Object.keys(d).sort(), ["B", "C", "D"]);
  assert.equal(d.B.due, "2026-11-27"); assert.equal(d.B.status, "paid"); assert.equal(d.B.remaining, 0);
  assert.equal(d.C.status, "overdue"); assert.equal(d.C.remaining, 10000);
  assert.deepEqual(nets(r), { A: 20000, B: 0, C: -10000, D: -10000 });
});
t("還款依期限先後沖抵；repay_due 可以手動指定", () => {
  const r = run([pay("L1", "A", 200, { to: "A;B", date: "2026-11-01" }), pay("L2", "A", 400, { to: "A;B", date: "2026-11-02", repay_due: "2026-11-05" }),
    { id: "L3", date: "2026-11-06", type: "repayment", payer: "B", to: "A", amount: 250, currency: "H" }], M4, { today: "2026-11-06" });
  const d = Object.fromEntries(r.dues.map(x => [x.payment_id, x]));
  assert.equal(d.L2.due, "2026-11-05"); assert.equal(d.L2.remaining, 0);
  assert.equal(d.L1.due, "2026-11-08"); assert.equal(d.L1.remaining, 5000); assert.equal(d.L1.status, "open");
});
t("退款降低對應付款的還款項目", () => {
  const r = run([pay("L1", "A", 400), { id: "L2", type: "refund", payer: "A", to: "D", amount: 100, currency: "H", ref_id: "L1" }]);
  assert.equal(r.dues.find(x => x.from === "D").remaining, 0);
});

// ---------- 預計付款 ----------
t("預計付款：分兩次付款，付完才結掉；預計不算進淨額", () => {
  const plan = { id: "P1", date: "2026-11-16", type: "plan", payer: "A", to: "all", amount: 10000, currency: "B", vendor_due: "2026-11-30" };
  let r = run([plan]);
  assert.deepEqual(nets(r), { A: 0, B: 0, C: 0, D: 0 });
  assert.equal(r.plans[0].open, true); assert.equal(r.plans[0].remaining, 10000);
  r = run([plan, pay("L1", "A", 6000, { currency: "B", ref_id: "P1", home_actual: 51400 })]);
  assert.equal(r.plans[0].open, true); assert.equal(r.plans[0].remaining, 4000);
  r = run([plan, pay("L1", "A", 6000, { currency: "B", ref_id: "P1", home_actual: 51400 }), pay("L2", "A", 4000, { currency: "B", ref_id: "P1", home_actual: 34300 })]);
  assert.equal(r.plans[0].open, false);
});
t("尚未付款的費用項目列為預計（依費用 id 比對）", () => {
  const r = run([pay("L1", "A", 100, { cost_id: "air" })], M4, { budgetLines: [{ id: "air", name: "機票", amountHome: 500 }, { id: "room_cost", name: "住宿", amountHome: 900 }] });
  assert.deepEqual(r.unpaidCosts.map(x => x.id), ["room_cost"]);
});

// ---------- 結清建議 ----------
t("最少轉帳：一人代墊三人 → 三筆", () => {
  const r = run([pay("L1", "A", 400)]);
  assert.deepEqual(r.settle, [{ from: "B", to: "A", cents: 10000 }, { from: "C", to: "A", cents: 10000 }, { from: "D", to: "A", cents: 10000 }]);
});
t("最少轉帳：兩人各代墊，一人欠兩人 → 兩筆，且轉完淨額全部歸零", () => {
  const r = run([pay("L1", "A", 150, { to: "A;C" }), pay("L2", "B", 150, { to: "B;C" })]);
  assert.deepEqual(r.settle, [{ from: "C", to: "A", cents: 7500 }, { from: "C", to: "B", cents: 7500 }]);
});

// ---------- 旅伴確認與個人明細 ----------
t("待確認：超過 confirmed_through 且影響到本人的款項", () => {
  const m = M4.map(x => x.nick === "B" ? { ...x, confirmed_through: "L1" } : x);
  const r = run([pay("L1", "A", 400), pay("L2", "A", 100, { to: "C" }), pay("L3", "A", 200, { to: "A;B" })], m);
  assert.deepEqual(r.pending, { A: ["L1", "L2", "L3"], B: ["L3"], C: ["L1", "L2"], D: ["L1"] });
});
t("沖銷列也算待確認（被沖銷那筆影響到的人）", () => {
  const m = M4.map(x => ({ ...x, confirmed_through: "L1" }));
  const r = run([pay("L1", "A", 100, { to: "A;B" }), { id: "L2", type: "reversal", ref_id: "L1" }], m);
  assert.deepEqual(r.pending, { A: ["L2"], B: ["L2"], C: [], D: [] });
});
t("每筆款項記錄對每人淨額的影響（個人明細用）", () => {
  const r = run([pay("L1", "A", 100, { to: "A;B" })]);
  assert.deepEqual(r.entries[0].effects, { A: 5000, B: -5000 });
});

// ---------- 檢查 ----------
t("檢查：重複 id、不認識的暱稱、不存在的費用 id、不認識的類型、缺金額", () => {
  const r = run([pay("L1", "A", 100), pay("L1", "A", 100), pay("L2", "Z", 100), pay("L3", "A", 100, { cost_id: "nope" }),
    { id: "L4", type: "gift", payer: "A", amount: 1, currency: "H" }, pay("L5", "A", "")]);
  assert.deepEqual(warnIds(r), ["duplicate_id:L1", "unknown_member:L2", "unknown_cost:L3", "bad_type:L4", "bad_amount:L5"]);
});
t("還款的 to 必須剛好一人", () => {
  const r = run([{ id: "L1", type: "repayment", payer: "B", to: "A;C", amount: 1, currency: "H" }]);
  assert.deepEqual(warnIds(r), ["bad_repayment:L1"]);
});
t("暱稱重複：警告", () => {
  const r = run([], [{ nick: "A" }, { nick: "A" }]);
  assert.deepEqual(warnIds(r), ["duplicate_member:"]);
});
t("空白列（沒有 id）略過", () => {
  const r = run([{ id: "", type: "" }, pay("L1", "A", 100, { to: "A" })]);
  assert.deepEqual(r.warnings, []);
});

// ---------- 遠端信封：帳本另外放 ----------
t("validateEnvelope：只有帳本也算成功；帳本放在 ledger，不進 accepted、不算 ignored", () => {
  const v = J(C.validateEnvelope({ schema: "ecotrip/1", data: { members: { items: M4 }, ledger: { items: [pay("L1", "A", 1)] }, other: {} } }));
  assert.equal(v.ok, true); assert.deepEqual(Object.keys(v.ledger).sort(), ["ledger", "members"]);
  assert.deepEqual(v.accepted, {}); assert.deepEqual(v.ignored, ["other"]); assert.deepEqual(v.errors, []);
});
t("validateEnvelope：帳本形狀不對就不收並回報", () => {
  const v = J(C.validateEnvelope({ schema: "ecotrip/1", data: { ledger: { items: "x" }, members: { items: [{ nick: { a: 1 } }] } } }));
  assert.equal(v.ok, false); assert.deepEqual(v.ledger, {});
  assert.ok(v.errors.some(e => e.startsWith("[ledger]"))); assert.ok(v.errors.some(e => e.startsWith("[members]") && e.includes("nick")));
});

// ---------- 守恆：隨機帳本（固定種子） ----------
t("守恆：200 組隨機帳本，淨額加總恆為 0、每筆影響加總為 0、轉帳後全部歸零", () => {
  let seed = 20261116; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const nicks = ["A", "B", "C", "D", "E"];
  for (let k = 0; k < 200; k++) {
    const members = nicks.map((n, i) => ({ nick: n, room: "r" + (i % 3), ...(rnd() < 0.15 ? { status: "withdrawn", withdrawn_on: "2026-12-0" + (1 + Math.floor(rnd() * 9)) } : {}) }));
    const rows = [];
    for (let i = 0; i < 15; i++) {
      const id = "L" + i, date = "2026-12-0" + (1 + Math.floor(rnd() * 9)), cur = pick(["H", "H", "B", "X"]);
      const amt = Math.round(rnd() * 100000) / 100 + 0.01, to = rnd() < 0.5 ? "all" : [...new Set([pick(nicks), pick(nicks)])].join(";");
      const kind = rnd();
      if (kind < 0.55) rows.push({ id, date, type: "payment", payer: pick(nicks), to, amount: amt, currency: cur, cost_id: pick(["", "room_cost", "pp_cost"]), ...(rnd() < 0.3 ? { rooms: pick(["A;B|C;D|E", "A;B;C;D;E", "A|B;C", "A;B;C|D;E"]) } : {}), ...(rnd() < 0.3 ? { home_actual: Math.round(amt * 30) } : {}) });
      else if (kind < 0.7) rows.push({ id, date, type: "repayment", payer: pick(nicks), to: pick(nicks), amount: amt, currency: "H" });
      else if (kind < 0.8 && i) rows.push({ id, date, type: "refund", payer: pick(nicks), to, amount: amt / 3, currency: cur, ref_id: "L" + Math.floor(rnd() * i) });
      else if (kind < 0.9 && i) rows.push({ id, type: "reversal", ref_id: "L" + Math.floor(rnd() * i) });
      else if (i) rows.push({ id, type: "share", ref_id: "L" + Math.floor(rnd() * i), to: pick(nicks), amount: amt });
    }
    const r = run(rows, members);
    assert.equal(sumNet(r), 0, "第 " + k + " 組淨額加總");
    for (const e of r.entries) assert.equal(Object.values(e.effects).reduce((a, b) => a + b, 0), 0, "第 " + k + " 組 " + e.id);
    const after = Object.fromEntries(r.members.map(m => [m.nick, m.net]));
    for (const s of r.settle) { after[s.from] += s.cents; after[s.to] -= s.cents; }
    assert.ok(Object.values(after).every(v => v === 0), "第 " + k + " 組轉帳後歸零");
    assert.ok(r.settle.length <= members.length - 1, "第 " + k + " 組轉帳筆數");
  }
});

console.log(`\n${pass} 通過，${fail} 失敗`);
if (fail) process.exit(1);
