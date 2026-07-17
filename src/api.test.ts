import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiBaseUrl, getEvenements, getMembreProfile, login } from "./api.js";

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

describe("api client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("targets the deployed API by default", () => {
    expect(apiBaseUrl()).toMatch(/^https?:\/\//);
  });

  it("returns the access token on login (no 2FA)", async () => {
    mockFetch(200, { access_token: "jwt-123", role: "direction" });
    await expect(login("a@b.c", "pw")).resolves.toEqual({
      otpRequired: false,
      token: "jwt-123",
      doitChangerMdp: false,
      canal: null,
      email: null,
    });
  });

  it("signals otp_required with no token when 2FA is on", async () => {
    mockFetch(200, { otp_required: true, canal: "email" });
    await expect(login("a@b.c", "pw")).resolves.toEqual({
      otpRequired: true,
      token: null,
      doitChangerMdp: false,
      canal: "email",
      email: null,
    });
  });

  it("raises a typed error on invalid credentials", async () => {
    mockFetch(401, {});
    await expect(login("a@b.c", "bad")).rejects.toBeInstanceOf(ApiError);
  });

  it("fetches the member profile", async () => {
    mockFetch(200, { id: "1", matricule: "ADS-000001", email: "a@b.c", statut: "actif", verifie: true });
    const profile = await getMembreProfile("jwt");
    expect(profile.matricule).toBe("ADS-000001");
  });

  it("fetches the events list", async () => {
    mockFetch(200, [{ id: "e1", titre: "Reunion", volet: "A", debut: "2026-07-01T10:00:00Z", session_ouverte: false }]);
    const events = await getEvenements("jwt");
    expect(events).toHaveLength(1);
    expect(events.at(0)?.titre).toBe("Reunion");
  });
});
