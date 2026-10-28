// Stage 20.1: which addresses the server may never contact (SSRF), and
// the narrow test-only loopback exception.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlockedAddress } from "../../src/utils/ipRanges";
import { isDestinationBlocked } from "../../src/utils/safeFetch";
import { withEnv } from "../helpers/safety";

const BLOCKED: Array<[string, 4 | 6, string]> = [
  ["127.0.0.1", 4, "loopback"],
  ["127.8.9.10", 4, "loopback range"],
  ["10.0.0.5", 4, "private"],
  ["172.16.0.1", 4, "private"],
  ["172.31.255.255", 4, "private"],
  ["192.168.1.1", 4, "private"],
  ["169.254.169.254", 4, "cloud metadata"],
  ["100.64.0.1", 4, "carrier-grade NAT"],
  ["0.0.0.0", 4, "unspecified"],
  ["255.255.255.255", 4, "broadcast"],
  ["::1", 6, "IPv6 loopback"],
  ["::", 6, "IPv6 unspecified"],
  ["fc00::1", 6, "IPv6 private"],
  ["fd12:3456::1", 6, "IPv6 private"],
  ["fe80::1", 6, "IPv6 link-local"],
  ["::ffff:127.0.0.1", 6, "IPv4-mapped loopback"],
  ["::ffff:169.254.169.254", 6, "IPv4-mapped metadata"],
  ["not-an-ip", 4, "unparseable"],
];
const ALLOWED: Array<[string, 4 | 6]> = [
  ["93.184.216.34", 4],
  ["8.8.8.8", 4],
  ["172.32.0.1", 4], // just outside 172.16.0.0/12
  ["2606:4700:4700::1111", 6],
];

describe("blocked address ranges", () => {
  it("blocks loopback, private, link-local/metadata and special addresses", () => {
    for (const [address, family, label] of BLOCKED) {
      assert.equal(isBlockedAddress(address, family), true, `${address} (${label})`);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const [address, family] of ALLOWED) assert.equal(isBlockedAddress(address, family), false, address);
  });
});

describe("test-only loopback exception", () => {
  it("allows only loopback, only with NODE_ENV=test and the flag both set", async () => {
    // preload.ts turns it on for the suite.
    assert.equal(isDestinationBlocked("127.0.0.1", 4), false);
    assert.equal(isDestinationBlocked("::1", 6), false);
    for (const [address, family] of [["10.0.0.5", 4], ["169.254.169.254", 4], ["192.168.1.1", 4], ["fe80::1", 6]] as const) {
      assert.equal(isDestinationBlocked(address, family), true, `${address} stays blocked`);
    }
  });

  it("is ignored outside tests and when the flag is off", async () => {
    await withEnv({ NODE_ENV: "production" }, async () => {
      assert.equal(isDestinationBlocked("127.0.0.1", 4), true);
    });
    await withEnv({ NODE_ENV: "development" }, async () => {
      assert.equal(isDestinationBlocked("127.0.0.1", 4), true);
    });
    await withEnv({ SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS: undefined }, async () => {
      assert.equal(isDestinationBlocked("127.0.0.1", 4), true);
    });
  });
});
