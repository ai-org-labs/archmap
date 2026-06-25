/**
 * SAMPLE icon pack — NOT part of the core bundle (the core entry never imports
 * this). Import it explicitly to opt in:
 *
 *   import { installCloudIcons } from "archmap/packs/cloud-icons";
 *   installCloudIcons();
 *
 * It demonstrates two sourcing strategies:
 *   1. Open CC0 logos via `simple-icons` (GCP, Datadog, Firebase).
 *   2. `registerIcon` with your own asset for vendors the CC0 set does NOT
 *      carry — AWS and Azure logos were removed from simple-icons for trademark
 *      reasons, and "Wiz" isn't there at all. Here we stand in lettered badges;
 *      in real use you'd register the vendor's official (licensed) SVG instead.
 */

import { siDatadog, siFirebase, siGooglecloud } from "simple-icons";
import type { SimpleIcon } from "simple-icons";
import { registerIcon } from "../icons.js";
import type { RenderableIcon } from "../icons.js";

function fromSimpleIcon(si: SimpleIcon): RenderableIcon {
  return { viewBox: "0 0 24 24", body: `<path fill="#${si.hex}" d="${si.path}" />` };
}

/** A lettered badge stand-in for vendors without an open-licensed logo. */
function letterBadge(label: string, color: string): RenderableIcon {
  return {
    viewBox: "0 0 24 24",
    body:
      `<rect width="24" height="24" rx="5" fill="#${color}" />` +
      `<text x="12" y="13" font-family="system-ui, sans-serif" font-size="7.5" font-weight="700" ` +
      `text-anchor="middle" dominant-baseline="central" fill="#ffffff">${label}</text>`,
  };
}

export function installCloudIcons(): void {
  // CC0, real vendor logos.
  registerIcon("gcp", fromSimpleIcon(siGooglecloud));
  registerIcon("datadog", fromSimpleIcon(siDatadog));
  registerIcon("firebase", fromSimpleIcon(siFirebase));

  // Not in the open set — register your own licensed asset. Badges shown here.
  registerIcon("aws", letterBadge("AWS", "FF9900"));
  registerIcon("azure", letterBadge("AZ", "0078D4"));
  registerIcon("wiz", letterBadge("WIZ", "7C3AED"));
}
