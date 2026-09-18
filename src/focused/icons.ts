import { cloudIconEntries, famousServiceIconEntries, installCloudProviderIcons, installFamousServiceIcons } from "@archmap/icons";
import type { ServiceIconEntry } from "@archmap/icons";
import { getIcon, listIcons, registerIcon } from "../icons.js";

const generic: Record<string, [string, string]> = {
  user: ["ユーザー", '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'],
  browser: ["ブラウザー", '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 8h20M6 5.5h.1M9 5.5h.1M8 13l-2 2 2 2m8-4 2 2-2 2"/>'],
  server: ["サーバー", '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.1M7 17.5h.1M12 6.5h5M12 17.5h5"/>'],
  database: ["データベース", '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>'],
  cloud: ["クラウド", '<path d="M6 19a5 5 0 0 1-1-9 7 7 0 0 1 13-2 5.5 5.5 0 0 1 0 11Z"/>'],
  queue: ["キュー", '<rect x="2" y="6" width="5" height="12" rx="1"/><rect x="9.5" y="6" width="5" height="12" rx="1"/><rect x="17" y="6" width="5" height="12" rx="1"/>'],
  storage: ["ストレージ", '<path d="M4 5h16l-2 16H6Z"/><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M8 13h8"/>'],
  code: ["コード", '<path d="m7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18"/>'],
  shield: ["セキュリティ", '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-4 10 3 3 5-6"/>'],
  phone: ["モバイル", '<rect x="5" y="1" width="14" height="22" rx="3"/><path d="M9 4h6M10 20h4"/>'],
  globe: ["ネットワーク", '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>'],
  layers: ["レイヤー", '<path d="m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5"/>'],
};

/** Bundled local SVG assets only: rendering never fetches icons from a network. */
export function installDiagramIcons(): void {
  installCloudProviderIcons(registerIcon);
  installFamousServiceIcons(registerIcon);
  for (const [key, [, body]] of Object.entries(generic)) {
    registerIcon(key, { viewBox: "0 0 24 24", body: `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</g>` });
  }
}

export function getDiagramIconCatalog(): Array<{ key: string; label: string }> {
  const names = new Map<string, string>([
    ...Object.entries(generic).map(([key, [label]]) => [key, label] as [string, string]),
    ...cloudIconEntries.flatMap((entry) => [entry.key, ...(entry.aliases ?? [])].map((key) => [`${entry.provider}/${key}`, entry.title] as [string, string])),
    ...(famousServiceIconEntries as readonly ServiceIconEntry[]).flatMap((entry) => [entry.key, ...(entry.aliases ?? [])].map((key) => [key, entry.title] as [string, string])),
  ]);
  return listIcons().filter((key) => !!getIcon(key)).sort().map((key) => ({ key, label: names.get(key) ?? key }));
}
