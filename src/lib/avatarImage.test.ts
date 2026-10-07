import { describe, expect, it } from "vitest";
import { avatarFileError, centerSquare, MAX_AVATAR_INPUT_BYTES } from "./avatarImage";

describe("avatarFileError", () => {
  it("aceita PNG, JPEG e WebP", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) expect(avatarFileError({ type, size: 1000 })).toBeNull();
  });
  it("recusa outros formatos com mensagem clara", () => {
    expect(avatarFileError({ type: "image/heic", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
    expect(avatarFileError({ type: "image/gif", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
    expect(avatarFileError({ type: "", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
  });
  it("recusa arquivo grande demais antes de abrir", () => {
    expect(avatarFileError({ type: "image/png", size: MAX_AVATAR_INPUT_BYTES + 1 })).toBe("Imagem grande demais (máximo 15 MB).");
  });
});

describe("centerSquare", () => {
  it("corta o centro de uma imagem deitada", () => expect(centerSquare(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 }));
  it("corta o centro de uma imagem em pé", () => expect(centerSquare(200, 401)).toEqual({ sx: 0, sy: 100, side: 200 }));
  it("quadrada fica inteira", () => expect(centerSquare(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 }));
});
