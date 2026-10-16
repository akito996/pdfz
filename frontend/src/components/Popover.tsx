import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Finestrella (menu Tema, notifiche, download) che si apre da un pulsante della barra in alto.
 *
 * Si disegna FUORI dalla barra, direttamente in <body>, con posizione fissa sotto il pulsante: sul telefono la barra
 * scorre in orizzontale (overflow) e taglia tutto ciò che sporge sotto di lei. Era il motivo del menu Tema "che non
 * si apre" su Android: si apriva, ma restava nascosto.
 *
 * Resta aperta finché l'utente non la chiude: tocco fuori (che arriva comunque a ciò che si tocca), Esc, oppure il
 * pulsante che l'ha aperta. Larghezza e altezza si adattano allo schermo (sul telefono il contenuto scorre).
 */
export function Popover({ anchor, onClose, width, className = "", role = "dialog", label, children }: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  width: number;
  className?: string;
  role?: "dialog" | "menu";
  label?: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      const left = Math.min(Math.max(8, a.right - w), vw - w - 8);   // allineata a destra del pulsante, dentro lo schermo
      const top = Math.round(a.bottom + 6);
      setPos({ top, left: Math.round(left), width: Math.round(w), maxHeight: Math.max(160, vh - top - 12) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, width]);

  useEffect(() => {
    // tocco o clic fuori: chiude, ma il tocco arriva lo stesso a ciò che si è toccato (niente "doppio tocco");
    // il pulsante che l'ha aperta si gestisce da solo (apre/chiude)
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      close.current();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", esc); };
  }, [anchor]);

  return createPortal(
    <div ref={box} className={`pop ${className}`} role={role} aria-label={label}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { visibility: "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}
