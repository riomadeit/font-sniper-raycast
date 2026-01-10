import {
  Action,
  ActionPanel,
  Form,
  List,
  showToast,
  Toast,
  Clipboard,
  open,
  Icon,
  Color,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { FontInfo } from "./types";
import {
  extractFonts,
  checkFontAccessibility,
  ExtractOptions,
} from "./utils/fontExtractor";
import {
  downloadFont,
  downloadFonts,
  getDownloadFolder,
} from "./utils/downloader";
import { isValidUrl, getDomain } from "./utils/urlHelpers";

type ViewState = "form" | "loading" | "list";

interface FontWithSelection extends FontInfo {
  selected: boolean;
}

export default function ExtractFonts() {
  const [viewState, setViewState] = useState<ViewState>("form");
  const [url, setUrl] = useState("");
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [fonts, setFonts] = useState<FontWithSelection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");

  // Try to prefill URL from clipboard on mount
  useEffect(() => {
    async function prefillUrl() {
      try {
        // Try Browser Extension first (optional)
        try {
          const BrowserExtension = await import("@raycast/api").then(
            (m) => m.BrowserExtension,
          );
          if (BrowserExtension) {
            const tabs = await BrowserExtension.getTabs();
            const activeTab = tabs.find((tab) => tab.active);
            if (activeTab?.url && isValidUrl(activeTab.url)) {
              setUrl(activeTab.url);
              return;
            }
          }
        } catch {
          // Browser Extension not available, fall through to clipboard
        }

        // Fallback to clipboard
        const clipboardText = await Clipboard.readText();
        if (clipboardText && isValidUrl(clipboardText)) {
          setUrl(clipboardText);
        }
      } catch {
        // Ignore errors
      }
    }

    prefillUrl();
  }, []);

  async function handleSubmit(values: {
    url: string;
    showAllFormats: boolean;
  }) {
    const targetUrl = values.url.trim();

    if (!isValidUrl(targetUrl)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message: "Please enter a valid HTTP or HTTPS URL",
      });
      return;
    }

    setViewState("loading");
    setIsLoading(true);
    setSourceUrl(targetUrl);
    setShowAllFormats(values.showAllFormats);

    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Extracting fonts...",
        message: getDomain(targetUrl),
      });

      // Extract fonts from the page
      const options: ExtractOptions = { showAllFormats: values.showAllFormats };
      const extractedFonts = await extractFonts(targetUrl, options);

      if (extractedFonts.length === 0) {
        toast.style = Toast.Style.Failure;
        toast.title = "No fonts found";
        toast.message = "This page doesn't appear to use any web fonts";
        setViewState("form");
        setIsLoading(false);
        return;
      }

      // Check accessibility for each font
      toast.message = "Checking font accessibility...";
      const checkedFonts = await Promise.all(
        extractedFonts.map(checkFontAccessibility),
      );

      // Add selection state (all selected by default)
      const fontsWithSelection: FontWithSelection[] = checkedFonts.map(
        (font) => ({
          ...font,
          selected: font.accessible,
        }),
      );

      setFonts(fontsWithSelection);
      setViewState("list");

      const accessibleCount = fontsWithSelection.filter(
        (f) => f.accessible,
      ).length;
      toast.style = Toast.Style.Success;
      toast.title = `Found ${fontsWithSelection.length} fonts`;
      toast.message = `${accessibleCount} downloadable`;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Extraction failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      setViewState("form");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSelection(index: number) {
    setFonts((prev) =>
      prev.map((font, i) =>
        i === index ? { ...font, selected: !font.selected } : font,
      ),
    );
  }

  async function handleDownloadSelected() {
    const selectedFonts = fonts.filter((f) => f.selected && f.accessible);

    if (selectedFonts.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No fonts selected",
        message: "Please select at least one downloadable font",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Downloading fonts...",
      message: `0/${selectedFonts.length}`,
    });

    const results = await downloadFonts(
      selectedFonts,
      getDownloadFolder(),
      (completed, total) => {
        toast.message = `${completed}/${total}`;
      },
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    if (failed === 0) {
      toast.style = Toast.Style.Success;
      toast.title = `Downloaded ${successful} fonts`;
      toast.message = getDownloadFolder();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `Downloaded ${successful} fonts, ${failed} failed`;
      toast.message =
        results.find((r) => !r.success)?.error || "Some downloads failed";
    }
  }

  async function handleDownloadSingle(font: FontInfo) {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Downloading...",
      message: font.family,
    });

    const result = await downloadFont(font);

    if (result.success) {
      toast.style = Toast.Style.Success;
      toast.title = "Downloaded";
      toast.message = result.filePath;
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = result.error;
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFontDisplayName(font: FontInfo): string {
    const parts = [font.family];
    if (font.weight && font.weight !== "Regular") {
      parts.push(font.weight);
    }
    if (font.style) {
      parts.push(font.style.charAt(0).toUpperCase() + font.style.slice(1));
    }
    return parts.join(" ");
  }

  function goBack() {
    setViewState("form");
    setFonts([]);
  }

  // Form view
  if (viewState === "form" || viewState === "loading") {
    return (
      <Form
        isLoading={isLoading}
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="Extract Fonts"
              onSubmit={handleSubmit}
              icon={Icon.Download}
            />
          </ActionPanel>
        }
      >
        <Form.TextField
          id="url"
          title="Website URL"
          placeholder="https://example.com"
          value={url}
          onChange={setUrl}
          autoFocus
        />
        <Form.Checkbox
          id="showAllFormats"
          label="Show all formats (WOFF, TTF, OTF, etc.)"
          value={showAllFormats}
          onChange={setShowAllFormats}
          info="By default, only the best format (WOFF2) is shown per font variant"
        />
      </Form>
    );
  }

  // List view
  return (
    <List
      navigationTitle={`Fonts from ${getDomain(sourceUrl)}`}
      searchBarPlaceholder="Filter fonts..."
    >
      <List.Section
        title={`Found ${fonts.length} fonts`}
        subtitle={getDomain(sourceUrl)}
      >
        {fonts.map((font, index) => (
          <List.Item
            key={`${font.url}-${index}`}
            icon={
              font.accessible
                ? font.selected
                  ? { source: Icon.CheckCircle, tintColor: Color.Green }
                  : { source: Icon.Circle, tintColor: Color.SecondaryText }
                : { source: Icon.XMarkCircle, tintColor: Color.Red }
            }
            title={getFontDisplayName(font)}
            subtitle={font.format.toUpperCase()}
            accessories={[
              ...(font.size ? [{ text: formatSize(font.size) }] : []),
              ...(font.isDataUri
                ? [{ tag: { value: "Embedded", color: Color.Blue } }]
                : []),
              ...(!font.accessible
                ? [{ tag: { value: "Cannot Access", color: Color.Red } }]
                : []),
            ]}
            actions={
              <ActionPanel>
                {font.accessible && (
                  <>
                    <Action
                      title={font.selected ? "Deselect" : "Select"}
                      icon={font.selected ? Icon.Circle : Icon.CheckCircle}
                      onAction={() => toggleSelection(index)}
                    />
                    <Action
                      title="Download This Font"
                      icon={Icon.Download}
                      onAction={() => handleDownloadSingle(font)}
                    />
                  </>
                )}
                <Action
                  title="Download Selected Fonts"
                  icon={Icon.Download}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={handleDownloadSelected}
                />
                <Action
                  title="Open Downloads Folder"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={() => open(getDownloadFolder())}
                />
                <Action
                  title="Extract from Another URL"
                  icon={Icon.ArrowLeft}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  onAction={goBack}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
