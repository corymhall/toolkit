import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import skillAutocompleteExtension from "./skill-autocomplete/index.ts";
import statusFooterExtension from "./status-footer/index.ts";
import toolCardsExtension from "./tool-cards/index.ts";

export default function piUiExtension(pi: ExtensionAPI) {
  toolCardsExtension(pi);
  skillAutocompleteExtension(pi);
  statusFooterExtension(pi);
}
