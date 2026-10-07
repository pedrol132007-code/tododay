// Fotos da demonstração: um retrato ilustrado em SVG (fundo, ombros e cabeça), gerado a partir do
// id. Data URL síncrona e pura, sem canvas: roda nos testes e não sobe nada para o Storage.
// Cores de "foto", não de interface: tons de pele e fundos neutros, iguais nos dois temas.

const BACKGROUNDS = ["rgb(214 222 235)", "rgb(229 221 208)", "rgb(212 228 220)", "rgb(232 214 220)"];
const SKIN = ["rgb(241 205 176)", "rgb(198 145 108)", "rgb(140 94 66)", "rgb(224 178 142)"];
const SHIRTS = ["rgb(37 56 255)", "rgb(60 64 72)", "rgb(196 58 49)", "rgb(90 110 90)"];
const HAIR = ["rgb(40 30 24)", "rgb(112 72 40)", "rgb(20 20 20)", "rgb(160 120 70)"];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function demoAvatarUrl(id: string, name: string): string {
  const h = hash(id);
  const pick = (list: string[], shift: number) => list[(h >>> shift) % list.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${name} (foto fictícia)</title>` +
    `<rect width="64" height="64" fill="${pick(BACKGROUNDS, 0)}"/>` +
    `<path d="M10 64c2-14 11-20 22-20s20 6 22 20z" fill="${pick(SHIRTS, 4)}"/>` +
    `<circle cx="32" cy="27" r="13" fill="${pick(SKIN, 8)}"/>` +
    `<path d="M19 26c0-9 6-14 13-14s13 5 13 14c-3-5-8-7-13-7s-10 2-13 7z" fill="${pick(HAIR, 12)}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
