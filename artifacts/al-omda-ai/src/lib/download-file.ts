// Shared file download helper.
//
// iOS Safari cannot save blob: URLs opened via window.open: it renders the
// document inline in a viewer tab, the viewer's own download action does
// nothing, and any saved copy loses the real filename ("Unknown.docx").
// The reliable save path on iPhone/iPad is the Web Share sheet with a File
// payload, which carries the real filename and offers "Save to Files".
// Everywhere else a plain anchor with the download attribute is used.

export function detectIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return detectIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
}

async function shareFileOnIos(blob: Blob, name: string): Promise<boolean> {
  if (!isIosDevice() || typeof navigator.share !== "function") return false;
  try {
    const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: name });
    return true;
  } catch (error) {
    // Dismissing the share sheet is a completed action, not an error.
    if (error instanceof Error && error.name === "AbortError") return true;
    return false;
  }
}

function anchorDownload(url: string, name: string, revoke: boolean): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Download a Blob as a named file. On iOS the share sheet (Save to Files)
// is offered first so the real filename survives; elsewhere the file
// downloads directly.
export async function downloadBlobAsFile(blob: Blob, name: string): Promise<void> {
  if (await shareFileOnIos(blob, name)) return;
  anchorDownload(URL.createObjectURL(blob), name, true);
}

// Download a file available at a (possibly blob:) URL. On iOS the bytes are
// fetched first so the share sheet can save the real named file instead of
// opening an inline viewer tab.
export async function downloadFileFromUrl(url: string, name: string): Promise<void> {
  if (isIosDevice() && typeof navigator.share === "function") {
    try {
      const response = await fetch(url);
      if (response.ok && await shareFileOnIos(await response.blob(), name)) return;
    } catch {
      // Fall back to the anchor download below.
    }
  }
  anchorDownload(url, name, false);
}


// Some old Android download managers cannot resolve a page-owned blob URL,
// including Huawei Browser using a desktop Chromium88 user agent.
export function prefersServerDownload(userAgent:string):boolean {
  const chromium=/\b(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return /HuaweiBrowser/i.test(userAgent) || Boolean(chromium && Number(chromium[1])<94);
}


// Reuse the authenticated attachment directly on older download managers.
// Modern browsers and iOS retain their existing named-file/share-sheet path.
export async function downloadStoredAsset(path:string,name:string):Promise<void>{
 const url='/api/storage/assets/download?path='+encodeURIComponent(path);
 if(prefersServerDownload(navigator.userAgent)){await downloadFileFromUrl(url,name);return;}
 const response=await fetch(url,{credentials:'same-origin'});
 if(!response.ok)throw new Error('Could not download file.');
 await downloadBlobAsFile(await response.blob(),name);
}
