import { FontInfo, FontFormat, ExtractedCSS } from "../types";
import { resolveUrl } from "./urlHelpers";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchWithHeaders(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,text/css,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];

  // Match <link rel="stylesheet" href="...">
  const linkRegex =
    /<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    urls.push(resolveUrl(baseUrl, match[1]));
  }

  // Also match <link href="..." rel="stylesheet">
  const linkRegex2 =
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?stylesheet["']?[^>]*>/gi;
  while ((match = linkRegex2.exec(html)) !== null) {
    urls.push(resolveUrl(baseUrl, match[1]));
  }

  return [...new Set(urls)]; // Deduplicate
}

function extractInlineStyles(html: string): string[] {
  const styles: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match;
  while ((match = styleRegex.exec(html)) !== null) {
    styles.push(match[1]);
  }
  return styles;
}

function extractImportUrls(css: string, baseUrl: string): string[] {
  const urls: string[] = [];
  // Match @import url("...") or @import "..."
  const importRegex = /@import\s+(?:url\()?["']?([^"');\s]+)["']?\)?/gi;
  let match;
  while ((match = importRegex.exec(css)) !== null) {
    urls.push(resolveUrl(baseUrl, match[1]));
  }
  return urls;
}

function parseFormat(url: string, formatHint?: string): FontFormat {
  if (formatHint) {
    const hint = formatHint.toLowerCase();
    if (hint.includes("woff2")) return "woff2";
    if (hint.includes("woff")) return "woff";
    if (hint.includes("truetype") || hint.includes("ttf")) return "ttf";
    if (hint.includes("opentype") || hint.includes("otf")) return "otf";
    if (hint.includes("embedded-opentype") || hint.includes("eot"))
      return "eot";
  }

  // Infer from URL extension
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".woff2")) return "woff2";
  if (lowerUrl.includes(".woff")) return "woff";
  if (lowerUrl.includes(".ttf")) return "ttf";
  if (lowerUrl.includes(".otf")) return "otf";
  if (lowerUrl.includes(".eot")) return "eot";

  // Check data URI mime type
  if (url.startsWith("data:")) {
    if (url.includes("font/woff2")) return "woff2";
    if (url.includes("font/woff")) return "woff";
    if (url.includes("font/ttf") || url.includes("font/truetype")) return "ttf";
    if (url.includes("font/otf") || url.includes("font/opentype")) return "otf";
    if (url.includes("application/vnd.ms-fontobject")) return "eot";
    if (url.includes("application/font-woff2")) return "woff2";
    if (url.includes("application/font-woff")) return "woff";
  }

  return "unknown";
}

function normalizeWeight(weight: string): string {
  // Convert numeric weights to names, or clean up existing names
  const w = weight.toLowerCase().trim();
  const weightMap: Record<string, string> = {
    "100": "Thin",
    "200": "ExtraLight",
    "300": "Light",
    "400": "Regular",
    "normal": "Regular",
    "500": "Medium",
    "600": "SemiBold",
    "700": "Bold",
    "bold": "Bold",
    "800": "ExtraBold",
    "900": "Black",
  };
  return weightMap[w] || weight;
}

