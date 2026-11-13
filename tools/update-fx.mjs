// 更新行程的預設匯率（trip.default_fx、trip.currency.default_rates、trip.fx_note）。
//
// 臺灣銀行的 CSV 下載網址有機器人驗證，不能用程式直接抓；請在瀏覽器開啟牌告匯率頁
// https://rate.bot.com.tw/xrt/ ，把「本行賣出」的數字填進參數。
//
// 用法：
//   node tools/update-fx.mjs --base 8.563 --rate USD=33.155 --time "2026-11-13 07:51"
//   node tools/update-fx.mjs --trip sabah2027 --base 8.563 --rate USD=33.155 --time "2026-11-13 07:51" --kind 現金賣出
//   node tools/update-fx.mjs ... --dry-run     （只顯示會改成什麼，不寫檔）
//
// 參數：
//   --base <數字>      1 本位幣（行程的 currency.base，例如 MYR）= ? 本國幣（currency.home，例如 TWD）
//   --rate CUR=<數字>  1 CUR = ? 本國幣；寫入時換算成本位幣：CUR 匯率 ÷ base。可重複
//   --time <文字>      牌告掛牌時間，寫進匯率說明
//   --kind <文字>      用的是哪一種牌價（預設「現金賣出」）
//
// 使用者瀏覽器裡沒自訂過的匯率，會在下次開網頁時自動改用新的預設值；自訂過的不受影響。
// 舊的預設值會加進 trip.legacy_defaults，讓很舊的存檔也能正確判斷「沒改過」。
// 改完請執行測試與 node tools/build-site.mjs。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = { trip: "sabah2027", kind: "現金賣出", rates: {}, dry: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = args[i + 1];
  if (a === "--trip") { opt.trip = v; i++; }
  else if (a === "--base") { opt.base = Number(v); i++; }
  else if (a === "--rate") { const [k, x] = String(v).split("="); opt.rates[k.toUpperCase()] = Number(x); i++; }
  else if (a === "--time") { opt.time = v; i++; }
  else if (a === "--kind") { opt.kind = v; i++; }
  else if (a === "--dry-run") opt.dry = true;
  else { console.error(`不認得的參數：${a}`); process.exit(2); }
}
const bad = x => !(Number.isFinite(x) && x > 0 && x < 100000);
if (bad(opt.base) || !opt.time || Object.values(opt.rates).some(bad)) {
  console.error("需要 --base <數字> 與 --time <掛牌時間>；--rate 的數字必須是正數。用法見檔案開頭說明。");
  process.exit(2);
}

const file = join(root, opt.trip, "index.html");
const html = readFileSync(file, "utf8");
const re = /(<script type="application\/json" id="data-trip">\n)([^]*?)(\n<\/script>)/;
const m = html.match(re);
if (!m) { console.error(`${file} 找不到 data-trip 區塊`); process.exit(1); }
const trip = JSON.parse(m[2]);
const cur = trip.currency || {}, base = cur.base, home = cur.home;
if (!base || !home) { console.error("trip.currency 需要 base 與 home"); process.exit(1); }
const known = Object.keys(cur.default_rates || {});
for (const k of Object.keys(opt.rates)) if (!known.includes(k)) { console.error(`${k} 不在 trip.currency.default_rates（現有：${known.join("、") || "無"}）`); process.exit(1); }
for (const k of known) if (!(k in opt.rates)) console.warn(`提醒：沒有提供 ${k} 的匯率，維持 ${cur.default_rates[k]}`);

const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const before = { fx: trip.default_fx, rates: Object.assign({}, cur.default_rates) };
const legacy = trip.legacy_defaults = trip.legacy_defaults || {};
const addLegacy = (arr, v) => { arr = arr || []; if (Number.isFinite(v) && !arr.includes(v)) arr.push(v); return arr; };

legacy.fx = addLegacy(legacy.fx, before.fx);
trip.default_fx = opt.base;
const parts = [`1 ${base} = ${opt.base} ${home}`];
for (const [k, homePerUnit] of Object.entries(opt.rates)) {
  const v = round(homePerUnit / opt.base, 4);
  legacy.rates = legacy.rates || {};
  legacy.rates[k] = addLegacy(legacy.rates[k], before.rates[k]);
  cur.default_rates[k] = v;
  // 舊欄位（例如 default_usd_myr）若存在一起更新
  const oldKey = `default_${k.toLowerCase()}_${base.toLowerCase()}`;
  if (oldKey in trip) trip[oldKey] = v;
  parts.push(`${k} ${opt.kind} ${homePerUnit} ${home}，換算 1 ${k} = ${v} ${base}（= ${homePerUnit} ÷ ${opt.base}，讓 ${k} 計價項目換成${home}時等於直接用 ${k} 的${opt.kind}價）`);
}
trip.fx_note = `臺灣銀行牌告匯率（${opt.time} 掛牌），用${opt.kind}價：${parts.join("；")}。用賣出價是為了保守估算換匯成本；刷卡或即期匯率通常較低。匯率每天變動，付款或換匯前請再更新（node tools/update-fx.mjs）。`;

console.log(`${opt.trip}：1 ${base} = ${before.fx} → ${trip.default_fx} ${home}`);
for (const k of Object.keys(opt.rates)) console.log(`${opt.trip}：1 ${k} = ${before.rates[k]} → ${cur.default_rates[k]} ${base}`);
if (opt.dry) { console.log("（--dry-run，未寫檔）"); process.exit(0); }
writeFileSync(file, html.replace(re, (_, a, __, c) => a + JSON.stringify(trip, null, 1) + c));
console.log(`已寫入 ${opt.trip}/index.html。接著執行測試與 node tools/build-site.mjs，再提交。`);
