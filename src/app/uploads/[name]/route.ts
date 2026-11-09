
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { openUpload, blobEnabled } from "@/server/media";

const BASE_HEADERS = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
};

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  vtt: "text/vtt; charset=utf-8",
};

function getHeaders(type: string, extra?: HeadersInit) {
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", type);

  if (extra) {
    new Headers(extra).forEach((value, key) =>
      headers.set(key, value)
    );
  }

  return headers;
}

async function serveDisk(
  req: Request,
  file: { path: string; size: number; type: string }
) {
  const headers = getHeaders(file.type);

  const body = (start: number, end: number) =>
    Readable.toWeb(
      createReadStream(file.path, { start, end })
    ) as unknown as ReadableStream;

  const range = req.headers.get("range");

  if (!range) {
    headers.set("Content-Length", String(file.size));

    return new Response(
      file.size ? body(0, file.size - 1) : new Uint8Array(),
      { status: 200, headers }
    );
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());

  const unsatisfiable = () =>
    new Response(null, {
      status: 416,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "Content-Range": `bytes */${file.size}`,
      },
    });

  if (!match || (!match[1] && !match[2]) || file.size === 0) {
    return unsatisfiable();
  }

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffix = Number(match[2]);

    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      return unsatisfiable();
    }

    start = Math.max(0, file.size - suffix);
    end = file.size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : file.size - 1;
    end = Math.min(end, file.size - 1);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= file.size ||
    start > end
  ) {
    return unsatisfiable();
  }

  headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
  headers.set("Content-Length", String(end - start + 1));

  return new Response(body(start, end), {
    status: 206,
    headers,
  });
}

async function serveBlob(req: Request, name: string) {
  if (!blobEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { list } = await import("@vercel/blob");

    const result = await list({
      prefix: `uploads/${name}`,
      limit: 1,
    });

    const blob = result.blobs.find(
      (item) => item.pathname === `uploads/${name}`
    );

    if (!blob) {
      return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    const range = req.headers.get("range");

    if (range) headers.set("Range", range);

    const upstream = await fetch(blob.url, {
      headers,
      cache: "no-store",
    });

    if (![200, 206, 416].includes(upstream.status)) {
      return new Response(
        upstream.status === 404 ? "Not found" : "Media storage error",
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const extension = name.split(".").pop() ?? "";
    const responseHeaders = getHeaders(
      TYPES[extension] ?? "application/octet-stream"
    );

    for (const key of [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Blob media retrieval failed:", error);

    return new Response("Media could not be retrieved.", {
      status: 502,
    });
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> }
) {
  const name = (await ctx.params).name;

  if (!/^[a-f0-9]{32}\.(mp4|webm|vtt)$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const file = await openUpload(name);

  if (file) {
    return serveDisk(req, file);
  }

  return serveBlob(req, name);
}
