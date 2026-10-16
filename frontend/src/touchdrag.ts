/**
 * Trascinamento con il dito (tablet e telefono): riordino delle pagine, dei file da unire e dei preferiti.
 * Il trascinamento "HTML5" usato sul computer non funziona bene con il touch: questa libreria lo simula.
 * Si attiva tenendo premuto ~0,3 secondi (così il normale scorrimento con il dito resta libero).
 */
export async function enableTouchDrag() {
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  const [{ polyfill }, { scrollBehaviourDragImageTranslateOverride }] = await Promise.all([
    import("mobile-drag-drop"),
    import("mobile-drag-drop/scroll-behaviour"),
  ]);
  await import("mobile-drag-drop/default.css");
  polyfill({
    forceApply: true,                     // Android dichiara di supportare il trascinamento ma con il dito non funziona
    holdToDrag: 300,
    dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,   // vicino ai bordi la lista scorre da sola
  });
  // necessario perché il trascinamento possa bloccare lo scorrimento della pagina mentre si sposta un elemento
  window.addEventListener("touchmove", () => {}, { passive: false });
  // la libreria segue alla lettera le regole del trascinamento: un elemento accetta il rilascio solo se
  // "dragenter" viene annullato (il trascinamento del computer è più tollerante)
  document.addEventListener("dragenter", (e) => e.preventDefault());
}
