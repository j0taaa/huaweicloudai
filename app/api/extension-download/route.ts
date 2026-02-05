import JSZip from "jszip";
import { promises as fs } from "fs";
import path from "path";

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

const buildExtensionZip = async (): Promise<Uint8Array> => {
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
      zip.file(relativePath, fileBuffer);
    }),
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Uint8Array(zipBuffer);
};

const extensionZipPromise = buildExtensionZip();

export async function GET() {
  try {
    const zipData = await extensionZipPromise;

    return new Response(zipData, {
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
