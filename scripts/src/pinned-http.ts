import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedNetworkAddress } from "./network-safety.js";

export type PinnedAddress = { address: string; family: number };
export type PinnedFetchOptions = {
  allowPrivate?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  resolveAddresses?: (hostname: string) => Promise<PinnedAddress[]>;
};

async function resolveTargetAddresses(hostname: string, allowPrivate: boolean, resolver: (hostname: string) => Promise<PinnedAddress[]>): Promise<PinnedAddress[]> {
  const addresses = await resolver(hostname);
  if (!addresses.length) throw new Error("Target hostname did not resolve to an address.");
  if (!allowPrivate && addresses.some((item) => isBlockedNetworkAddress(item.address))) {
    throw new Error("Target resolves to a private or reserved address.");
  }
  return addresses;
}

async function defaultResolveAddresses(hostname: string): Promise<PinnedAddress[]> {
  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return dnsLookup(hostname, { all: true, verbatim: true });
}

/** Fetches one HTTP(S) hop using the exact address that passed the network policy check. */
export async function fetchPinned(
  input: URL | string,
  init: RequestInit = {},
  options: PinnedFetchOptions = {},
): Promise<Response> {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP and HTTPS targets are supported.");
  if (url.username || url.password) throw new Error("URL credentials are not allowed.");
  const hostname = url.hostname.replace(/^\\[|\\]$/g, "");
  const method = (init.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) throw new Error("Pinned fetch supports only GET, HEAD, and OPTIONS.");
  const allowPrivate = options.allowPrivate === true;
  const maxBytes = Math.max(1, options.maxBytes ?? 150000);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 12000);
  const resolver = options.resolveAddresses ?? defaultResolveAddresses;
  const addresses = await resolveTargetAddresses(hostname, allowPrivate, resolver);
  const pinned = addresses[0];
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);
  const requestOptions: HttpsRequestOptions = {
    protocol: url.protocol,
    hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method,
    servername: url.protocol === "https:" && !isIP(hostname) ? hostname : undefined,
    headers: Object.fromEntries(headers.entries()),
    agent: false,
    lookup: ((hostname: string, lookupOptions: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void) => {
      if (hostname.toLowerCase() !== url.hostname.replace(/^\\[|\\]$/g, "").toLowerCase()) {
        callback(new Error("Unexpected hostname during pinned connection.") as NodeJS.ErrnoException, "");
        return;
      }
      if (lookupOptions?.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    }) as NonNullable<RequestOptions["lookup"]>,
  };

  return await new Promise<Response>((resolveResponse, rejectResponse) => {
    let settled = false;
    let truncated = false;
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (response: import("node:http").IncomingMessage) => {
      if (settled) return;
      settled = true;
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (typeof value === "string") responseHeaders.set(key, value);
        else if (Array.isArray(value)) responseHeaders.set(key, value.join(", "));
      }
      if (truncated) responseHeaders.set("x-omda-response-truncated", "true");
      const status = response.statusCode || 502;
      const body = method === "HEAD" || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
      resolveResponse(new Response(body, { status, statusText: response.statusMessage, headers: responseHeaders }));
    };
    const request = requestFn(requestOptions, (response) => {
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = maxBytes - size;
        if (buffer.length > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          size = maxBytes;
          truncated = true;
          response.destroy();
          finish(response);
          return;
        }
        chunks.push(buffer);
        size += buffer.length;
      });
      response.once("end", () => finish(response));
      response.once("close", () => { if (truncated) finish(response); });
      response.once("error", (error) => { if (!truncated && !settled) { settled = true; rejectResponse(error); } });
    });
    request.once("error", (error) => { if (!settled) { settled = true; rejectResponse(error); } });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Pinned HTTP request timed out.")));
    const signal = init.signal;
    if (signal?.aborted) request.destroy(new Error("Pinned HTTP request was aborted."));
    else signal?.addEventListener("abort", () => request.destroy(new Error("Pinned HTTP request was aborted.")), { once: true });
    const body = init.body;
    if (typeof body === "string" || body instanceof Uint8Array) request.write(body);
    request.end();
  });
}
