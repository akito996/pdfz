/** Disegno di una forma dentro il suo riquadro (anteprima sulla pagina e nei pulsanti). */
export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "check" | "cross";
export type LineDir = "tl-br" | "br-tl" | "bl-tr" | "tr-bl" | "l-r" | "r-l" | "t-b" | "b-t";

export function linePoints(w: number, h: number, dir: LineDir): [number, number, number, number] {
  const m: Record<LineDir, [number, number, number, number]> = {
    "tl-br": [0, 0, w, h], "br-tl": [w, h, 0, 0], "bl-tr": [0, h, w, 0], "tr-bl": [w, 0, 0, h],
    "l-r": [0, h / 2, w, h / 2], "r-l": [w, h / 2, 0, h / 2], "t-b": [w / 2, 0, w / 2, h], "b-t": [w / 2, h, w / 2, 0],
  };
  return m[dir] || m["tl-br"];
}

export function ShapeSvg({ kind, w, h, stroke = "#c8102e", fill = null, width = 1.5, dash = false, dir = "tl-br", opacity = 1 }: {
  kind: ShapeKind; w: number; h: number; stroke?: string; fill?: string | null; width?: number; dash?: boolean; dir?: LineDir; opacity?: number;
}) {
  const sw = Math.max(width, 0);
  const da = dash ? `${Math.max(1, sw * 3)} ${Math.max(1, sw * 2)}` : undefined;
  const common = { stroke: sw > 0 ? stroke : "none", strokeWidth: sw, strokeDasharray: da, vectorEffect: "non-scaling-stroke" as const };
  let body: React.ReactNode = null;
  if (kind === "rect") body = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} fill={fill || "none"} {...common} />;
  else if (kind === "ellipse") body = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - sw / 2)} ry={Math.max(0, h / 2 - sw / 2)} fill={fill || "none"} {...common} />;
  else if (kind === "line" || kind === "arrow") {
    const [x1, y1, x2, y2] = linePoints(w, h, dir);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const head = Math.max(sw * 4, 8);
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const bx = x2 - ux * head, by = y2 - uy * head;
    body = (
      <>
        <line x1={x1} y1={y1} x2={kind === "arrow" ? bx : x2} y2={kind === "arrow" ? by : y2} {...common} strokeLinecap="round" />
        {kind === "arrow" && <polygon points={`${x2},${y2} ${bx - uy * head * 0.45},${by + ux * head * 0.45} ${bx + uy * head * 0.45},${by - ux * head * 0.45}`} fill={stroke} />}
      </>
    );
  } else if (kind === "check") {
    body = <polyline points={`${w * 0.06},${h * 0.55} ${w * 0.38},${h * 0.88} ${w * 0.95},${h * 0.1}`} fill="none" {...common} strokeLinecap="round" strokeLinejoin="round" />;
  } else if (kind === "cross") {
    body = <path d={`M${w * 0.1},${h * 0.1} L${w * 0.9},${h * 0.9} M${w * 0.1},${h * 0.9} L${w * 0.9},${h * 0.1}`} fill="none" {...common} strokeLinecap="round" />;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${Math.max(w, 0.01)} ${Math.max(h, 0.01)}`} style={{ overflow: "visible", opacity, display: "block" }} aria-hidden>
      {body}
    </svg>
  );
}
