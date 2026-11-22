/** HTML artifacts run only in an opaque-origin, network-disabled iframe. */
export function sandboxedHtmlPreview(html: string): string {
 const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
 const meta = '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '">';
 const doctype = html.match(/^\s*<!doctype[^>]*>/i);
 return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html;
}
