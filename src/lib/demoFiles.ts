// Arquivos dos anexos de exemplo, criados no navegador (canvas para as imagens, demoPdf para o
// PDF): nada é baixado nem enviado. Devolve URLs blob:, que quem chama libera com revokeDemoFiles.
import type { DemoArt, DemoAttachment } from "./demoBoard";
import { buildDemoPdf } from "./demoPdf";

export interface DemoFile {
  url: string;
  size: number;
}

// Cores de papel impresso: um documento fotografado é claro nos dois temas. O azul é o da Benner
// (primary / chart-1), como nos gráficos do dashboard.
const PAPER = { background: "rgb(255 255 255)", ink: "rgb(26 30 33)", muted: "rgb(110 116 122)", line: "rgb(222 224 227)", blue: "rgb(37 56 255)" };

function draw(art: Exclude<DemoArt, "contract">, title: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 500;
  const g = canvas.getContext("2d")!;
  const { background, ink, muted, line, blue } = PAPER;
  g.fillStyle = background;
  g.fillRect(0, 0, 800, 500);
  g.font = "600 30px Montserrat, sans-serif";
  g.fillStyle = ink;
  const heading: Record<typeof art, string> = { receipt: "Nota fiscal · exemplo", chart: "Resultado do mês · exemplo", screenshot: "Tela do sistema · exemplo" };
  g.fillText(heading[art], 48, 72);
  g.font = "20px Montserrat, sans-serif";
  g.fillStyle = muted;
  g.fillText(title.slice(0, 60), 48, 108);

  if (art === "chart") {
    // Colunas em azul Benner, como os gráficos do dashboard.
    g.fillStyle = blue;
    [0.45, 0.7, 0.55, 0.85, 0.6, 0.95].forEach((h, i) => g.fillRect(70 + i * 115, 440 - h * 280, 70, h * 280));
  } else {
    g.strokeStyle = line;
    g.lineWidth = 2;
    for (let y = 170; y < 420; y += 44) {
      g.beginPath();
      g.moveTo(48, y);
      g.lineTo(752, y);
      g.stroke();
      g.fillStyle = muted;
      g.fillRect(48, y - 26, 180 + ((y * 7) % 260), 12);
    }
    if (art === "receipt") {
      g.font = "600 26px Montserrat, sans-serif";
      g.fillStyle = ink;
      g.fillText("Total: R$ 1.284,90", 480, 462);
    } else {
      g.fillStyle = blue;
      g.fillRect(600, 420, 150, 48);
    }
  }
  g.font = "16px Montserrat, sans-serif";
  g.fillStyle = muted;
  g.fillText("Documento fictício da demonstração do Tododay", 48, 486);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

/** Um arquivo por anexo de exemplo, pelo id do anexo. */
export async function makeDemoFiles(attachments: DemoAttachment[], titleOf: (taskId: string) => string): Promise<Map<string, DemoFile>> {
  const files = new Map<string, DemoFile>();
  for (const a of attachments) {
    const title = titleOf(a.taskId);
    const blob =
      a.art === "contract"
        ? new Blob(
            [buildDemoPdf("Minuta de contrato (exemplo)", [title, "", "Clausula 1. Objeto: prestacao de servicos.", "Clausula 2. Prazo: 12 meses.", "", "Documento ficticio da demonstracao do Tododay."])],
            { type: "application/pdf" },
          )
        : await draw(a.art, title);
    files.set(a.id, { url: URL.createObjectURL(blob), size: blob.size });
  }
  return files;
}

export function revokeDemoFiles(files: Map<string, DemoFile>) {
  for (const f of files.values()) URL.revokeObjectURL(f.url);
}
