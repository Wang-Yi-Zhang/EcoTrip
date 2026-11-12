// 用另一趟行程的資料產生網頁：把 index.html 裡的 7 個 data-* 區塊換成指定 JSON 的內容，程式碼原封不動。
// 用法：node tools/build-trip.mjs <行程資料.json> <輸出.html>
// 行程資料的格式見 docs/02-資料結構說明.md；可參考 docs/tests/fixtures/contrast-trip.json。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("用法：node tools/build-trip.mjs <行程資料.json> <輸出.html>"); process.exit(2); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const data = JSON.parse(readFileSync(src, "utf8"));
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.EcoCore, errs = [];
for (const k of C.DATASETS) { if (!data[k]) { errs.push(`缺少資料集 ${k}`); continue; } errs.push(...C.validateDataset(k, data[k]).map(e => `[${k}] ${e}`)); }
if (!errs.length) errs.push(...C.validateReferences(data));
if (errs.length) { console.error("資料有錯，未產生網頁：\n- " + errs.join("\n- ")); process.exit(1); }
for (const k of C.DATASETS) html = html.replace(new RegExp(`(<script type="application/json" id="data-${k}">)[^]*?(</script>)`), (m, a, b) => a + "\n" + JSON.stringify(data[k], null, 1).replace(/<\//g, "<\\/") + "\n" + b);
if (!html.includes(JSON.stringify(data.trip.id))) { console.error("資料區塊沒有被換掉，未產生網頁"); process.exit(1); }
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(data.trip.title)}</title>`).replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(data.trip.title)}">`);
writeFileSync(out, html);
console.log(`已產生 ${out}（${data.trip.title}）`);
