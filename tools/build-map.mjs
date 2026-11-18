#!/usr/bin/env node
// Generates data/nlmap.json (SVG paths per province) from CBS/PDOK province boundaries.
// Usage: node tools/build-map.mjs   (requires network + npx mapshaper)
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "nlmap-"));
const src = join(tmp, "prov.json");
const out = join(tmp, "prov_rd.json");
const lsrc = join(tmp, "label.json");
const lout = join(tmp, "label_rd.json");

const YEAR = 2025;
const api = (c) => `https://api.pdok.nl/cbs/gebiedsindelingen/ogc/v1/collections/${c}/items?f=json&limit=20&jaarcode=${YEAR}`;
for (const [c, file] of [["provincie_gegeneraliseerd", src], ["provincie_labelpoint", lsrc]]) {
  const res = await fetch(api(c));
  if (!res.ok) throw new Error(`PDOK ${c} ${res.status}`);
  writeFileSync(file, await res.text());
}

// RD New (EPSG:28992) gives the familiar Dutch map shape.
const RD = "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs";
execSync(
  `npx -y mapshaper "${src}" -proj "${RD}" -simplify 8% keep-shapes -filter-fields statnaam -o "${out}" precision=10`,
  { stdio: "inherit", shell: true }
);
execSync(`npx -y mapshaper "${lsrc}" -proj "${RD}" -filter-fields statnaam -o "${lout}" precision=10`, { stdio: "inherit", shell: true });
const labels = Object.fromEntries(
  JSON.parse(readFileSync(lout, "utf8")).features.map((f) => [f.properties.statnaam, f.geometry.coordinates])
);

const geo = JSON.parse(readFileSync(out, "utf8"));
const slug = (n) =>
  ({ "Fryslân": "friesland" })[n] ??
  n.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, "-");

// Bounds over all features
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const eachPt = (g, fn) => {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) for (const p of ring) fn(p);
};
for (const f of geo.features) eachPt(f.geometry, ([x, y]) => {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
});

const SCALE = 1000 / (maxX - minX); // viewBox width 1000
const PAD = 10;
const tx = (x) => Math.round((x - minX) * SCALE * 10) / 10 + PAD;
const ty = (y) => Math.round((maxY - y) * SCALE * 10) / 10 + PAD;
const width = Math.ceil((maxX - minX) * SCALE) + PAD * 2;
const height = Math.ceil((maxY - minY) * SCALE) + PAD * 2;

const provinces = geo.features.map((f) => {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = "";
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const poly of polys) for (const ring of poly) {
    d += ring.slice(0, -1).map(([x, y], i) => {
      const X = tx(x), Y = ty(y);
      bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X);
      by0 = Math.min(by0, Y); by1 = Math.max(by1, Y);
      return (i ? "L" : "M") + X + "," + Y;
    }).join("") + "Z";
  }
  return {
    id: slug(f.properties.statnaam),
    name: f.properties.statnaam,
    d,
    label: labels[f.properties.statnaam] ? [tx(labels[f.properties.statnaam][0]), ty(labels[f.properties.statnaam][1])] : null,
    bbox: [bx0, by0, Math.round((bx1 - bx0) * 10) / 10, Math.round((by1 - by0) * 10) / 10],
  };
});

writeFileSync(
  join(root, "data", "nlmap.json"),
  JSON.stringify({ viewBox: `0 0 ${width} ${height}`, source: `CBS/PDOK provincie_gegeneraliseerd ${YEAR}`, provinces }, null, 1)
);
console.log(`Wrote data/nlmap.json (${provinces.length} provinces, viewBox 0 0 ${width} ${height})`);
