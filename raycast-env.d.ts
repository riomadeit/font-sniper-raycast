/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Show WOFF2 Fonts - Include WOFF2 format fonts in results */
  "showWoff2": boolean,
  /** Show WOFF Fonts - Include WOFF format fonts in results */
  "showWoff": boolean,
  /** Show TTF Fonts - Include TTF format fonts in results */
  "showTtf": boolean,
  /** Show OTF Fonts - Include OTF format fonts in results */
  "showOtf": boolean,
  /** Show EOT Fonts - Include EOT format fonts in results */
  "showEot": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `extract-fonts` command */
  export type ExtractFonts = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `extract-fonts` command */
  export type ExtractFonts = {}
}

