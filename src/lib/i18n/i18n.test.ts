import { describe, expect, it } from "vitest";
import { msg, pick, pickMsg, resolveLocale } from "./index";

describe("i18n", () => {
  it("defaults to English and detects Spanish browsers", () => {
    expect(resolveLocale(null, null)).toBe("en");
    expect(resolveLocale(null, "en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale(null, "es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(resolveLocale(null, "fr-FR")).toBe("en");
  });
  it("lets the cookie override the browser", () => {
    expect(resolveLocale("en", "es-ES")).toBe("en");
    expect(resolveLocale("es", "en-US")).toBe("es");
    expect(resolveLocale("de", "es-ES")).toBe("es");
  });
  it("resolves bilingual values and encoded messages", () => {
    expect(pick({ en: "Hi", es: "Hola" }, "es")).toBe("Hola");
    expect(pick("plain", "es")).toBe("plain");
    expect(pickMsg(msg("Too long", "Muy largo"), "en")).toBe("Too long");
    expect(pickMsg(msg("Too long", "Muy largo"), "es")).toBe("Muy largo");
    expect(pickMsg("plain", "es")).toBe("plain");
  });
});
