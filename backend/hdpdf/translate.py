"""Traduzione offline con i pacchetti lingua Argos Translate (modelli CTranslate2 + SentencePiece).

Non usa la libreria argostranslate (porterebbe torch e stanza, centinaia di MB): legge direttamente
i pacchetti .argosmodel. Le coppie mancanti passano dall'inglese (es. italiano → tedesco = it→en→de).

Pacchetti:
* inclusi nell'installer: <app>/vendor/lingue/<pacchetto>/
* scaricati dall'app:     %LOCALAPPDATA%/PDFz/lingue/<pacchetto>/
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import shutil
import threading
import time
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from . import APP_AUTHOR, APP_ID, APP_NAME, config

log = logging.getLogger("hdpdf.translate")

INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
PIVOT = "en"

LANG_NAMES = {
    "it": "Italiano", "en": "Inglese", "fr": "Francese", "de": "Tedesco", "es": "Spagnolo", "pt": "Portoghese",
    "pb": "Portoghese (Brasile)", "zh": "Cinese", "zt": "Cinese tradizionale", "ja": "Giapponese", "ko": "Coreano",
    "ru": "Russo", "ar": "Arabo", "hi": "Hindi", "tr": "Turco", "nl": "Olandese", "pl": "Polacco", "uk": "Ucraino",
    "ro": "Rumeno", "el": "Greco", "cs": "Ceco", "sv": "Svedese", "da": "Danese", "fi": "Finlandese", "nb": "Norvegese",
    "hu": "Ungherese", "bg": "Bulgaro", "sk": "Slovacco", "sl": "Sloveno", "lt": "Lituano", "lv": "Lettone",
    "et": "Estone", "he": "Ebraico", "fa": "Persiano", "ur": "Urdu", "bn": "Bengalese", "th": "Thailandese",
    "vi": "Vietnamita", "id": "Indonesiano", "ms": "Malese", "tl": "Tagalog", "sw": "Swahili", "ca": "Catalano",
    "gl": "Galiziano", "eu": "Basco", "ga": "Irlandese", "sq": "Albanese", "az": "Azero", "eo": "Esperanto", "ky": "Kirghiso",
}


class TranslateError(Exception):
    """Errore mostrato all'utente."""


# --------------------------------------------------------------------------- pacchetti

@dataclass
class Pack:
    from_code: str
    to_code: str
    path: Path
    version: str = ""
    bundled: bool = False
    target_prefix: str = ""
    _translator: object = None
    _sp: object = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def key(self) -> str:
        return f"{self.from_code}-{self.to_code}"

    def load(self):
        if self._translator is None:
            import ctranslate2
            import sentencepiece as spm

            sp_path = self.path / "sentencepiece.model"
            if not sp_path.exists():
                raise TranslateError(f"Il pacchetto {self.key} non è supportato (manca sentencepiece.model).")
            threads = max(1, (os.cpu_count() or 2) - 1)
            self._translator = ctranslate2.Translator(str(self.path / "model"), device="cpu", compute_type="int8",
                                                      inter_threads=1, intra_threads=threads)
            self._sp = spm.SentencePieceProcessor(model_file=str(sp_path))
        return self._translator, self._sp

    MAX_TOKENS = 250

    def _run(self, tr, tokens, prefix):
        """Traduce un gruppo di frasi; se il modello rifiuta (frase troppo lunga) riprova una frase alla volta
        con limiti più stretti, così un solo problema non blocca tutto il documento."""
        def call(toks, pfx, limit):
            longest = max(len(t) for t in toks)
            # lunghezza massima legata all'input: evita traduzioni che "girano a vuoto"
            return tr.translate_batch(toks, target_prefix=pfx, beam_size=2, max_batch_size=24, batch_type="examples",
                                      replace_unknowns=True, length_penalty=0.2, max_decoding_length=min(limit, longest * 2 + 16))
        tokens = [t[: self.MAX_TOKENS] for t in tokens]
        try:
            return call(tokens, prefix, 512)
        except RuntimeError as ex:
            log.warning("Traduzione a gruppi non riuscita (%s): riprovo una frase alla volta", ex)
        out = []
        for i, t in enumerate(tokens):
            pf = [prefix[i]] if prefix else None
            r = None
            for cut, limit in ((len(t), 200), (60, 100)):
                try:
                    r = call([t[:cut]], pf, limit)[0]
                    break
                except RuntimeError:
                    continue
            out.append(r)
        return out

    def translate(self, sentences: list[str]) -> list[str]:
        if not sentences:
            return []
        with self.lock:
            tr, sp = self.load()
            tokens = [sp.encode(s, out_type=str) for s in sentences]
            prefix = [[self.target_prefix]] * len(tokens) if self.target_prefix else None
            res = self._run(tr, tokens, prefix)
        out = []
        for src, r in zip(sentences, res):
            if r is None:          # frase che il modello non riesce a tradurre: resta in originale
                out.append(src)
                continue
            text = sp.decode_pieces(r.hypotheses[0]).replace("▁", " ")
            if self.target_prefix and text.startswith(self.target_prefix):
                text = text[len(self.target_prefix):]
            out.append(text.strip())
        return out


