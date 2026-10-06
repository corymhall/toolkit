import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import herdrNvimLinksExtension from "./herdr-nvim-links/index.ts";
import skillAutocompleteExtension from "./skill-autocomplete/index.ts";
import statusFooterExtension from "./status-footer/index.ts";
import toolCardsExtension from "./tool-cards/index.ts";

export default function piUiExtension(pi: ExtensionAPI) {
  // Renderer resolvers compose in registration order. Links wrap the cards.
  herdrNvimLinksExtension(pi);
  toolCardsExtension(pi);
  skillAutocompleteExtension(pi);
  statusFooterExtension(pi);
}
