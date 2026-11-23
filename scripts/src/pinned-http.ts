import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

export type PinnedAddress = { address: string; family: 4 | 6 };
export type PinnedHttpResponse = {
  status: number;
  statusText: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
};

export function getConnectAttemptBudget(remainingMs: number, remainingAddresses: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  if (!Number.isInteger(remainingAddresses) || remainingAddresses <= 0) return 0;
  return Math.max(1, Math.floor(remainingMs / remainingAddresses));
}

export async function requestPinnedHttpWithFallback(
  url: URL,
  addresses: readonly PinnedAddress[],
  method: string,
  headers: Headers,
  timeoutMs = 12000,
): Promise<PinnedHttpResponse> {
  if (!addresses.length) throw new Error("The target has no validated network addresses.");
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (const [index, address] of addresses.entries()) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    // Reserve part of the overall budget for each remaining validated address.
    // A stalled first route must not consume the time needed to try the next one.
    const remainingAddresses = addresses.length - index;
    const connectBudgetMs = getConnectAttemptBudget(remainingMs, remainingAddresses);
    try {
      return await requestPinnedHttp(url, address, method, headers, remainingMs, connectBudgetMs);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("No validated network address could be reached before the request deadline.");
}

export function requestPinnedHttp(
  url: URL,
  address: PinnedAddress,
  method: string,
  headers: Headers,
  timeoutMs = 12000,
  connectTimeoutMs = timeoutMs,
): Promise<PinnedHttpResponse> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return Promise.reject(new Error("Only HTTP and HTTPS requests are supported."));
  }
  const rawHostname = url.hostname;
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]") ? rawHostname.slice(1, -1) : rawHostname;
  const lookupPinned = ((_: string, options: unknown, callback: (...args: any[]) => void) => {
    if (options && typeof options === "object" && "all" in options && (options as { all?: boolean }).all) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  }) as LookupFunction;
  const outgoingHeaders = new Headers(headers);
  outgoingHeaders.set("accept-encoding", "identity");
  const requestOptions = {
    protocol: url.protocol,
    hostname,
    port: url.port || undefined,
    path: url.pathname + url.search,
    method,
    headers: Object.fromEntries(outgoingHeaders.entries()),
    lookup: lookupPinned,
    // A pooled socket may have been opened using a different validated IP for
    // the same hostname. Do not reuse sockets across pinned destinations.
    agent: false,
    ...(url.protocol === "https:" && !isIP(hostname)
      ? { servername: hostname, rejectUnauthorized: true }
      : {}),
  };
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    let overallDeadline: ReturnType<typeof setTimeout>;
    let connectDeadline: ReturnType<typeof setTimeout> | undefined;
    const clearOverallDeadline = () => clearTimeout(overallDeadline);
    const clearConnectDeadline = () => {
      if (connectDeadline) clearTimeout(connectDeadline);
      connectDeadline = undefined;
    };

    const request = transport(requestOptions, (incoming) => {
      settled = true;
      clearConnectDeadline();
      incoming.once("end", clearOverallDeadline);
      incoming.once("close", clearOverallDeadline);
      incoming.once("error", clearOverallDeadline);
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(name, item);
        } else {
          responseHeaders.set(name, value);
        }
      }
      const status = incoming.statusCode ?? 502;
      const body = method === "HEAD" || status === 204 || status === 304
        ? null
        : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      if (!body) incoming.resume();
      resolve({
        status,
        statusText: incoming.statusMessage || "",
        headers: responseHeaders,
        body,
      });
    });
    // One end-to-end deadline covers DNS-pinned TCP/TLS setup and response
    // delivery. This avoids relying on undocumented socket handshake flags.
    overallDeadline = setTimeout(() => {
      request.destroy(new Error("HTTP request exceeded its total deadline."));
    }, timeoutMs);
    overallDeadline.unref?.();

    request.once("socket", (socket) => {
      // Keep the attempt budget until response headers arrive. A reachable
      // TCP/TLS endpoint can still stall before sending headers, so clearing
      // this timer on connect would starve all later validated addresses.
      connectDeadline = setTimeout(() => {
        request.destroy(new Error("HTTP route did not return headers before its attempt deadline."));
      }, Math.min(timeoutMs, Math.max(1, connectTimeoutMs)));
      connectDeadline.unref?.();
    });

    request.setTimeout(timeoutMs, () => request.destroy(new Error("HTTP request timed out.")));
    request.once("upgrade", (_incoming, socket) => {
      clearConnectDeadline();
      clearOverallDeadline();
      socket.destroy();
      if (!settled) {
        settled = true;
        reject(new Error("Protocol upgrades are not supported by the HTTP tool."));
      }
    });
    request.once("error", (error) => {
      clearConnectDeadline();
      clearOverallDeadline();
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    request.end();
  });
}
