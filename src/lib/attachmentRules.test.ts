import { describe, expect, it } from "vitest";
import { ALLOWED_MIME_TYPES, checkAttachment, checkNameAndSize, cleanFileName, extensionOf, MAX_ATTACHMENT_BYTES } from "./attachmentRules";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));

const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "resto");
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF");
const PDF = bytes("%PDF-1.7\n...");
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], "qualquer.txt");
const docx = bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml", "word/document.xml");
const EXE = bytes("MZ", [0x90, 0x00, 0x03, 0x00]);

describe("checkNameAndSize (antes de enviar)", () => {
  it("aceita os tipos da lista, sem ligar para maiúsculas", () => {
    for (const name of ["a.png", "b.JPG", "c.jpeg", "d.webp", "e.gif", "f.pdf", "g.docx", "h.xlsx", "i.pptx", "j.txt", "k.csv", "l.zip"]) {
      expect(checkNameAndSize(name, 10)).toBeNull();
    }
  });

  it("recusa executáveis, scripts e o que não está na lista", () => {
    for (const name of ["a.exe", "b.bat", "c.sh", "d.js", "e.msi", "f.ps1", "g.cmd", "h.doc", "sem-extensao", "relatorio.pdf.exe"]) {
      expect(checkNameAndSize(name, 10)).toBe("type");
    }
  });

  it("limite de tamanho e arquivo vazio", () => {
    expect(checkNameAndSize("a.pdf", MAX_ATTACHMENT_BYTES)).toBeNull();
    expect(checkNameAndSize("a.pdf", MAX_ATTACHMENT_BYTES + 1)).toBe("tooLarge");
    expect(checkNameAndSize("a.pdf", 0)).toBe("empty");
  });
});

describe("checkAttachment (no servidor, com o conteúdo)", () => {
  it("aceita quando a assinatura confere com a extensão, e o tipo sai da extensão", () => {
    expect(checkAttachment("foto.png", PNG)).toEqual({ ok: true, mime: "image/png", kind: "image" });
    expect(checkAttachment("foto.jpg", JPG)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(checkAttachment("contrato.pdf", PDF)).toMatchObject({ ok: true, kind: "pdf" });
    expect(checkAttachment("pacote.zip", ZIP)).toMatchObject({ ok: true, kind: "archive" });
    expect(checkAttachment("ata.docx", docx)).toMatchObject({ ok: true, kind: "document" });
    expect(checkAttachment("notas.txt", bytes("Reunião às 14h\nçã"))).toMatchObject({ ok: true, kind: "text" });
    expect(checkAttachment("dados.csv", bytes([0x6e, 0x6f, 0x6d, 0x65, 0x3b, 0xe7, 0xe3, 0x0a]))).toMatchObject({ ok: true }); // Latin-1
  });

  it("recusa executável renomeado e conteúdo que não bate", () => {
    expect(checkAttachment("relatorio.pdf", EXE)).toEqual({ ok: false, problem: "content" });
    expect(checkAttachment("foto.png", JPG)).toEqual({ ok: false, problem: "content" });
    expect(checkAttachment("planilha.xlsx", docx)).toEqual({ ok: false, problem: "content" }); // docx renomeado
    expect(checkAttachment("ata.docx", ZIP)).toEqual({ ok: false, problem: "content" }); // zip comum não é docx
  });

  it("texto com byte nulo ou com cara de script é recusado", () => {
    expect(checkAttachment("x.txt", bytes("abc", [0], "def"))).toEqual({ ok: false, problem: "content" });
    expect(checkAttachment("x.txt", bytes("#!/bin/sh\nrm -rf /"))).toEqual({ ok: false, problem: "content" });
    expect(checkAttachment("x.txt", EXE)).toEqual({ ok: false, problem: "content" });
  });

  it("confere tamanho e tipo antes do conteúdo", () => {
    expect(checkAttachment("x.exe", EXE)).toEqual({ ok: false, problem: "type" });
    expect(checkAttachment("x.pdf", new Uint8Array())).toEqual({ ok: false, problem: "empty" });
  });
});

describe("nomes", () => {
  it("extensão", () => {
    expect(extensionOf("a.tar.GZ")).toBe("gz");
    expect(extensionOf(".bashrc")).toBe("");
  });

  it("nome original limpo: sem pastas nem controle, até 255 mantendo a extensão", () => {
    expect(cleanFileName("C:\\Users\\ana\\relatório final.pdf")).toBe("relatório final.pdf");
    expect(cleanFileName("../../etc/x\u0000.txt")).toBe("x.txt");
    const long = cleanFileName(`${"a".repeat(300)}.pdf`);
    expect(long).toHaveLength(255);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("os tipos do bucket não se repetem", () => {
    expect(new Set(ALLOWED_MIME_TYPES).size).toBe(ALLOWED_MIME_TYPES.length);
    expect(ALLOWED_MIME_TYPES).toHaveLength(11);
  });
});
