import express, { Router, type IRouter } from "express";
import { UploadAvatarResponse } from "@workspace/api-zod";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";
import {
  getWorkspaceAssetMimeType,
  isValidProjectFolderId,
  isValidWorkspaceAssetPath,
  MAX_WORKSPACE_ASSET_BYTES,
  sanitizeWorkspaceAssetName,
  WORKSPACE_ASSET_BUCKET,
  WORKSPACE_ASSET_MIME_TYPES,
} from "../lib/storage-assets";

const router: IRouter = Router();
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function sessionOrReport(
  req: Parameters<typeof resolveSession>[0],
  res: Parameters<typeof resolveSession>[1],
) {
  try {
    return await resolveSession(req, res);
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not check your session.");
    return false;
  }
}

function detectImage(buffer: Buffer): { mime: string; extension: string } | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

router.put(
  "/storage/avatar",
  requireSameOrigin,
  (req, res, next) => {
    if (!IMAGE_MIME_TYPES.has(req.get("content-type")?.split(";")[0].trim() ?? "")) {
      res.status(415).json({ error: "Choose a PNG, JPEG, or WebP image." });
      return;
    }
    next();
  },
  // The main JSON parser skips image content types; parse only this bounded upload.
  express.raw({ type: [...IMAGE_MIME_TYPES], limit: MAX_AVATAR_BYTES }),
  async (req, res): Promise<void> => {
    const session = await sessionOrReport(req, res);
    if (session === false) return;
    if (!session) {
      res.status(401).json({ error: "Sign in to upload an avatar." });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0 || req.body.length > MAX_AVATAR_BYTES) {
      res.status(400).json({ error: "The image must be between 1 byte and 5 MB." });
      return;
    }
    const image = detectImage(req.body);
    if (!image || image.mime !== req.get("content-type")?.split(";")[0].trim()) {
      res.status(415).json({ error: "The file contents do not match a supported image type." });
      return;
    }

    try {
      const path = `${session.user.id}/avatar.${image.extension}`;
      const uploaded = await supabaseFetch(
        `/storage/v1/object/user-avatars/${path}`,
        {
          method: "PUT",
          headers: {
            "content-type": image.mime,
            "x-upsert": "true",
          },
          body: req.body,
        },
        session.accessToken,
      );
      await readSupabaseJson<unknown>(uploaded);

      const profileQuery = new URLSearchParams({
        id: `eq.${session.user.id}`,
        select: "id",
      });
      const updatedProfile = await supabaseFetch(
        `/rest/v1/profiles?${profileQuery}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            prefer: "return=representation",
          },
          body: JSON.stringify({ avatar_path: path }),
        },
        session.accessToken,
      );
      await readSupabaseJson<unknown[]>(updatedProfile);
      res.json(UploadAvatarResponse.parse({ path }));
    } catch (error) {
      reportSupabaseError(req, res, error, "Could not upload the avatar.");
    }
  },
);

router.get("/storage/avatar", async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) {
    res.status(401).json({ error: "Sign in to view this avatar." });
    return;
  }
  try {
    const profileQuery = new URLSearchParams({
      id: `eq.${session.user.id}`,
      select: "avatar_path",
      limit: "1",
    });
    const profileResponse = await supabaseFetch(
      `/rest/v1/profiles?${profileQuery}`,
      {},
      session.accessToken,
    );
    const profiles = await readSupabaseJson<Array<{ avatar_path: string | null }>>(profileResponse);
    const path = profiles[0]?.avatar_path;
    if (!path || !path.startsWith(`${session.user.id}/`)) {
      res.status(404).json({ error: "No avatar has been uploaded." });
      return;
    }

    const response = await supabaseFetch(
      `/storage/v1/object/user-avatars/${path.split("/").map(encodeURIComponent).join("/")}`,
      {},
      session.accessToken,
    );
    if (!response.ok) {
      await response.arrayBuffer();
      res.status(response.status === 404 ? 404 : 502).json({ error: "Could not read the private avatar." });
      return;
    }
    const mime = response.headers.get("content-type");
    if (!mime || !IMAGE_MIME_TYPES.has(mime.split(";")[0].trim())) {
      res.status(502).json({ error: "The stored avatar has an unsupported type." });
      return;
    }
    res.setHeader("content-type", mime);
    res.setHeader("cache-control", "private, no-store");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not load the avatar.");
  }
});


const WORKSPACE_ASSET_MIME_SET = new Set(Object.values(WORKSPACE_ASSET_MIME_TYPES));
function isZipContainer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
function hasValidAssetSignature(buffer: Buffer, mime: string): boolean {
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "application/zip" || mime.includes("openxmlformats")) return isZipContainer(buffer);
  if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/webp") return buffer.length >= 12 && buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP";
  if (mime === "image/gif") return buffer.length >= 6 && ["GIF87a","GIF89a"].includes(buffer.toString("ascii",0,6));
  return !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}
function assetObjectPath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
function requestedAssetFolder(req: express.Request): string | null {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) return "inbox";
  return isValidProjectFolderId(projectId) ? projectId : null;
}

router.put(
  "/storage/assets",
  requireSameOrigin,
  (req, res, next) => {
    const mime = req.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    const filename = typeof req.query.filename === "string" ? sanitizeWorkspaceAssetName(req.query.filename) : "";
    const expectedMime = filename ? getWorkspaceAssetMimeType(filename) : null;
    if (!WORKSPACE_ASSET_MIME_SET.has(mime) || !expectedMime || expectedMime !== mime) {
      res.status(415).json({ error: "Choose a supported file and make sure its extension matches its content type." });
      return;
    }
    next();
  },
  express.raw({
    type: (req) => WORKSPACE_ASSET_MIME_SET.has(req.get("content-type")?.split(";")[0].trim().toLowerCase() ?? ""),
    limit: MAX_WORKSPACE_ASSET_BYTES,
  }),
  async (req, res): Promise<void> => {
    const session = await sessionOrReport(req, res);
    if (session === false) return;
    if (!session) { res.status(401).json({ error: "Sign in to upload workspace files." }); return; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0 || req.body.length > MAX_WORKSPACE_ASSET_BYTES) {
      res.status(400).json({ error: "The file must be between 1 byte and 25 MB." });
      return;
    }
    const filename = sanitizeWorkspaceAssetName(typeof req.query.filename === "string" ? req.query.filename : "");
    const mime = req.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!hasValidAssetSignature(req.body, mime)) {
      res.status(415).json({ error: "The file contents do not match the selected file type." });
      return;
    }
    const folder = requestedAssetFolder(req);
    if (!folder) { res.status(400).json({ error: "Project ID is invalid." }); return; }
    const path = `${session.user.id}/${folder}/${crypto.randomUUID()}-${filename}`;
    try {
      const uploaded = await supabaseFetch(
        `/storage/v1/object/${WORKSPACE_ASSET_BUCKET}/${assetObjectPath(path)}`,
        { method: "POST", headers: { "content-type": mime, "x-upsert": "false" }, body: req.body },
        session.accessToken,
      );
      await readSupabaseJson<unknown>(uploaded);
      res.status(201).json({ path, name: filename, mimeType: mime, size: req.body.length, projectId: folder === "inbox" ? null : folder });
    } catch (error) {
      reportSupabaseError(req, res, error, "Could not upload the workspace file.");
    }
  },
);

router.get("/storage/assets", async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) { res.status(401).json({ error: "Sign in to list workspace files." }); return; }
  const folder = requestedAssetFolder(req);
  if (!folder) { res.status(400).json({ error: "Project ID is invalid." }); return; }
  try {
    const response = await supabaseFetch(`/storage/v1/object/list/${WORKSPACE_ASSET_BUCKET}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix: `${session.user.id}/${folder}/`, limit: 100, offset: 0, sortBy: { column: "created_at", order: "desc" } }),
    }, session.accessToken);
    const objects = await readSupabaseJson<Array<{ name?: string; id?: string; created_at?: string; updated_at?: string; metadata?: { size?: number; mimetype?: string } }>>(response);
    res.json(objects.filter((item) => typeof item.name === "string").map((item) => ({
      path: `${session.user.id}/${folder}/${item.name}`,
      name: item.name,
      createdAt: item.created_at ?? item.updated_at ?? null,
      size: typeof item.metadata?.size === "number" ? item.metadata.size : null,
      mimeType: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : null,
    })));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not list workspace files.");
  }
});

