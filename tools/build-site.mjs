// 整理整個網站：每趟旅行一個資料夾，根目錄的 index.html 是列出所有旅行的首頁。
// 用法：node tools/build-site.mjs           重新產生各行程網頁與首頁
//       node tools/build-site.mjs --check   只檢查首頁與各行程網頁是否已是最新（給自動測試用），不寫檔
//
// 規則：
// - sabah2027/index.html 是程式碼的來源（引擎、介面、樣式都在這裡維護），它的行程資料直接寫在檔案裡。
// - 其他行程資料夾放一個 trip.json（格式見 docs/07 第 3 節）；本工具用它產生同資料夾的 index.html，並複製 sw.js。
// - 修改程式後再執行一次，所有行程的網頁都會更新。
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "sabah2027", SKIP = new Set(["docs", "gas", "tools", "node_modules"]);
const check = process.argv.includes("--check");
const same = (file, text) => existsSync(file) && readFileSync(file, "utf8").replace(/\r\n/g, "\n") === text.replace(/\r\n/g, "\n");
const stale = [];

const dirs = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name)).map(d => d.name).sort();
for (const d of dirs) {
  const json = join(root, d, "trip.json");
  if (d === SOURCE || !existsSync(json)) continue;
  const tmp = join(mkdtempSync(join(tmpdir(), "trip-")), "index.html");
  execFileSync(process.execPath, [join(root, "tools", "build-trip.mjs"), json, tmp], { stdio: ["ignore", "ignore", "inherit"] });
  const html = readFileSync(tmp, "utf8"), sw = readFileSync(join(root, SOURCE, "sw.js"), "utf8");
  if (!same(join(root, d, "index.html"), html)) { stale.push(d + "/index.html"); if (!check) writeFileSync(join(root, d, "index.html"), html); }
  if (!same(join(root, d, "sw.js"), sw)) { stale.push(d + "/sw.js"); if (!check) copyFileSync(join(root, SOURCE, "sw.js"), join(root, d, "sw.js")); }
}

// 首頁：列出每個有行程網頁的資料夾
const trips = [];
for (const d of dirs) {
  const page = join(root, d, "index.html"), json = join(root, d, "trip.json");
  let t = null;
  if (d !== SOURCE && existsSync(json)) t = JSON.parse(readFileSync(json, "utf8")).trip;      // --check 時網頁可能還沒產生，以資料檔為準
  else if (existsSync(page)) { const m = readFileSync(page, "utf8").match(/<script type="application\/json" id="data-trip">([^]*?)<\/script>/); if (m) t = JSON.parse(m[1]); }
  if (t) trips.push({ dir: d, title: t.title, start: t.start, end: t.end, nights: t.nights, region: t.region_label || "" });
}
trips.sort((a, b) => b.start.localeCompare(a.start));
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const landing = `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>旅行規劃</title>
<meta name="theme-color" content="#1E2922">
<!-- 這個檔案由 node tools/build-site.mjs 產生，請勿手改 -->
<style>
body{margin:0;font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;background:#1E2922;color:#F5F0E6;line-height:1.6}
main{max-width:760px;margin:0 auto;padding:28px 16px}
h1{font-size:1.4rem;margin:0 0 4px}
p{color:#BDB6A9;margin:.2em 0 1.2em}
ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
a.trip{display:block;background:#26352C;border:1px solid #3E5247;border-radius:12px;padding:14px 16px;color:inherit;text-decoration:none}
a.trip:hover,a.trip:focus-visible{border-color:#D97706;outline:none}
a.trip b{display:block;font-size:1.05rem;color:#F2B45A}
a.trip span{color:#BDB6A9;font-size:.9rem}
</style>
</head>
<body>
<main>
<h1>旅行規劃</h1>
<p>每趟旅行各有一個網頁；設定、勾選與備註分開保存，互不影響。</p>
<ul>
${trips.map(t => `<li><a class="trip" href="./${encodeURIComponent(t.dir)}/"><b>${esc(t.title)}</b><span>${esc(t.start)} – ${esc(t.end)}｜${t.nights + 1} 天 ${t.nights} 夜${t.region ? "｜" + esc(t.region) : ""}</span></a></li>`).join("\n")}
</ul>
</main>
</body>
</html>
`;
if (!same(join(root, "index.html"), landing)) { stale.push("index.html"); if (!check) writeFileSync(join(root, "index.html"), landing); }

if (check) { if (stale.length) { console.error("以下檔案不是最新，請執行 node tools/build-site.mjs：\n- " + stale.join("\n- ")); process.exit(1); } console.log(`網站已是最新（${trips.length} 趟旅行）`); }
else console.log(`${trips.length} 趟旅行：${trips.map(t => t.dir).join("、")}｜${stale.length ? "已更新 " + stale.join("、") : "沒有需要更新的檔案"}`);
