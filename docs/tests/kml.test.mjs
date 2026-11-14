// 地圖匯出（KML）測試：地點數量、座標、行程連線、保護區範圍都要和行程資料一致；格式正確；不含物種觀測點位。
// 執行：node docs/tests/kml.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", "..");
const html = readFileSync(join(root, "sabah2027", "index.html"), "utf8");
const ctx = { globalThis: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core-js">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.EcoCore;
const sabah = {};
for (const m of html.matchAll(/<script type="application\/json" id="data-([a-z]+)">([\s\S]*?)<\/script>/g)) sabah[m[1]] = JSON.parse(m[2]);
const contrast = JSON.parse(readFileSync(join(here, "fixtures", "contrast-trip.json"), "utf8")); delete contrast._note;
const state = { pax: 4, rooms: 2, fx: 7.2, rates: {}, choices: {}, scenario: "mid", contingencyPct: 10, optionalOn: {}, overrides: {}, activity: {} };

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("✔", name); } catch (e) { fail++; console.log("✘", name, "\n   ", e.message); } }

/** 簡單的 XML 檢查：標籤成對、只有合法的實體 */
function wellFormed(xml) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, ""), stack = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:]*)([^>]*?)(\/?)>/g)) {
    if (m[4]) continue;
    if (m[1]) { const top = stack.pop(); if (top !== m[2]) throw new Error(`標籤不成對：</${m[2]}> 對到 <${top}>`); }
    else stack.push(m[2]);
  }
  if (stack.length) throw new Error("未關閉的標籤：" + stack.join(","));
  const text = body.replace(/<[^>]*>/g, "");
  assert.ok(!/[<>]/.test(text), "文字中有未跳脫的 < 或 >");
  assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(text), "有未跳脫的 &");
}
const placemarks = xml => [...xml.matchAll(/<Placemark(?: id="([^"]*)")?>([\s\S]*?)<\/Placemark>/g)].map(m => ({ id: m[1], body: m[2] }));
const coords = body => body.match(/<coordinates>([^<]*)<\/coordinates>/)[1].trim().split(/\s+/).map(c => c.split(",").map(Number));

for (const [label, data] of [["沙巴行程", sabah], ["對照旅行", contrast]]) {
  const xml = C.locationsKML(data, state), pms = placemarks(xml), pois = data.locations.pois;
  t(`${label}：KML 格式正確`, () => { assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')); wellFormed(xml); });
  t(`${label}：每個地點一個標記，座標（經度,緯度）與資料相同`, () => {
    const pts = pms.filter(p => p.id);
    assert.deepEqual(pts.map(p => p.id).sort(), pois.map(p => p.id).sort());
    for (const p of pois) { const [lng, lat] = coords(pts.find(x => x.id === p.id).body)[0]; assert.equal(lng, p.lng, p.id); assert.equal(lat, p.lat, p.id); }
  });
  t(`${label}：近似位置在名稱上標示`, () => {
    for (const p of pois) assert.equal(pms.find(x => x.id === p.id).body.includes("（近似位置）</name>"), !!p.approximate, p.id);
  });
  t(`${label}：行程連線依行程順序`, () => {
    const route = data.locations.route.map(id => C.resolveLodging(id, state, data)).filter(Boolean).map(id => C.poiById(data, id)).filter(Boolean);
    const line = pms.find(p => p.body.includes("<LineString>"));
    if (route.length < 2) return assert.equal(line, undefined);
    assert.deepEqual(coords(line.body), route.map(p => [p.lng, p.lat, 0]));
  });
  t(`${label}：保護區範圍是封閉方框`, () => {
    const polys = pms.filter(p => p.body.includes("<Polygon>")), areas = data.locations.areas.filter(a => a.bbox);
    assert.equal(polys.length, areas.length);
    for (const [i, a] of areas.entries()) { const r = coords(polys[i].body); assert.equal(r.length, 5); assert.deepEqual(r[0], r[4]); assert.deepEqual(r[0], [a.bbox.swlng, a.bbox.swlat, 0]); assert.deepEqual(r[2], [a.bbox.nelng, a.bbox.nelat, 0]); }
  });
  t(`${label}：標記只有地點、連線、範圍（沒有物種觀測點位）`, () => {
    const routeN = pms.filter(p => p.body.includes("<LineString>")).length, areaN = pms.filter(p => p.body.includes("<Polygon>")).length;
    assert.equal(pms.length, pois.length + routeN + areaN);
  });
}

t("沙巴行程：說明含物種名、相關日期與安全注意", () => {
  const xml = C.locationsKML(sabah, state), body = placemarks(xml).find(p => p.id === "tabin_resort").body;
  const sp = sabah.species.items.find(s => s.id === "leopard_cat");
  assert.ok(body.includes(sp.zh || sp.en));
  assert.match(body, /相關日期：Day \d/);
  assert.ok(body.includes("安全注意："));
  assert.deepEqual(C.poiDays(sabah, state, "tabin_resort").length > 0, true);
});
t("特殊字元會被跳脫", () => {
  const d = JSON.parse(JSON.stringify(contrast)); const p = d.locations.pois[0];
  p.name = `A & B <"x"> 'y'`; p.summary = "1 < 2 && 3 > 2\u0007";
  const xml = C.locationsKML(d, state); wellFormed(xml);
  assert.ok(xml.includes("A &amp; B &lt;&quot;x&quot;&gt; &apos;y&apos;"));
  assert.ok(!xml.includes("\u0007"));
});
t("Google 地圖連結只帶座標", () => {
  assert.equal(C.googleMapsUrl({ lat: 5.1883684, lng: 118.5009 }), "https://www.google.com/maps/search/?api=1&query=5.188368,118.500900");
});

console.log(`\n${pass} 通過，${fail} 失敗`);
if (fail) process.exit(1);
