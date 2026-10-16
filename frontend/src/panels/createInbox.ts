import type { AssetValue } from "./fields";

// file in arrivo dal menu del tasto destro di Windows ("Crea PDF" su uno o più file)
export const createInbox: { items: AssetValue[]; notify: (() => void) | null } = { items: [], notify: null };
export function sendToCreatePdf(files: AssetValue[]) {
  createInbox.items.push(...files);
  createInbox.notify?.();
}
