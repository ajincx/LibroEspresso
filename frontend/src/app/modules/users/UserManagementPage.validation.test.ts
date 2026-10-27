import { describe, expect, it } from "vitest";
import { normalizeUserEmail, normalizeUserName, normalizeUserPhone, validUserEmail, validUserPhone } from "./UserManagementPage";

describe("user management contact validation", () => {
  it("normalizes names, emails, and supported Philippine mobile formats", () => {
    expect(normalizeUserName(" Ana   Maria ")).toBe("Ana Maria");
    expect(normalizeUserEmail(" ANA@Libro.PH ")).toBe("ana@libro.ph");
    expect(normalizeUserPhone("09171234567")).toBe("+639171234567");
    expect(validUserPhone("+639171234567")).toBe(true);
  });

  it("rejects malformed email and mobile values without restricting valid domains", () => {
    expect(validUserEmail("owner@gmail.com")).toBe(true);
    expect(validUserEmail("owner@libro.ph")).toBe(true);
    expect(validUserEmail("owner.example.com")).toBe(false);
    expect(validUserPhone("0917ABC4567")).toBe(false);
    expect(validUserPhone("0917123456")).toBe(false);
  });
});
