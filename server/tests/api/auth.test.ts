// Stage 19.1: register, login and the "must be logged in" rule.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { disconnectDatabase, uniqueTag } from "../helpers/factories";
import { startTestServer, type TestServer } from "../helpers/http";
import { assertNoExternalRequests } from "../helpers/safety";

describe("auth", () => {
  let api: TestServer;
  const email = `auth-${uniqueTag()}@example.invalid`;
  const password = "correct-horse-battery";

  before(async () => {
    api = await startTestServer();
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  it("registers a user without ever returning the password hash", async () => {
    const res = await api.request("POST", "/auth/register", { body: { name: "Tester", email, password } });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, email);
    assert.ok(!res.raw.includes("passwordHash"));
    assert.ok(!res.raw.includes(password));

    const stored = await prisma.user.findUnique({ where: { email } });
    assert.ok(stored && stored.passwordHash !== password, "password is stored hashed");
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await api.request("POST", "/auth/register", { body: { name: "Tester", email, password } });
    assert.equal(res.status, 409);
  });

  it("rejects invalid registration input with 400", async () => {
    const shortPassword = await api.request("POST", "/auth/register", {
      body: { name: "Tester", email: `x-${uniqueTag()}@example.invalid`, password: "short" },
    });
    const badEmail = await api.request("POST", "/auth/register", {
      body: { name: "Tester", email: "not-an-email", password },
    });
    assert.equal(shortPassword.status, 400);
    assert.equal(badEmail.status, 400);
  });

  it("logs in with the right password and the token opens protected routes", async () => {
    const login = await api.request("POST", "/auth/login", { body: { email, password } });
    assert.equal(login.status, 200);
    assert.equal(typeof login.json.token, "string");
    assert.ok(!login.raw.includes("passwordHash"));

    const websites = await api.request("GET", "/websites", { token: login.json.token });
    assert.equal(websites.status, 200);
  });

  it("gives the same 401 for a wrong password and an unknown email", async () => {
    const wrongPassword = await api.request("POST", "/auth/login", { body: { email, password: "wrong-password" } });
    const unknownEmail = await api.request("POST", "/auth/login", {
      body: { email: `nobody-${uniqueTag()}@example.invalid`, password },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal(wrongPassword.json.error, unknownEmail.json.error, "no hint about which accounts exist");
  });

  it("blocks protected routes without a valid token", async () => {
    assert.equal((await api.request("GET", "/websites")).status, 401);
    assert.equal((await api.request("GET", "/websites", { token: "not-a-real-token" })).status, 401);
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
