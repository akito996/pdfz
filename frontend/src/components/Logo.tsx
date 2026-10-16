/** Logo nella barra in alto: l'icona dell'app (public/icona.svg, scritta da branding/genera_marchio.py) e la scritta
 *  "PDFz" con la "z" nel colore della palette scelta. */
export function Logo() {
  return (
    <div className="logo" title="PDFz">
      <img src="./icona.svg" alt="" />
      <span className="logo-word" aria-label="PDFz">PDF<b>z</b></span>
    </div>
  );
}
