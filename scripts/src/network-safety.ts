import { isIP } from "node:net";

function blockedIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function expandIPv6(input: string): number[] | null {
  let address = input.toLowerCase().split("%")[0];
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const ipv4 = address.slice(lastColon + 1);
    if (!ipv4 || isIP(ipv4) !== 4) return null;
    const octets = ipv4.split(".").map(Number);
    const tail = [((octets[0] << 8) | octets[1]), ((octets[2] << 8) | octets[3])];
    address = address.slice(0, lastColon + 1) + tail.map((part) => part.toString(16)).join(":");
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.map((part) => Number.parseInt(part, 16));
}

export function isBlockedNetworkAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blockedIPv4(address);
  if (version !== 6) return true;
  const groups = expandIPv6(address);
  if (!groups) return true;
  const firstFiveZero = groups.slice(0, 5).every((part) => part === 0);
  if (firstFiveZero && groups[5] === 0xffff) {
    const octets = [groups[6] >>> 8, groups[6] & 255, groups[7] >>> 8, groups[7] & 255];
    return blockedIPv4(octets.join("."));
  }
  if (groups.slice(0, 6).every((part) => part === 0)) return true;
  const first = groups[0];
  return groups.every((part) => part === 0) ||
    (allZeroPrefix && groups[6] === 0 && groups[7] === 1) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && groups[1] === 0x0db8);
}
