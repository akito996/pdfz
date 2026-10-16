import { useId } from "react";

/** Icona "Salva con nome": dischetto con righe scritte sull'etichetta e matita (punta al centro, corpo in basso a destra).
 *  Stesso stile delle icone Lucide (griglia 24, linea 2, colore del testo). */
export function SaveAsIcon({ size = 24, strokeWidth = 2, className }: { size?: number; strokeWidth?: number; className?: string }) {
  const cut = `saveas-cut-${useId().replace(/:/g, "")}`;
  const pencil = "M12 12 15.1 12.6 21.1 18.5A1.8 1.8 0 0 1 18.5 21.1L12.6 15.1Z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <defs>
        {/* spazio vuoto intorno alla matita: resta leggibile anche nella barra */}
        <mask id={cut}>
          <rect width="24" height="24" fill="#fff" stroke="none" />
          <path d={pencil} fill="#000" stroke="#000" strokeWidth={4} />
        </mask>
      </defs>
      <g mask={`url(#${cut})`}>
        <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M7 3v4a1 1 0 0 0 1 1h7" />
        <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
        <path d="M9.5 16.5h1.5M9.5 19h3" strokeWidth={strokeWidth * 0.75} />
      </g>
      <path d={pencil} />
      <path d="M18.9 16.4 16.4 18.9" />
    </svg>
  );
}
