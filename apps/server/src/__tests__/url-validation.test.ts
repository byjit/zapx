import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateBaseUrl } from "@turborepo-boilerplate/api/url-validation";

function assertRejected(url: string) {
  const result = validateBaseUrl(url);
  assert.equal(result.valid, false, `${url} must be rejected`);
  assert.ok(result.reason, `${url} must be rejected with a reason`);
}

function assertAccepted(url: string) {
  const result = validateBaseUrl(url);
  assert.equal(
    result.valid,
    true,
    `${url} must be accepted, got: ${result.reason}`
  );
}

/**
 * P1-6: registration-time SSRF screening. The review found the literal IPv4
 * checks solid (Node's WHATWG URL normalizes `2130706433`, `0177.0.0.1`,
 * `0x7f000001` and `127.1` into blocked forms) but three live gaps: wildcard
 * loopback DNS names, IPv4-mapped IPv6, and IPv6 ULA/link-local.
 */
describe("validateBaseUrl", () => {
  it("rejects wildcard DNS names that always resolve to loopback", () => {
    for (const url of [
      "http://localtest.me/",
      "http://foo.localtest.me/",
      "http://anything.localhost/",
      "http://lvh.me/",
      "http://app.vcap.me/",
      "http://127.0.0.1.nip.io/",
      "http://10.0.0.1.sslip.io/",
    ]) {
      assertRejected(url);
    }
  });

  it("rejects IPv6 loopback, unique-local and link-local addresses", () => {
    for (const url of [
      "http://[::1]/",
      "http://[::]/",
      "http://[fc00::1]/",
      "http://[fd12::1]/",
      "http://[fe80::1]/",
      "http://[febf::1]/",
    ]) {
      assertRejected(url);
    }
  });

  /**
   * The subtle half of P1-6. A textual match on `::ffff:127.0.0.1` never fires,
   * because Node's URL parser serializes the mapped IPv4 as hex hextets:
   * `new URL("http://[::ffff:127.0.0.1]/").hostname` is `[::ffff:7f00:1]`. The
   * address has to be expanded to its eight groups and the embedded IPv4 checked.
   */
  it("rejects IPv4-mapped and IPv4-compatible IPv6 addresses carrying a blocked IPv4", () => {
    for (const url of [
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[::ffff:192.168.1.1]/",
      "http://[::ffff:172.16.0.1]/",
      "http://[::ffff:169.254.169.254]/",
      // The same addresses as Node itself renders them.
      "http://[::ffff:7f00:1]/",
      "http://[::ffff:a9fe:a9fe]/",
    ]) {
      assertRejected(url);
    }
  });

  it("still accepts a public IPv6 address", () => {
    assertAccepted("http://[2606:4700:4700::1111]/");
    assertAccepted("http://[2001:4860:4860::8888]/dns-query");
  });

  it("rejects loopback, private, link-local and metadata IPv4 literals", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1.2.3/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.100.100.200/",
      "http://0.0.0.0/",
    ]) {
      assertRejected(url);
    }
  });

  it("rejects obfuscated loopback literals that the URL parser normalizes", () => {
    for (const url of [
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://0x7f000001/",
      "http://127.1/",
    ]) {
      assertRejected(url);
    }
  });

  it("rejects localhost, internal TLDs and metadata hostnames", () => {
    for (const url of [
      "http://localhost/",
      "http://localhost:8080/v1",
      "http://foo.internal/",
      "http://db.local/",
      "http://svc.intranet/",
      "http://router.home.arpa/",
      "http://metadata.google.internal/",
    ]) {
      assertRejected(url);
    }
  });

  it("rejects non-http protocols and malformed URLs", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/",
      "gopher://example.com/",
      "not-a-url",
      "",
    ]) {
      assertRejected(url);
    }
  });

  it("accepts legitimate public base URLs", () => {
    for (const url of [
      "https://api.example.com/v1",
      "https://api.example.com",
      "http://api.example.com:8080/v2/",
      "https://1.1.1.1/",
      "https://8.8.8.8/dns-query",
      "https://api.weather.gov/points",
    ]) {
      assertAccepted(url);
    }
  });
});
