// Stage 19.2: request validation for websites, settings, notifications
// and monitoring filters -- bad input is rejected before reaching the DB.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { websiteValidation } from "../../src/modules/website/validation";
import { settingsValidation, MAX_NAME_LENGTH } from "../../src/modules/settings/validation";
import { notificationValidation } from "../../src/modules/notification/validation";
import { monitorValidation } from "../../src/modules/monitor/validation";

describe("website validation", () => {
  it("create requires a non-empty url; name and platform must be text", () => {
    assert.equal(websiteValidation.validateCreate({ url: "https://a.example.invalid" }).valid, true);
    for (const body of [null, {}, { url: "  " }, { url: 5 }, { url: "https://a", name: 5 }, { url: "https://a", platform: true }]) {
      assert.equal(websiteValidation.validateCreate(body).valid, false, JSON.stringify(body));
    }
  });

  it("update needs at least one valid field", () => {
    assert.equal(websiteValidation.validateUpdate({ isActive: false }).valid, true);
    for (const body of [{}, { isActive: "no" }, { url: "" }, { name: 1 }]) {
      assert.equal(websiteValidation.validateUpdate(body).valid, false, JSON.stringify(body));
    }
  });
});

describe("settings validation", () => {
  it("account name is trimmed, required and at most 100 characters", () => {
    assert.equal(MAX_NAME_LENGTH, 100);
    assert.deepEqual(settingsValidation.validateUpdateAccount({ name: "  Taha  " }), { valid: true, data: { name: "Taha" } });
    for (const body of [{}, { name: "   " }, { name: "x".repeat(101) }, { name: 7 }]) {
      assert.equal(settingsValidation.validateUpdateAccount(body).valid, false, JSON.stringify(body));
    }
  });

  it("notifications need at least one boolean", () => {
    assert.equal(settingsValidation.validateUpdateNotifications({ emailEnabled: true }).valid, true);
    for (const body of [{}, { inAppEnabled: "yes" }, { emailEnabled: 1 }]) {
      assert.equal(settingsValidation.validateUpdateNotifications(body).valid, false, JSON.stringify(body));
    }
  });

  it("theme must be SYSTEM, LIGHT or DARK", () => {
    for (const theme of ["SYSTEM", "LIGHT", "DARK"]) assert.equal(settingsValidation.validateUpdateAppearance({ theme }).valid, true);
    for (const theme of ["dark", "BLUE", undefined]) assert.equal(settingsValidation.validateUpdateAppearance({ theme }).valid, false);
  });
});

describe("query filters", () => {
  it("notification status defaults to ALL and rejects unknown values", () => {
    assert.deepEqual(notificationValidation.validateStatus({}), { valid: true, status: "ALL" });
    assert.equal(notificationValidation.validateStatus({ status: "UNREAD" }).valid, true);
    assert.equal(notificationValidation.validateStatus({ status: "unread" }).valid, false);
  });

  it("history range defaults to 24h; incident status and alert filters are checked", () => {
    assert.deepEqual(monitorValidation.validateHistoryRange({}), { valid: true, range: "24h" });
    assert.equal(monitorValidation.validateHistoryRange({ range: "1y" }).valid, false);
    assert.equal(monitorValidation.validateIncidentStatus({ status: "CLOSED" }).valid, false);
    assert.equal(monitorValidation.validateAlertFilters({ source: "UPTIME", severity: "ERROR", type: "INCIDENT_OPENED" }).valid, true);
    for (const query of [{ source: "EMAIL" }, { severity: "FATAL" }, { type: "SOMETHING" }]) {
      assert.equal(monitorValidation.validateAlertFilters(query).valid, false, JSON.stringify(query));
    }
  });
});
