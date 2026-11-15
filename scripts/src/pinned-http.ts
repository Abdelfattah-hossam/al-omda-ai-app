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

export function requestPinnedHttp(
  url: URL,
  address: PinnedAddress,
  method: string,
  headers: Headers,
  timeoutMs = 12000,
): Promise<PinnedHttpResponse> {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return Promise.reject(new Error("Only HTTP and HTTPS requests are supported."));
  }
  const hostname = url.hostname.replace(/^\\[|\\]$/g, "");
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
    ...(url.protocol === "https:" && !isIP(hostname) ? { servername: hostname } : {}),
    rejectUnauthorized: true,
  };
  const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = transport(requestOptions, (incoming) => {
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
    request.setTimeout(timeoutMs, () => request.destroy(new Error("HTTP request timed out.")));
    request.once("error", reject);
    request.end();
  });
}
