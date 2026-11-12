// 從 index.html 的引擎與行程資料，印出 gas/Code.gs 開頭的 ALLOWED 區塊（單一來源在網站這一邊）。
// 用法：node tools/gas-allowed.mjs          印出應有的 ALLOWED 區塊
//       node tools/gas-allowed.mjs --write  直接寫回 gas/Code.gs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([^]*?)<\/script>/)[1], ctx);
const data = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([^]*?)<\/script>/g)) data[m[1]] = JSON.parse(m[2]);
const a = ctx.EcoCore.allowedValues(data);
const order = ["category", "unit", "status", "applies", "price_currency", "when", "qty_from", "dataset"];
const block = "var ALLOWED = {\n" + order.map(k => `  ${k}: ${JSON.stringify(a[k]).replace(/","/g, '", "')}`).join(",\n") + "\n};";
if (!process.argv.includes("--write")) { console.log(block); process.exit(0); }
const file = join(root, "gas", "Code.gs");
const src = readFileSync(file, "utf8");
const re = /var ALLOWED = \{[^]*?\n\};/;
if (!re.test(src)) { console.error("在 gas/Code.gs 找不到 ALLOWED 區塊"); process.exit(1); }
writeFileSync(file, src.replace(re, () => block));
console.log("已更新 gas/Code.gs 的 ALLOWED；記得在 Apps Script 重新貼上並執行 setupSheets()");