def bundled_dir() -> Path:
    if os.environ.get("HDPDF_ONLY_USER_PACKS"):
        return config.data_dir() / "_nessun_pacchetto_incluso"
    return config.app_dir() / "vendor" / "lingue"


def language_pack_dirs() -> list[Path]:
    """Cartelle dei pacchetti lingue installati con gli MSI separati (PDFz-Lingue-<gruppo>-x.y.z-x64.msi).
    Stesse chiavi e cartelle che scrive packaging/wix/Lingue.wxs: ogni gruppo ha la sua sottochiave
    HKLM\\Software\\agjin\\PDFz Lingue\\<gruppo> (valore Path) e la sua cartella in Programmi\\PDFz Lingue\\<gruppo>."""
    if not config.IS_WINDOWS or os.environ.get("HDPDF_ONLY_USER_PACKS"):
        return []   # nei test si usano solo i pacchetti di prova, non quelli installati sul PC
    found: list[Path] = []
    try:
        import winreg
        root = rf"Software\{APP_AUTHOR}\{APP_NAME} Lingue"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, root) as k:
            i = 0
            while True:
                try:
                    sub = winreg.EnumKey(k, i)
                except OSError:
                    break
                i += 1
                try:
                    with winreg.OpenKey(k, sub) as sk:
                        found.append(Path(winreg.QueryValueEx(sk, "Path")[0]))
                except OSError:
                    pass
    except OSError:
        pass
    base = Path(os.environ.get("ProgramW6432") or os.environ.get("ProgramFiles") or r"C:\Program Files") / f"{APP_NAME} Lingue"
    if base.exists():
        found.append(base)
        found += [d for d in base.iterdir() if d.is_dir()]
    out: list[Path] = []
    for p in found:
        if p.exists() and p not in out:
            out.append(p)
    return out


def user_dir() -> Path:
    d = config.data_dir() / "lingue"
    d.mkdir(parents=True, exist_ok=True)
    return d


_packs: dict[str, Pack] | None = None
_packs_lock = threading.Lock()


def _scan() -> dict[str, Pack]:
    found: dict[str, Pack] = {}
    sources = [(bundled_dir(), True)] + [(d, True) for d in language_pack_dirs()] + [(user_dir(), False)]
    for base, bundled in sources:
        if not base.exists():
            continue
        for d in sorted(base.iterdir()):
            meta = d / "metadata.json"
            if not (d.is_dir() and meta.exists() and (d / "model").exists()):
                continue
            try:
                m = json.loads(meta.read_text(encoding="utf-8"))
                p = Pack(m["from_code"], m["to_code"], d, str(m.get("package_version", "")), bundled, m.get("target_prefix", "") or "")
            except Exception as ex:  # noqa: BLE001
                log.warning("Pacchetto lingua non valido %s: %s", d, ex)
                continue
            if p.key not in found or not bundled:   # quello scaricato (più recente) vince su quello incluso
                found[p.key] = p
    return found


def packs(refresh: bool = False) -> dict[str, Pack]:
    global _packs
    with _packs_lock:
        if _packs is None or refresh:
            _packs = _scan()
        return _packs


def route(src: str, dst: str) -> list[Pack]:
    if src == dst:
        return []
    p = packs()
    if f"{src}-{dst}" in p:
        return [p[f"{src}-{dst}"]]
    if f"{src}-{PIVOT}" in p and f"{PIVOT}-{dst}" in p:
        return [p[f"{src}-{PIVOT}"], p[f"{PIVOT}-{dst}"]]
    raise TranslateError(f"Manca il pacchetto lingua per tradurre da {LANG_NAMES.get(src, src)} a {LANG_NAMES.get(dst, dst)}: "
                         "aggiungilo da \"Pacchetti lingua\".")


def languages() -> dict:
    """Lingue disponibili come origine e come destinazione con i pacchetti installati."""
    p = packs()
    sources = {k.split("-")[0] for k in p} | ({PIVOT} if any(k.startswith(PIVOT + "-") for k in p) else set())
    targets = {k.split("-")[1] for k in p}
    langs = sorted(sources | targets, key=lambda c: LANG_NAMES.get(c, c))
    return {
        "languages": [{"code": c, "name": LANG_NAMES.get(c, c)} for c in langs],
        "pairs": sorted(p),
        "installed": [{"key": x.key, "from": x.from_code, "to": x.to_code, "version": x.version, "bundled": x.bundled,
                       "from_name": LANG_NAMES.get(x.from_code, x.from_code), "to_name": LANG_NAMES.get(x.to_code, x.to_code)}
                      for x in sorted(p.values(), key=lambda x: x.key)],
    }


