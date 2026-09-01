import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import herdrNvimLinksExtension from "./herdr-nvim-links/index.ts";
import skillAutocompleteExtension from "./skill-autocomplete/index.ts";
import statusFooterExtension from "./status-footer/index.ts";
import toolCardsExtension from "./tool-cards/index.ts";

export default function piUiExtension(pi: ExtensionAPI) {
  // Tool cards register at extension load time so they can render history. The
  // Herdr link decorator subscribes after that shared renderer is available.
  toolCardsExtension(pi);
  skillAutocompleteExtension(pi);
  statusFooterExtension(pi);
  herdrNvimLinksExtension(pi);
}
