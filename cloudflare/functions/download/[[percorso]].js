// Cloudflare Pages Function: GET/HEAD /download/vX.Y.Z/<file> → installer dall'archivio R2 (binding INSTALLER, vedi
// .github/workflows/cloudflare.yml). Gli installer (fino a 175 MB) non possono stare nelle Pages (limite 25 MB per file):
// stanno in R2 e passano da qui, così l'indirizzo resta quello della pagina degli aggiornamenti (niente r2.dev).
// Supporta le richieste parziali (Range): il browser riprende un download interrotto.

const NOME = /^v\d+\.\d+\.\d+\/PDFz-[A-Za-z0-9._-]+$/;   // solo i file pubblicati dalla pipeline

function intestazioni(obj, chiave) {
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  // il nome della versione è nel percorso: il file non cambia più, si può tenere in cache a lungo
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("content-disposition", `attachment; filename="${chiave.split("/").pop()}"`);
  return h;
}

async function servi({ params, env, request }, conCorpo) {
  const chiave = (params.percorso || []).join("/");
  if (!NOME.test(chiave)) return new Response("File non trovato", { status: 404 });
  if (!conCorpo) {
    const info = await env.INSTALLER.head(chiave);
    if (!info) return new Response(null, { status: 404 });
    const h = intestazioni(info, chiave);
    h.set("content-length", String(info.size));
    return new Response(null, { headers: h });
  }
  const obj = await env.INSTALLER.get(chiave, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("File non trovato", { status: 404 });
  const h = intestazioni(obj, chiave);
  if (!("body" in obj)) return new Response(null, { status: 304, headers: h });   // non cambiato (If-None-Match)
  if (obj.range) {
    const inizio = obj.range.offset ?? 0;
    const lung = obj.range.length ?? obj.size - inizio;
    h.set("content-range", `bytes ${inizio}-${inizio + lung - 1}/${obj.size}`);
    h.set("content-length", String(lung));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}

export const onRequestGet = (ctx) => servi(ctx, true);
export const onRequestHead = (ctx) => servi(ctx, false);
