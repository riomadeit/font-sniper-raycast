import { promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { FontInfo, DownloadResult } from "../types";
import { sanitizeFilename } from "./urlHelpers";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function getExtension(format: string): string {
  switch (format) {
    case "woff2":
      return ".woff2";
    case "woff":
      return ".woff";
    case "ttf":
      return ".ttf";
    case "otf":
      return ".otf";
    case "eot":
      return ".eot";
    default:
      return ".font";
  }
}

function generateFilename(font: FontInfo): string {
  const parts = [font.family];
  if (font.weight && font.weight !== "Regular") {
    parts.push(font.weight);
  }
  if (font.style) {
    parts.push(font.style.charAt(0).toUpperCase() + font.style.slice(1));
  }
  const baseName = sanitizeFilename(parts.join("-"));
  const extension = getExtension(font.format);
  return `${baseName}${extension}`;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export function getDownloadFolder(): string {
  return join(homedir(), "Downloads");
}

export async function downloadFont(
  font: FontInfo,
  destFolder: string = getDownloadFolder(),
): Promise<DownloadResult> {
  try {
    await ensureDirectory(destFolder);

    const filename = generateFilename(font);
    let filePath = join(destFolder, filename);

    // Handle filename conflicts by adding a number suffix
    let counter = 1;
    let fileExists = true;
    while (fileExists) {
      try {
        await fs.access(filePath);
        // File exists, try next number
        const ext = getExtension(font.format);
        const baseName = sanitizeFilename(font.family);
        filePath = join(destFolder, `${baseName}_${counter}${ext}`);
        counter++;
      } catch {
        // File doesn't exist, we can use this path
        fileExists = false;
      }
    }

    let data: Uint8Array;

    if (font.isDataUri && font.dataUriContent) {
      // Decode base64 data URI
      const buffer = Buffer.from(font.dataUriContent, "base64");
      data = new Uint8Array(buffer);
    } else {
      // Fetch from URL
      const response = await fetch(font.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      data = new Uint8Array(arrayBuffer);
    }

    await fs.writeFile(filePath, data);

    return {
      font,
      success: true,
      filePath,
    };
  } catch (error) {
    return {
      font,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function downloadFonts(
  fonts: FontInfo[],
  destFolder: string = getDownloadFolder(),
  onProgress?: (completed: number, total: number) => void,
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  const total = fonts.length;

  for (let i = 0; i < fonts.length; i++) {
    const result = await downloadFont(fonts[i], destFolder);
    results.push(result);
    onProgress?.(i + 1, total);
  }

  return results;
}
