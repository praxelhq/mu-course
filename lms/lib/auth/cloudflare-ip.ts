import { BlockList, isIP } from "node:net";

// Official proxy networks: https://www.cloudflare.com/ips/ (checked 2026-09-21).
// Railway overwrites X-Real-IP with its peer, so only these peers may supply
// CF-Connecting-IP. Direct requests must not be able to spoof a student's IP.
const cloudflare = new BlockList();
for (const cidr of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
  "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
  "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
  "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [address, prefix] = cidr.split("/");
  cloudflare.addSubnet(address, Number(prefix), isIP(address) === 6 ? "ipv6" : "ipv4");
}

export function clerkClientIp(headers: Headers): string | null {
  const peer = headers.get("x-real-ip") ?? "";
  const family = isIP(peer);
  if (!family) return null;
  const visitor = headers.get("cf-connecting-ip") ?? "";
  if (isIP(visitor) && cloudflare.check(peer, family === 6 ? "ipv6" : "ipv4")) {
    return visitor;
  }
  return peer;
}