router.get("/storage/assets/download", async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) { res.status(401).json({ error: "Sign in to download workspace files." }); return; }
  const path = typeof req.query.path === "string" ? req.query.path : "";
  if (!isValidWorkspaceAssetPath(path, session.user.id)) { res.status(400).json({ error: "File path is invalid." }); return; }
  try {
    const response = await supabaseFetch(`/storage/v1/object/${WORKSPACE_ASSET_BUCKET}/${assetObjectPath(path)}`, {}, session.accessToken);
    if (!response.ok) {
      await response.arrayBuffer();
      res.status(response.status === 404 ? 404 : 502).json({ error: "Could not read the private workspace file." });
      return;
    }
    const mime = response.headers.get("content-type")?.split(";")[0].trim() ?? "application/octet-stream";
    const filename = path.split("/").pop() ?? "download";
    res.setHeader("content-type", mime);
    res.setHeader("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not download the workspace file.");
  }
});

router.delete("/storage/assets", requireSameOrigin, async (req, res): Promise<void> => {
  const session = await sessionOrReport(req, res);
  if (session === false) return;
  if (!session) { res.status(401).json({ error: "Sign in to delete workspace files." }); return; }
  const path = typeof req.query.path === "string" ? req.query.path : "";
  if (!isValidWorkspaceAssetPath(path, session.user.id)) { res.status(400).json({ error: "File path is invalid." }); return; }
  try {
    const response = await supabaseFetch(`/storage/v1/object/${WORKSPACE_ASSET_BUCKET}/${assetObjectPath(path)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    }, session.accessToken);
    await readSupabaseJson<unknown>(response);
    res.json({ ok: true, path });
  } catch (error) {
    reportSupabaseError(req, res, error, "Could not delete the workspace file.");
  }
});

export default router;
