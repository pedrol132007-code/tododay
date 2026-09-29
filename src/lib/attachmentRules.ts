// Regras dos anexos: tamanho, tipos permitidos e conferência do conteúdo real do arquivo (os
// primeiros bytes), não só da extensão. Sem imports de propósito: este arquivo também entra na
// Edge Function (supabase/functions/attachments/handler.ts), que valida no servidor com as mesmas regras.

/** Limite por arquivo. Mudou aqui? Mude também o file_size_limit do bucket (migration). */
export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export type AttachmentKind = "image" | "pdf" | "document" | "spreadsheet" | "presentation" | "text" | "archive";

interface AllowedType {
  mime: string;
  kind: AttachmentKind;
  /** Confere a assinatura do conteúdo. */
  matches: (bytes: Uint8Array) => boolean;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const includesAscii = (bytes: Uint8Array, text: string) => {
  const needle = ascii(text);
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
/** docx/xlsx/pptx são zip com as pastas do Office dentro (os nomes ficam sem compressão no zip). */
const isOffice = (folder: string) => (b: Uint8Array) => isZip(b) && includesAscii(b, "[Content_Types].xml") && includesAscii(b, folder);

/** Texto: sem byte nulo e sem cara de script (#!) ou de executável. */
function isPlainText(b: Uint8Array): boolean {
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return false;
  if (startsWith(head, ascii("#!"))) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length === b.length ? head : trimPartialUtf8(head));
    return true;
  } catch {
    // Arquivo antigo em Latin-1 (acentos de um byte) também é texto.
    return !head.some((x) => x < 0x09 || (x > 0x0d && x < 0x20));
  }
}

/** Corta um caractere UTF-8 que ficou pela metade no fim do trecho lido. */
function trimPartialUtf8(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const x = b[end - i];
    if ((x & 0xc0) === 0x80) continue; // byte de continuação
    const need = x >= 0xf0 ? 4 : x >= 0xe0 ? 3 : x >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return b.subarray(0, end);
}

/** Extensão (minúscula, sem ponto) → tipo aceito. O que não está aqui é recusado. */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  png: { mime: "image/png", kind: "image", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", kind: "image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", kind: "image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: "image/webp", kind: "image", matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8) },
  gif: { mime: "image/gif", kind: "image", matches: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")) },
  pdf: { mime: "application/pdf", kind: "pdf", matches: (b) => startsWith(b, ascii("%PDF-")) },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", matches: isOffice("word/") },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "spreadsheet", matches: isOffice("xl/") },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "presentation", matches: isOffice("ppt/") },
  txt: { mime: "text/plain", kind: "text", matches: isPlainText },
  csv: { mime: "text/csv", kind: "text", matches: isPlainText },
  zip: { mime: "application/zip", kind: "archive", matches: isZip },
};

/** Tipos aceitos, para o bucket (allowed_mime_types) e para o seletor de arquivos. */
export const ALLOWED_MIME_TYPES = [...new Set(Object.values(ALLOWED_TYPES).map((t) => t.mime))];
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES).map((ext) => `.${ext}`).join(",");

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** Nome original limpo para guardar como metadado: sem pastas, sem caracteres de controle, até 255. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (clean.length <= 255) return clean;
  const ext = extensionOf(clean);
  return ext ? `${clean.slice(0, 254 - ext.length)}.${ext}` : clean.slice(0, 255);
}

export type AttachmentProblem = "empty" | "tooLarge" | "type" | "content";

export const PROBLEM_TEXT: Record<AttachmentProblem, string> = {
  empty: "O arquivo está vazio.",
  tooLarge: `O arquivo passa de ${MAX_ATTACHMENT_MB} MB.`,
  type: "Esse tipo de arquivo não é aceito. Anexe imagens (png, jpg, webp, gif), pdf, docx, xlsx, pptx, txt, csv ou zip.",
  content: "O conteúdo do arquivo não confere com a extensão dele.",
};

/** O que dá para saber sem ler o arquivo: nome e tamanho (a tela usa antes de enviar). */
export function checkNameAndSize(name: string, size: number): AttachmentProblem | null {
  if (size <= 0) return "empty";
  if (size > MAX_ATTACHMENT_BYTES) return "tooLarge";
  if (!ALLOWED_TYPES[extensionOf(name)]) return "type";
  return null;
}

/**
 * A validação completa, com o conteúdo (a do servidor). Um .exe renomeado para .pdf não tem a
 * assinatura de PDF e é recusado; .js, .sh, .bat, .msi etc. nem estão na lista.
 */
export function checkAttachment(name: string, bytes: Uint8Array): { ok: true; mime: string; kind: AttachmentKind } | { ok: false; problem: AttachmentProblem } {
  const problem = checkNameAndSize(name, bytes.length);
  if (problem) return { ok: false, problem };
  const type = ALLOWED_TYPES[extensionOf(name)];
  if (!type.matches(bytes)) return { ok: false, problem: "content" };
  return { ok: true, mime: type.mime, kind: type.kind };
}

/** Tipo pelo nome (para o ícone e para o Content-Type do envio). */
export const typeOfName = (name: string): AllowedType | null => ALLOWED_TYPES[extensionOf(name)] ?? null;
