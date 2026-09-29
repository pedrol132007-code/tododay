// PDF de exemplo para a demonstração, montado à mão (uma página, texto em Helvetica): nada é
// baixado da internet e não precisa de biblioteca.

/** Só ASCII entra no PDF sem fonte embutida: tira acentos e escapa os parênteses. */
const pdfText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/([\\()])/g, "\\$1");

/** Um PDF válido de uma página com um título e linhas de texto. */
export function buildDemoPdf(title: string, lines: string[]): Uint8Array<ArrayBuffer> {
  const content = [
    "BT /F1 18 Tf 56 780 Td",
    `(${pdfText(title)}) Tj`,
    "/F1 11 Tf 0 -34 Td 16 TL",
    ...lines.map((line) => `(${pdfText(line)}) '`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Tudo é ASCII, então cada caractere é um byte e os offsets acima batem.
  return new TextEncoder().encode(pdf);
}