function extractUsedFontFamilies(css: string): Set<string> {
  const families = new Set<string>();

  // Remove @font-face blocks first so we don't match their font-family declarations
  const cssWithoutFontFace = css.replace(/@font-face\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, "");

  // Match font-family in regular CSS rules
  // This matches: font-family: "Font Name", sans-serif; or font: 16px "Font Name";
  const fontFamilyRegex = /font-family\s*:\s*([^;{}]+)/gi;
  let match;

  while ((match = fontFamilyRegex.exec(cssWithoutFontFace)) !== null) {
    const value = match[1];
    // Split by comma and extract each font name
    const fontNames = value.split(",").map((f) => {
      // Remove quotes and trim
      return f.trim().replace(/^["']|["']$/g, "").trim();
    });
    for (const name of fontNames) {
      // Skip generic font families
      const genericFonts = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "inherit", "initial", "unset"];
      if (!genericFonts.includes(name.toLowerCase()) && name.length > 0) {
        families.add(name);
      }
    }
  }

  // Also check shorthand 'font' property
  const fontShorthandRegex = /font\s*:\s*[^;{}]+/gi;
  while ((match = fontShorthandRegex.exec(cssWithoutFontFace)) !== null) {
    const value = match[0];
    // Extract quoted font names from shorthand
    const quotedFonts = value.match(/["']([^"']+)["']/g);
    if (quotedFonts) {
      for (const quoted of quotedFonts) {
        const name = quoted.replace(/^["']|["']$/g, "").trim();
        if (name.length > 0) {
          families.add(name);
        }
      }
    }
  }

  return families;
}

function getFormatPriority(format: FontFormat): number {
  // Higher number = higher priority
  const priorities: Record<FontFormat, number> = {
    woff2: 5,
    woff: 4,
    ttf: 3,
    otf: 2,
    eot: 1,
    unknown: 0,
  };
  return priorities[format];
}

function deduplicateFonts(fonts: FontInfo[]): FontInfo[] {
  // Group by family + weight + style, keep only the best format
  const groups = new Map<string, FontInfo>();

  for (const font of fonts) {
    const key = `${font.family}|${font.weight || ""}|${font.style || ""}`;
    const existing = groups.get(key);

    if (!existing || getFormatPriority(font.format) > getFormatPriority(existing.format)) {
      groups.set(key, font);
    }
  }

  return Array.from(groups.values());
}

function parseFontFaceBlocks(css: string, baseUrl: string): FontInfo[] {
  const fonts: FontInfo[] = [];

  // Match @font-face blocks - handle nested braces and multiline
  const fontFaceRegex = /@font-face\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/gi;
  let blockMatch;

  while ((blockMatch = fontFaceRegex.exec(css)) !== null) {
    const block = blockMatch[1];

    // Extract font-family
    const familyMatch = block.match(
      /font-family\s*:\s*["']?([^"';}\n]+)["']?/i,
    );
    if (!familyMatch) continue;

    const family = familyMatch[1].trim();

    // Extract font-weight (e.g., "400", "bold", "normal")
    const weightMatch = block.match(/font-weight\s*:\s*([^;}\n]+)/i);
    const weight = weightMatch ? normalizeWeight(weightMatch[1].trim()) : undefined;

    // Extract font-style (e.g., "normal", "italic", "oblique")
    const styleMatch = block.match(/font-style\s*:\s*([^;}\n]+)/i);
    const style = styleMatch ? styleMatch[1].trim().toLowerCase() : undefined;

    // Extract all src URLs with their format hints
    // Match: url("path") format("woff2"), url('path') format('woff'), url(path)
    const srcMatch = block.match(/src\s*:\s*([^;]+)/i);
    if (!srcMatch) continue;

    const srcValue = srcMatch[1];

    // Parse individual url() entries
    const urlRegex =
      /url\(\s*["']?([^"')\s]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/gi;
    let urlMatch;

    while ((urlMatch = urlRegex.exec(srcValue)) !== null) {
      const rawUrl = urlMatch[1];
      const formatHint = urlMatch[2];

      const isDataUri = rawUrl.startsWith("data:");
      const resolvedUrl = isDataUri ? rawUrl : resolveUrl(baseUrl, rawUrl);
      const format = parseFormat(rawUrl, formatHint);

      // Extract base64 content for data URIs
      let dataUriContent: string | undefined;
      if (isDataUri) {
        const base64Match = rawUrl.match(/base64,(.+)$/);
        if (base64Match) {
          dataUriContent = base64Match[1];
        }
      }

      fonts.push({
        family,
        url: resolvedUrl,
        format,
        weight,
        style: style !== "normal" ? style : undefined,
        accessible: true, // Will be verified later
        isDataUri,
        dataUriContent,
      });
    }
  }

  return fonts;
}

async function fetchCSSWithImports(
  url: string,
  visited: Set<string> = new Set(),
): Promise<ExtractedCSS[]> {
  if (visited.has(url)) return [];
  visited.add(url);

  try {
    const css = await fetchWithHeaders(url);
    const results: ExtractedCSS[] = [{ content: css, baseUrl: url }];

    // Recursively fetch @import stylesheets
    const importUrls = extractImportUrls(css, url);
    for (const importUrl of importUrls) {
      const imported = await fetchCSSWithImports(importUrl, visited);
      results.push(...imported);
    }

    return results;
  } catch {
    // Silently skip inaccessible stylesheets
    return [];
  }
}

export async function extractFonts(pageUrl: string): Promise<FontInfo[]> {
  const allFonts: FontInfo[] = [];
  const usedFamilies = new Set<string>();

  // Fetch the HTML page
  const html = await fetchWithHeaders(pageUrl);

  // Get all CSS sources
  const cssContents: ExtractedCSS[] = [];

  // Extract inline styles
  const inlineStyles = extractInlineStyles(html);
  for (const style of inlineStyles) {
    cssContents.push({ content: style, baseUrl: pageUrl });
  }

  // Extract and fetch external stylesheets
  const stylesheetUrls = extractStylesheetUrls(html, pageUrl);
  for (const url of stylesheetUrls) {
    const fetched = await fetchCSSWithImports(url);
    cssContents.push(...fetched);
  }

  // First pass: find all font-families actually USED in CSS rules
  for (const { content } of cssContents) {
    const families = extractUsedFontFamilies(content);
    families.forEach((f) => usedFamilies.add(f));
  }

  // Also check inline styles in HTML elements
  const inlineStyleRegex = /style=["']([^"']+)["']/gi;
  let inlineMatch;
  while ((inlineMatch = inlineStyleRegex.exec(html)) !== null) {
    const families = extractUsedFontFamilies(inlineMatch[1]);
    families.forEach((f) => usedFamilies.add(f));
  }

  // Second pass: parse @font-face declarations
  for (const { content, baseUrl } of cssContents) {
    const fonts = parseFontFaceBlocks(content, baseUrl);
    allFonts.push(...fonts);
  }

  // Filter to only fonts whose family is actually used
  const usedFonts = allFonts.filter((font) => {
    // Check if this font's family matches any used family (case-insensitive)
    for (const used of usedFamilies) {
      if (font.family.toLowerCase() === used.toLowerCase()) {
        return true;
      }
    }
    return false;
  });

  // Deduplicate: keep only the best format per family+weight+style
  const deduped = deduplicateFonts(usedFonts);

  return deduped;
}

export async function checkFontAccessibility(
  font: FontInfo,
): Promise<FontInfo> {
  if (font.isDataUri) {
    return { ...font, accessible: true };
  }

  try {
    const response = await fetch(font.url, {
      method: "HEAD",
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    const size = response.headers.get("content-length");

    return {
      ...font,
      accessible: response.ok,
      size: size ? parseInt(size, 10) : undefined,
    };
  } catch {
    return { ...font, accessible: false };
  }
}
