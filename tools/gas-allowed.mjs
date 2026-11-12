// 從 index.html 的引擎與行程資料，印出 gas/Code.gs 開頭的 ALLOWED 區塊（單一來源在網站這一邊）。
// 用法：node tools/gas-allowed.mjs          印出應有的 ALLOWED 區塊
//       node tools/gas-allowed.mjs --write  直接寫回 gas/Code.gs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// --trip <資料夾>：指定行程資料夾（預設 sabah2027）。該資料夾要有 index.html（其他行程先執行 node tools/build-site.mjs 產生）。
const ti = process.argv.indexOf("--trip"), trip = ti >= 0 ? process.argv[ti + 1] : "sabah2027";
if (!trip || !/^[A-Za-z0-9_.-]+$/.test(trip) || !existsSync(join(root, trip, "index.html"))) { console.error(`找不到行程資料夾「${trip}」的 index.html（先執行 node tools/build-site.mjs）`); process.exit(2); }
const html = readFileSync(join(root, trip, "index.html"), "utf8");
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([^]*?)<\/script>/)[1], ctx);
const data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([^]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const a = ctx.EcoCore.allowedValues(data);
const order = ["category", "unit", "status", "applies", "price_currency", "when", "qty_from", "dataset"];
const block = "var ALLOWED = {\n" + order.map(k => `  ${k}: ${JSON.stringify(a[k]).replace(/","/g, '", "')}`).join(",\n") + "\n};";
if (!process.argv.includes("--write")) { console.log(block); process.exit(0); }
// 沙巴直接改 gas/Code.gs；其他行程以 gas/Code.gs 為範本，寫到該行程資料夾的 Code.gs（每趟旅行用各自的試算表與 Apps Script）
const file = trip === "sabah2027" ? join(root, "gas", "Code.gs") : join(root, trip, "Code.gs");
const src = readFileSync(join(root, "gas", "Code.gs"), "utf8");
const re = /var ALLOWED = \{[^]*?\n\};/;
if (!re.test(src)) { console.error("在 gas/Code.gs 找不到 ALLOWED 區塊"); process.exit(1); }
writeFileSync(file, src.replace(re, () => block));
console.log(`已寫入 ${trip === "sabah2027" ? "gas/Code.gs" : trip + "/Code.gs"} 的 ALLOWED；記得在 Apps Script 重新貼上並執行 setupSheets()`);
