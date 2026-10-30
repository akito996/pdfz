import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

/**
 * App Android: icone della barra di stato (ora, batteria) e dei tasti in basso dello stesso tono dell'app.
 *
 * L'app disegna sotto le barre del sistema (viewport-fit=cover) e ci mette il colore delle sue barre (.app::before e
 * ::after in styles.css): con l'aspetto scuro scelto nel menu ☀ le icone devono essere chiare, e viceversa. Prima
 * seguivano il tema del telefono: aspetto scuro dell'app su telefono chiaro = icone scure su fondo scuro, invisibili.
 *
 * Se il WebView è vecchio (prima della versione 140) Capacitor non fa disegnare l'app sotto le barre e scrive zone
 * di 0 px: allora il fondo delle barre è quello del telefono e le icone restano come le vuole il telefono (DEFAULT).
 */
export function seguiBarreDiSistema() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  const root = document.documentElement;
  const scuroSistema = window.matchMedia("(prefers-color-scheme: dark)");
  let ultimo = "";
  const aggiorna = () => {
    const sotto = parseFloat(getComputedStyle(root).getPropertyValue("--safe-area-inset-top")) > 0;
    const scuro = root.dataset.theme ? root.dataset.theme === "dark" : scuroSistema.matches;
    const stile = !sotto ? SystemBarsStyle.Default : scuro ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
    if (stile === ultimo) return;
    ultimo = stile;
    SystemBars.setStyle({ style: stile }).catch(() => {});
  };
  // cambia con il tema (data-theme), con le zone scritte da Capacitor (style di <html>) e con il tema del telefono
  new MutationObserver(aggiorna).observe(root, { attributes: true, attributeFilter: ["data-theme", "style"] });
  scuroSistema.addEventListener("change", aggiorna);
  aggiorna();
}

/** Presentazione: barre del sistema nascoste (schermo intero vero); al ritorno di nuovo visibili. */
export function barreNascoste(nascoste: boolean) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  (nascoste ? SystemBars.hide() : SystemBars.show()).catch(() => {});
}
