import express, { Router, type IRouter } from "express";
import { UploadAvatarResponse } from "@workspace/api-zod";
import {
  readSupabaseJson,
  reportSupabaseError,
  requireSameOrigin,
  resolveSession,
  supabaseFetch,
} from "../lib/supabase";

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

export default router;
