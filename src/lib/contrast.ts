const LIGHT = "#ffffff";
const DARK = "#1a1e21";

function luminance(hex: string): number | null {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Cor de texto (branco ou grafite) com mais contraste sobre `background` (hex). */
export function readableTextOn(background: string): string {
  const bg = luminance(background);
  if (bg === null) return DARK;
  return contrast(bg, luminance(LIGHT)!) >= contrast(bg, luminance(DARK)!) ? LIGHT : DARK;
}
