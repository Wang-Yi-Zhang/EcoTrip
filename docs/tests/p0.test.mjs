import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../../sabah2027/index.html', import.meta.url), 'utf8');
const data = Object.fromEntries([...html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)].map(m => [m[1], JSON.parse(m[2])]));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.EcoCore;
const ui = html.match(/<script id="ui-js">([\s\S]*?)<\/script>/)[1];
new vm.Script(ui);
ctx.D = () => data; ctx.C = C;
ctx.compareChoices = () => C.choiceDefs(data).filter(c => c.compare_category);
vm.runInContext(ui.slice(ui.indexOf('  function budgetScopeText('), ui.indexOf('  /* ================= 總覽 Dashboard')), ctx);
const base = {pax:4,rooms:2,fx:7.2,rates:{USD:4.2},choices:{last_night_choice:'ld'},scenario:'mid',contingencyPct:10,includeFlights:false,includeExtras:false,optionalOn:{},overrides:{},activity:{}};
for (const flights of [false,true]) for (const extras of [false,true]) {
  const state = {...base,includeFlights:flights,includeExtras:extras};
  const text = ctx.budgetScopeText(C.computeBudget(data,state),state);
  assert.equal(text.includes('國際與國內機票'), !flights);
  assert.equal(text.includes('緩衝晚住宿'), !extras);
  assert.ok(text.includes('4 人／2 房；'));
  assert.ok(text.includes('不是全旅程已確認費用'));
}
assert.ok(C.computeBudget(data,{...base,pax:3}).unpriced.some(l=>l.id==='tabin_single'));
const extra = data.itinerary.days.find(d=>d.day===2).contingencies[0].extra_cost;   // 2026-11-13 改為先 Danum：包車備案在 Day 2
assert.equal(extra.amount,null);
assert.ok(extra.note.includes('不可再重複加算'));
assert.equal(data.costs.items.find(i=>i.id==='dvfc_private_transfer').default_on,false);
const checklist = data.essentials.checklist.flatMap(c=>c.items).map(i=>i.text).join('\n');
assert.ok(checklist.includes('訂 1/28 去程國際線與 1/29 07:20 BKI → LDU'));
assert.ok(checklist.includes('Day 1、Day 4 與 Day 9'));
assert.ok(!html.includes('兩者都已預設納入試算'));
assert.ok(!ui.includes('估算完整度'));
assert.ok(ui.includes('已取得訂房確認 ${ln.booked} / ${ln.total} 晚'));
assert.equal(Math.round(C.computeBudget(data,base).perPerson),10354);   // 2026-11-13 定案 DVFC Standard Resthouse＋抵達日午餐（原 BRL 16859）
// 時間數值最多顯示到小數點第一位（2026-11-13 使用者要求）：介面不得直接印出 duration_h
assert.ok(!/\$\{a\.duration_h\}/.test(ui));
const hours1 = vm.runInNewContext(ui.match(/const hours1 = (v => [^;]+);/)[1]);
assert.deepEqual([0.9167, 3.5833, 3.4167, 1.5, 2, 2.5].map(hours1), ['0.9', '3.6', '3.4', '1.5', '2', '2.5']);
console.log('✔ P0範圍四組開關、單人缺價、備案差額、日期、住宿語意及UI語法通過');
