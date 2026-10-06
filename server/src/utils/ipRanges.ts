// Pure IP-address classification — no I/O, no DNS, no network. Kept separate
// from safeFetch.ts so the range logic itself is independently testable
// (the exact goal Stage 14.0 flagged: a dedicated module materially improves
// correctness/testability here, unlike most one-off helpers in this repo).
//
// Deliberately NOT a hostname string blacklist — safeFetch.ts only ever
// calls into this module with an already-resolved IP address (either a
// literal IP from the URL itself, or the result of an actual DNS lookup),
// so "localhost", obfuscated decimal/hex/octal IPs, and any attacker-chosen
// subdomain all funnel through the same address-based check regardless of
// what the original hostname string looked like.

interface Cidr4 {
  base: number;
  maskBits: number;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function cidr4(base: string, maskBits: number): Cidr4 {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) throw new Error(`Invalid CIDR base: ${base}`);
  return { base: baseInt, maskBits };
}

function ipv4MaskFor(maskBits: number): number {
  if (maskBits <= 0) return 0;
  if (maskBits >= 32) return 0xffffffff;
  return (~0 << (32 - maskBits)) >>> 0;
}

function isIpv4InRange(ipInt: number, range: Cidr4): boolean {
  const mask = ipv4MaskFor(range.maskBits);
  return (ipInt & mask) === (range.base & mask);
}

// Beyond the explicitly-required ranges, this also blocks the IANA
// "special-use" documentation/benchmarking/protocol-assignment blocks
// (192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15, 198.51.100.0/24,
// 203.0.113.0/24) — none of these are ever legitimate targets for a real
// monitored website, so blocking them is free extra hardening with no
// legitimate-use downside.
const BLOCKED_IPV4_RANGES: Cidr4[] = [
  cidr4("0.0.0.0", 8), // "this network" / unspecified
  cidr4("10.0.0.0", 8), // private
  cidr4("100.64.0.0", 10), // carrier-grade NAT / shared address space
  cidr4("127.0.0.0", 8), // loopback
  cidr4("169.254.0.0", 16), // link-local (includes cloud metadata 169.254.169.254)
  cidr4("172.16.0.0", 12), // private
  cidr4("192.0.0.0", 24), // IETF protocol assignments
  cidr4("192.0.2.0", 24), // documentation (TEST-NET-1)
  cidr4("192.168.0.0", 16), // private
  cidr4("198.18.0.0", 15), // benchmarking
  cidr4("198.51.100.0", 24), // documentation (TEST-NET-2)
  cidr4("203.0.113.0", 24), // documentation (TEST-NET-3)
  cidr4("224.0.0.0", 3), // 224.0.0.0-255.255.255.255: multicast, reserved, broadcast
];

export function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true; // unparseable -> treat as unsafe
  return BLOCKED_IPV4_RANGES.some((range) => isIpv4InRange(ipInt, range));
}

// Hand-rolled rather than pulled from a library: expands standard IPv6
// text notation (including "::" compression and a trailing embedded IPv4
// dotted-quad, which Node's `dns.lookup` can return for IPv4-mapped
// addresses even though URL parsing normalizes it to hex groups) into a
// single 128-bit BigInt for exact prefix comparisons.
function ipv6ToBigInt(ip: string): bigint | null {
  let working = ip;

  const dottedMatch = working.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (dottedMatch) {
    const embeddedInt = ipv4ToInt(dottedMatch[1]);
    if (embeddedInt === null) return null;
    const hi = ((embeddedInt >>> 16) & 0xffff).toString(16);
    const lo = (embeddedInt & 0xffff).toString(16);
    working = working.slice(0, dottedMatch.index) + `:${hi}:${lo}`;
  }

  const doubleColonCount = (working.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return null;

  let groups: string[];
  if (doubleColonCount === 1) {
    const [head, tail] = working.split("::");
    const headGroups = head ? head.split(":").filter((g) => g.length > 0) : [];
    const tailGroups = tail ? tail.split(":").filter((g) => g.length > 0) : [];
    const missing = 8 - headGroups.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    groups = working.split(":");
  }

  if (groups.length !== 8) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    result = (result << 16n) | BigInt(parseInt(group, 16));
  }
  return result;
}

function isIpv6InPrefix(addr: bigint, prefixText: string, prefixBits: number): boolean {
  const prefixBig = ipv6ToBigInt(prefixText);
  if (prefixBig === null) return false;
  if (prefixBits <= 0) return true;
  const shift = BigInt(128 - prefixBits);
  return addr >> shift === prefixBig >> shift;
}

const IPV4_MAPPED_PREFIX = "::ffff:0:0";
const IPV4_MAPPED_BITS = 96;

export function isBlockedIpv6(ip: string): boolean {
  const addr = ipv6ToBigInt(ip);
  if (addr === null) return true; // unparseable -> treat as unsafe

  if (isIpv6InPrefix(addr, IPV4_MAPPED_PREFIX, IPV4_MAPPED_BITS)) {
    // IPv4-mapped (::ffff:a.b.c.d) — unwrap and re-check under the IPv4
    // rules rather than only checking the IPv6 shell, so e.g.
    // ::ffff:127.0.0.1 is caught exactly like a plain 127.0.0.1 would be.
    const low32 = addr & 0xffffffffn;
    const embeddedIpv4 = [
      Number((low32 >> 24n) & 0xffn),
      Number((low32 >> 16n) & 0xffn),
      Number((low32 >> 8n) & 0xffn),
      Number(low32 & 0xffn),
    ].join(".");
    return isBlockedIpv4(embeddedIpv4);
  }

  return (
    isIpv6InPrefix(addr, "::1", 128) || // loopback
    isIpv6InPrefix(addr, "::", 128) || // unspecified
    isIpv6InPrefix(addr, "fc00::", 7) || // unique local (private)
    isIpv6InPrefix(addr, "fe80::", 10) || // link-local
    isIpv6InPrefix(addr, "ff00::", 8) // multicast
  );
}

export function isBlockedAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address);
}
