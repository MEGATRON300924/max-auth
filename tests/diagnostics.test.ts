import { sanitizeDiagnosticPath } from "../src/utils/diagnostics";

describe("sanitizeDiagnosticPath", () => {
  it("removes query strings and fragments before logging", () => {
    expect(sanitizeDiagnosticPath("/search?access_token=private-secret#section")).toBe("/search");
  });

  it("masks numeric IDs, UUIDs, email-like values and opaque tokens", () => {
    expect(sanitizeDiagnosticPath("/users/123/profile")).toBe("/users/:id/profile");
    expect(sanitizeDiagnosticPath("/users/ab12cd34-1234-1234-1234-123456789abc")).toBe("/users/:id");
    expect(sanitizeDiagnosticPath("/lookup/person%40example.com")).toBe("/lookup/:id");
    expect(sanitizeDiagnosticPath("/sessions/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH")).toBe("/sessions/:id");
  });

  it("preserves safe route names and handles malformed encoding", () => {
    expect(sanitizeDiagnosticPath("/admin/diagnostics/events")).toBe("/admin/diagnostics/events");
    expect(sanitizeDiagnosticPath("/bad/%E0%A4%A?secret=value")).toBe("/bad/%E0%A4%A");
  });
});
