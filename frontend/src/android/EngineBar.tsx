import { useEffect, useState } from "react";

/** Avvio del motore Python mostrato come una sottile barra in alto: l'app è già usabile mentre parte. */
type State = { label: string; pct: number; error?: string };
let state: State = { label: "Avvio…", pct: 2 };
const subs = new Set<(s: State) => void>();
export function setEngineState(s: State) { state = s; subs.forEach((f) => f(s)); }

export function EngineBar() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); return () => { subs.delete(setS); }; }, []);
  if (s.error) {
    return (
      <div className="engine-err" role="alert">
        <b>Il motore PDF non è partito</b>
        <span>{s.error}</span>
        <button className="btn primary" onClick={() => location.reload()}>Riprova</button>
      </div>
    );
  }
  if (s.pct >= 100) return null;
  return (
    <div className="engine-bar" role="progressbar" aria-valuenow={s.pct} aria-label={s.label} title={s.label}>
      <i style={{ width: `${s.pct}%` }} />
    </div>
  );
}