def can_translate(src: str, dst: str) -> bool:
    try:
        route(src, dst)
        return True
    except TranslateError:
        return False


# --------------------------------------------------------------------------- indice e download

def index(refresh: bool = False) -> list[dict]:
    cache = user_dir() / "index.json"
    if cache.exists() and not refresh and time.time() - cache.stat().st_mtime < 7 * 24 * 3600:
        return json.loads(cache.read_text(encoding="utf-8"))
    try:
        with urllib.request.urlopen(urllib.request.Request(INDEX_URL, headers={"User-Agent": APP_ID}), timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        cache.write_text(json.dumps(data), encoding="utf-8")
        return data
    except Exception as ex:  # noqa: BLE001
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))
        raise TranslateError(f"Elenco dei pacchetti lingua non raggiungibile (serve internet): {ex}")


def available() -> list[dict]:
    have = packs()
    out = []
    for e in index():
        key = f"{e['from_code']}-{e['to_code']}"
        out.append({"key": key, "from": e["from_code"], "to": e["to_code"], "version": e.get("package_version", ""),
                    "from_name": LANG_NAMES.get(e["from_code"], e.get("from_name", e["from_code"])),
                    "to_name": LANG_NAMES.get(e["to_code"], e.get("to_name", e["to_code"])),
                    "installed": key in have, "url": next((l for l in e.get("links", []) if l.startswith("http")), "")})
    return sorted(out, key=lambda x: (x["from"] != PIVOT and x["to"] != PIVOT, x["from_name"], x["to_name"]))


PROGRESS: dict[str, dict] = {}


