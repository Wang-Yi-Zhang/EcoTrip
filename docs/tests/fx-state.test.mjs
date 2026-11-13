// 匯率存檔規則：只有使用者自己改過的匯率才保留；沒改過就跟著行程資料的預設值走。
// 背景（2026-11-13）：預設匯率從 7.2 改成 8.563 後，開過網頁的瀏覽器仍顯示 7.2，因為舊版把預設值也存進了 localStorage。
// 執行：node docs/tests/fx-state.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../../sabah2027/index.html", import.meta.url), "utf8");
const data = Object.fromEntries([...html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)].map(m => [m[1], JSON.parse(m[2])]));
const ctx = {}; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], ctx);
const ui = html.match(/<script id="ui-js">([\s\S]*?)<\/script>/)[1];
ctx.C = ctx.EcoCore;
// 只取出狀態相關函式（defaultState、obj0、syncFxDefaults、sanitizeState）
vm.runInContext(ui.slice(ui.indexOf("  function defaultState("), ui.indexOf("  function loadState(")) +
  "\nglobalThis.T = { defaultState, sanitizeState, syncFxDefaults };", ctx);
const { defaultState, sanitizeState, syncFxDefaults } = ctx.T;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } };
const DEF = data.trip.default_fx, DEF_USD = data.trip.currency.default_rates.USD;
const withFx = (fx, usd) => { const d = JSON.parse(JSON.stringify(data)); d.trip.default_fx = fx; d.trip.currency.default_rates.USD = usd; return d; };

t("新使用者：用資料的預設值，未標記自訂", () => {
  const s = defaultState(data);
  assert.equal(s.fx, DEF); assert.equal(s.rates.USD, DEF_USD); assert.equal(s.fxCustom, false); assert.equal(s.ratesCustom.USD ?? false, false);
});
t("舊版存檔（沒有 fxCustom）存著舊預設 7.2／4.2 → 視為沒改過，改用目前預設", () => {
  const s = sanitizeState({ pax: 4, fx: 7.2, rates: { USD: 4.2 } }, data);
  assert.equal(s.fxCustom, false); assert.equal(s.fx, DEF);
  assert.equal(s.ratesCustom.USD, false); assert.equal(s.rates.USD, DEF_USD);
});
t("舊版存檔存著其他數字 → 視為使用者自訂，保留", () => {
  const s = sanitizeState({ fx: 6.9, rates: { USD: 4.3 } }, data);
  assert.equal(s.fxCustom, true); assert.equal(s.fx, 6.9); assert.equal(s.ratesCustom.USD, true); assert.equal(s.rates.USD, 4.3);
});
t("新版存檔沒自訂 → 資料預設值改了就自動跟著改", () => {
  const saved = JSON.parse(JSON.stringify(sanitizeState({}, data)));
  const s = sanitizeState(saved, withFx(9.1, 3.5));
  assert.equal(s.fx, 9.1); assert.equal(s.rates.USD, 3.5);
});
t("新版存檔有自訂 → 資料預設值改了也保留使用者的數字", () => {
  const saved = Object.assign(JSON.parse(JSON.stringify(sanitizeState({}, data))), { fx: 8, fxCustom: true, rates: { USD: 4 }, ratesCustom: { USD: true } });
  const s = sanitizeState(saved, withFx(9.1, 3.5));
  assert.equal(s.fx, 8); assert.equal(s.rates.USD, 4);
});
t("恢復預設：把 fxCustom 設回 false 後，下一次讀狀態就是預設值", () => {
  const s = sanitizeState({ fx: 6.9, fxCustom: true }, data);
  s.fxCustom = false; syncFxDefaults(s, data);
  assert.equal(s.fx, DEF);
});
t("遠端資料的預設值不同時，沒自訂的匯率跟著遠端資料", () => {
  const s = sanitizeState({}, data);
  syncFxDefaults(s, withFx(8.0, 3.9));
  assert.equal(s.fx, 8.0); assert.equal(s.rates.USD, 3.9);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
