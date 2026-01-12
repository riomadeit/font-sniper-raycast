/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Font Formats - Include WOFF2 format fonts in results */
  "showWoff2": boolean,
  /** undefined - Include WOFF format fonts in results */
  "showWoff": boolean,
  /** undefined - Include TTF format fonts in results */
  "showTtf": boolean,
  /** undefined - Include OTF format fonts in results */
  "showOtf": boolean,
  /** undefined - Include EOT format fonts in results */
  "showEot": boolean,
  /** Conversion - Automatically convert WOFF2 fonts to TTF format when downloading */
  "convertWoff2ToTtf": boolean
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