def install_archive(data: bytes, dest_root: Path | None = None) -> Pack:
    """Estrae un .argosmodel (zip) nella cartella dei pacchetti (senza la cartella 'stanza', non serve)."""
    dest_root = dest_root or user_dir()
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise TranslateError("Il file non è un pacchetto lingua valido (.argosmodel).")
    names = z.namelist()
    meta = next((n for n in names if n.endswith("metadata.json") and n.count("/") <= 1), None)
    if not meta:
        raise TranslateError("Pacchetto lingua senza metadata.json.")
    top = meta.rsplit("/", 1)[0] if "/" in meta else ""
    m = json.loads(z.read(meta).decode("utf-8"))
    name = f"translate-{m['from_code']}_{m['to_code']}"
    tmp = dest_root / (name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    for n in names:
        rel = n[len(top) + 1:] if top else n
        if not rel or rel.endswith("/") or rel.startswith("stanza/") or ".." in Path(rel).parts:
            continue
        target = tmp / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with z.open(n) as src, open(target, "wb") as dst:
            shutil.copyfileobj(src, dst)
    if not (tmp / "model").exists():
        shutil.rmtree(tmp, ignore_errors=True)
        raise TranslateError("Pacchetto lingua incompleto (manca il modello).")
    final = dest_root / name
    shutil.rmtree(final, ignore_errors=True)
    tmp.replace(final)
    packs(refresh=True)
    return packs()[f"{m['from_code']}-{m['to_code']}"]


def download(key: str, job: str | None = None) -> dict:
    entry = next((e for e in available() if e["key"] == key), None)
    if not entry or not entry["url"]:
        raise TranslateError("Pacchetto lingua non trovato nell'elenco.")
    prog = PROGRESS.setdefault(job or key, {"done": 0, "total": 0, "label": f"Download {entry['from_name']} → {entry['to_name']}"})
    buf = io.BytesIO()
    try:
        with urllib.request.urlopen(urllib.request.Request(entry["url"], headers={"User-Agent": APP_ID}), timeout=60) as r:
            prog["total"] = int(r.headers.get("Content-Length") or 0)
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                buf.write(chunk)
                prog["done"] += len(chunk)
    except Exception as ex:  # noqa: BLE001
        raise TranslateError(f"Download non riuscito: {ex}")
    p = install_archive(buf.getvalue())
    return {"key": p.key}


def remove(key: str) -> None:
    p = packs().get(key)
    if not p:
        raise TranslateError("Pacchetto non installato.")
    if p.bundled:
        raise TranslateError("Questo pacchetto è incluso nell'installazione e non si può rimuovere.")
    shutil.rmtree(p.path, ignore_errors=True)
    packs(refresh=True)


# --------------------------------------------------------------------------- testo

_SENT = re.compile(r"(?<=[.!?;:。！？])\s+(?=[\"'«(\[]?[A-ZÀ-ÖØ-Þ0-9¿¡Ѐ-ЯΑ-Ω])|(?<=[。！？])")


def split_sentences(text: str, limit: int = 400) -> list[str]:
    """Frasi brevi = traduzioni migliori e più veloci. Le frasi lunghissime si spezzano su virgole/spazi."""
    parts = [s.strip() for s in _SENT.split(text) if s and s.strip()]
    out: list[str] = []
    for s in parts:
        while len(s) > limit:
            cut = max(s.rfind(", ", 0, limit), s.rfind(" ", 0, limit))
            cut = cut if cut > limit // 3 else limit
            out.append(s[:cut + 1].strip())
            s = s[cut + 1:].strip()
        if s:
            out.append(s)
    return out


def _needs_translation(s: str) -> bool:
    # numeri, codici, email, url restano come sono
    if not re.search(r"[^\W\d_]{2,}", s):
        return False
    if re.fullmatch(r"\S+@\S+\.\S+|https?://\S+|www\.\S+", s.strip()):
        return False
    return True


def translate_texts(texts: list[str], src: str, dst: str, progress: dict | None = None) -> list[str]:
    """Traduce una lista di paragrafi mantenendo l'ordine."""
    chain = route(src, dst)
    if not chain:
        return list(texts)
    # frasi uniche da tradurre (i testi ripetuti, es. intestazioni, si traducono una volta sola)
    split = [split_sentences(t) for t in texts]
    unique: dict[str, None] = {}
    for sents in split:
        for s in sents:
            if _needs_translation(s):
                unique.setdefault(s, None)
    todo = list(unique)
    if progress is not None:
        progress.update(total=len(todo) * len(chain), done=0)
    done: dict[str, str] = {}
    step = 16
    for i in range(0, len(todo), step):
        batch = todo[i:i + step]
        cur = batch
        for p in chain:
            cur = p.translate(cur)
            if progress is not None:
                progress["done"] = progress.get("done", 0) + len(batch)
        done.update(zip(batch, cur))
    joiner = "" if dst in ("zh", "zt", "ja") else " "
    return [joiner.join(done.get(s, s) for s in sents) for sents in split]


# --------------------------------------------------------------------------- riconoscimento lingua

_STOP = {
    "it": "il lo la gli le di che e è un una per con non del della dei delle nel nella sono questo questa anche come più",
    "en": "the and of to is in that it for with as on are this be by was from at or an have not which",
    "fr": "le la les des de et est un une pour que qui dans en du au sur pas ce cette avec sont par plus",
    "de": "der die das und ist nicht ein eine zu den mit von dem des sich auf für im auch werden sind",
    "es": "el la los las de que y es un una por con para del en se no al lo como más pero sus",
    "pt": "o a os as de que e é um uma para com não do da dos das em no na por mais se",
    "nl": "de het een en van is dat op te in niet zijn met voor er aan ook als",
    "pl": "i w na z się nie jest to że do o jak ale po tak co jego od za",
    "ro": "și de la în pe cu nu este un o ca din pentru sau care",
    "tr": "ve bir bu da de için ile çok olarak daha gibi olan",
    "sv": "och att det som en på är av för med till den inte har",
}
_STOP_SETS = {k: set(v.split()) for k, v in _STOP.items()}


def detect(text: str) -> str:
    """Riconoscimento semplice ma robusto: alfabeto, poi parole frequenti per le lingue latine."""
    sample = text[:6000]
    counts = {
        "ja": len(re.findall(r"[぀-ヿ]", sample)), "zh": len(re.findall(r"[一-鿿]", sample)),
        "ko": len(re.findall(r"[가-힯]", sample)), "ar": len(re.findall(r"[؀-ۿ]", sample)),
        "ru": len(re.findall(r"[Ѐ-ӿ]", sample)), "el": len(re.findall(r"[Ͱ-Ͽ]", sample)),
        "he": len(re.findall(r"[֐-׿]", sample)), "hi": len(re.findall(r"[ऀ-ॿ]", sample)),
        "th": len(re.findall(r"[฀-๿]", sample)),
    }
    letters = len(re.findall(r"[^\W\d_]", sample)) or 1
    if counts["ja"] > 0.05 * letters:
        return "ja"
    best = max(counts, key=counts.get)
    if counts[best] > 0.3 * letters:
        if best == "ru" and re.search(r"[іїєґ]", sample.lower()):
            return "uk"
        return best
    words = re.findall(r"[a-zàâäçéèêëîïôöùûüñßøåæœìòúíóáãõșțşğış]+", sample.lower())
    scores = {k: sum(1 for w in words if w in s) for k, s in _STOP_SETS.items()}
    lang = max(scores, key=scores.get)
    return lang if scores[lang] > 0 else "en"
