import dns from "node:dns/promises";
import net from "node:net";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

function isBlockedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  return true;
}

export async function validatePublicUrl(raw: string, allowedHostname?: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid public URL.");
  }
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("Credential-bearing URLs are not supported.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) throw new Error("Private network targets are not supported.");
  if (allowedHostname && hostname !== allowedHostname && !hostname.endsWith(`.${allowedHostname}`)) throw new Error("Evidence escaped the submitted product domain.");

  const directFamily = net.isIP(hostname);
  const addresses = directFamily ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) throw new Error("Private network targets are not supported.");
  return url;
}

export function selectRelevantLinks(source: URL, links: string[], limit = 5): string[] {
  const scored = links.flatMap((raw) => {
    try {
      const url = new URL(raw, source);
      if (url.hostname !== source.hostname || url.protocol !== "https:") return [];
      const path = url.pathname.toLowerCase();
      if (/logout|signin|signup|privacy|terms|legal|cookie|account/.test(path)) return [];
      const score = /pricing|features|product|solutions|docs|customers|use-cases|about/.test(path) ? 2 : 1;
      url.hash = "";
      return [{ url: url.toString(), score }];
    } catch {
      return [];
    }
  });
  return [...new Map(scored.sort((a, b) => b.score - a.score).map((entry) => [entry.url, entry])).values()]
    .slice(0, limit)
    .map((entry) => entry.url);
}
