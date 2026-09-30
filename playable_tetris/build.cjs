// Monta o playable: pega src/index.html, embute a fonte e a silhueta em
// base64 e grava UM HTML autocontido em entregas/playable_tetris/ (a pasta
// entregas/ é ignorada pelo git, como o resto das entregas deste repositório).
//
//   node playable_tetris/build.cjs
//
// As redes de anúncio exigem arquivo único e sem rede. Por isso o build
// REPROVA se sobrar marcador sem preencher, se aparecer qualquer recurso
// externo (src/href/url() apontando pra http) ou se passar do teto de tamanho.
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SRC = path.join(__dirname, "src", "index.html");
const OUT = path.join(REPO, "entregas", "playable_tetris", "nostalgia_tetris_playable.html");

// Teto mais apertado entre as redes comuns (Google Ads). Algumas aceitam 5 MB,
// mas quem cabe em 2 MB cabe em todas.
const LIMIT = 2 * 1024 * 1024;

// assets moram DENTRO desta pasta: o playable não depende do repo do app
const b64 = (rel) => fs.readFileSync(path.join(__dirname, rel)).toString("base64");

const ASSETS = {
  __FONT_PRESS_START__: "assets/PressStart2P-Regular.ttf", // SIL OFL
  __IMG_SILHOUETTE__: "assets/silhouette_0.webp", // arte própria, genérica
};

let html = fs.readFileSync(SRC, "utf8");
for (const [mark, rel] of Object.entries(ASSETS)) {
  if (!html.includes(mark)) throw new Error(`marcador ausente no fonte: ${mark}`);
  const data = b64(rel);
  html = html.split(mark).join(data); // sem .replace: base64 não pode virar padrão
}

const leftover = html.match(/__[A-Z0-9_]+__/g);
if (leftover) throw new Error(`marcador sem preencher: ${[...new Set(leftover)].join(", ")}`);

// recurso externo = anúncio reprovado (e, offline, tela quebrada)
const external = html.match(/(?:\bsrc|\bhref)\s*=\s*["']https?:|url\(\s*["']?https?:/gi);
if (external) throw new Error(`recurso externo encontrado: ${external.join(" | ")}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const size = Buffer.byteLength(html);
const kb = (size / 1024).toFixed(0);
const pct = ((size / LIMIT) * 100).toFixed(0);
console.log(`ok  ${path.relative(REPO, OUT)}  ${kb} KB  (${pct}% do teto de 2 MB)`);
if (size > LIMIT) {
  console.error("REPROVADO: acima de 2 MB");
  process.exit(1);
}
