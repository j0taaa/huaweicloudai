import JSZip from "jszip";
import { promises as fs } from "fs";
import path from "path";
import { enforceLicenseForApi } from "@/lib/license-guard";

const EXTENSION_DIR = path.join(process.cwd(), "chrome-extension");

type FileEntry = {
  absolutePath: string;
  relativePath: string;
};

const collectFiles = async (dir: string, rootDir: string): Promise<FileEntry[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: FileEntry[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await collectFiles(absolutePath, rootDir);
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath: path.relative(rootDir, absolutePath),
    });
  }

  return files;
};

const DEFAULT_SERVER_URL_PLACEHOLDER = "http://1.178.45.234:3000";

const buildExtensionZip = async (defaultServerUrl: string): Promise<ArrayBuffer> => {
  const extensionStats = await fs.stat(EXTENSION_DIR);
  if (!extensionStats.isDirectory()) {
    throw new Error("Extension source directory not found.");
  }

  const files = await collectFiles(EXTENSION_DIR, EXTENSION_DIR);
  if (files.length === 0) {
    throw new Error("Extension source directory is empty.");
  }

  const zip = new JSZip();

  await Promise.all(
    files.map(async ({ absolutePath, relativePath }) => {
      const fileBuffer = await fs.readFile(absolutePath);

      if (relativePath === "content.js") {
        const patchedContent = fileBuffer
          .toString("utf-8")
          .replaceAll(DEFAULT_SERVER_URL_PLACEHOLDER, defaultServerUrl);
        zip.file(relativePath, patchedContent);
        return;
      }

      zip.file(relativePath, fileBuffer);
    }),
  );

  return zip.generateAsync({ type: "arraybuffer" });
};

export async function GET(request: Request) {
  const licenseError = await enforceLicenseForApi();
  if (licenseError) return licenseError;
  try {
    const defaultServerUrl = new URL(request.url).origin;
    const zipData = await buildExtensionZip(defaultServerUrl);
    const zipBlob = new Blob([zipData], { type: "application/zip" });

    return new Response(zipBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="huaweicloudai-extension.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare extension download.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
