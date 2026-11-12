export type HttpRoleResponse = {
  role: string;
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs: number;
  bodyLength?: number;
};

const SENSITIVE_HEADER = /(authorization|cookie|token|secret|api[-_]?key|session|csrf|xsrf)/i;

export function redactResponseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    SENSITIVE_HEADER.test(name) ? "[REDACTED]" : value.slice(0, 1000),
  ]));
}

export function compareHttpRoleResponses(responses: HttpRoleResponse[]) {
  const first = responses[0];
  if (!first) throw new Error("At least one HTTP response is required.");
  const headerNames = [...new Set(responses.flatMap((item) => Object.keys(item.headers)))].sort();
  const headerDifferences = headerNames.flatMap((name) => {
    const values = responses.map((item) => ({ role: item.role, value: item.headers[name] ?? "[MISSING]" }));
    return values.every((item) => item.value === values[0].value) ? [] : [{ header: name, values }];
  });
  const sameBody = responses.every((item) => item.body === first.body);
  let firstDifferenceAt = -1;
  if (!sameBody) {
    const shortest = Math.min(...responses.map((item) => item.body.length));
    firstDifferenceAt = 0;
    while (firstDifferenceAt < shortest && responses.every((item) => item.body[firstDifferenceAt] === first.body[firstDifferenceAt])) firstDifferenceAt++;
  }
  const bodyDiff = {
    same: sameBody,
    firstDifferenceAt: sameBody ? null : firstDifferenceAt,
    snippets: sameBody ? [] : responses.map((item) => ({
      role: item.role,
      length: item.body.length,
      excerpt: item.body.slice(Math.max(0, firstDifferenceAt - 100), Math.min(item.body.length, firstDifferenceAt + 220)),
    })),
  };
  return {
    sameStatus: responses.every((item) => item.status === first.status),
    sameBody,
    statuses: responses.map((item) => ({ role: item.role, status: item.status })),
    bodyLengths: responses.map((item) => ({ role: item.role, length: item.body.length })),
    headerDifferences,
    bodyDiff,
  };
}
