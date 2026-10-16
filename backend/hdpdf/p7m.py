"""File firmati CAdES (.p7m / .p7s), sulla falsa riga di ArubaSign / DiKe.

* apre buste CMS in DER, Base64 o PEM, anche annidate (file.pdf.p7m.p7m) e con più firmatari;
* estrae il documento originale;
* verifica per ogni firma: integrità, certificato del firmatario, catena verso una CA
  dell'elenco ufficiale AgID (TSL-IT, ETSI TS 119 612), revoca (OCSP/CRL, se online),
  scadenza, marca temporale, firma qualificata (QCStatements).

L'elenco AgID viene scaricato e tenuto in cache in %LOCALAPPDATA%\\PDFz\\tsl.
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hashlib
import io
import json
import logging
import re
import threading
import time
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

from asn1crypto import cms, tsp, x509

from . import APP_ID, APP_NAME, config

log = logging.getLogger("hdpdf.p7m")

TSL_URL = "https://eidas.agid.gov.it/TL/TSL-IT.xml"
TSL_MAX_AGE = 7 * 24 * 3600          # si aggiorna una volta a settimana
MAX_NESTING = 10

# servizi dell'elenco considerati affidabili
_CA_TYPES = {
    "http://uri.etsi.org/TrstSvc/Svctype/CA/QC",       # CA che emette certificati qualificati
    "http://uri.etsi.org/TrstSvc/Svctype/TSA/QTST",    # marche temporali qualificate
    "http://uri.etsi.org/TrstSvc/Svctype/TSA",
}
_OK_STATUS = (
    "/granted", "/accredited", "/undersupervision", "/recognisedatnationallevel", "/setbynationallaw",
)
# QCStatements (ETSI EN 319 412-5) cercati come OID codificati DER
_QC_COMPLIANCE = bytes.fromhex("060604008e460101")   # 0.4.0.1862.1.1 QcCompliance
_QC_SSCD = bytes.fromhex("060604008e460104")         # 0.4.0.1862.1.4 QcSSCD


class P7mError(Exception):
    """Errore mostrato all'utente."""


# --------------------------------------------------------------------------- elenco CA AgID

def _bundled_tsl() -> Path | None:
    """Copia dell'elenco AgID inclusa nell'app (Android: messa al momento della build), usata se non c'è niente di meglio."""
    env = os.environ.get("HDPDF_TSL_BUNDLED")
    for p in ([Path(env)] if env else []) + [config.app_dir() / "vendor" / "tsl" / "TSL-IT.xml"]:
        if p.is_file():
            return p
    return None


def _tsl_dir() -> Path:
    d = config.data_dir() / "tsl"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_tsl(data: bytes) -> dict:
    """Legge un Trusted List ETSI TS 119 612 e restituisce i certificati delle CA attive."""
    try:
        root = ET.fromstring(data)
    except ET.ParseError as ex:
        raise P7mError(f"Elenco CA non leggibile: {ex}")
    certs: list[dict] = []
    issued = next_update = ""
    for el in root.iter():
        name = _local(el.tag)
        if name == "ListIssueDateTime" and el.text:
            issued = el.text.strip()
        elif name == "NextUpdate":
            for c in el:
                if _local(c.tag) == "dateTime" and c.text:
                    next_update = c.text.strip()
    for tsp_el in root.iter():
        if _local(tsp_el.tag) != "TrustServiceProvider":
            continue
        provider = ""
        for el in tsp_el.iter():
            if _local(el.tag) == "TSPName":
                n = next((c for c in el if _local(c.tag) == "Name"), None)
                if n is not None and n.text:
                    provider = n.text.strip()
                break
        for svc in tsp_el.iter():
            if _local(svc.tag) != "ServiceInformation":
                continue
            stype = status = sname = ""
            ders: list[bytes] = []
            for el in svc.iter():
                ln = _local(el.tag)
                if ln == "ServiceTypeIdentifier" and el.text:
                    stype = el.text.strip()
                elif ln == "ServiceStatus" and el.text:
                    status = el.text.strip()
                elif ln == "ServiceName" and not sname:
                    n = next((c for c in el if _local(c.tag) == "Name"), None)
                    sname = (n.text or "").strip() if n is not None else ""
                elif ln == "X509Certificate" and el.text:
                    try:
                        ders.append(base64.b64decode("".join(el.text.split())))
                    except Exception:  # noqa: BLE001
                        pass
            if stype in _CA_TYPES and status.endswith(_OK_STATUS):
                for d in ders:
                    certs.append({"der": d, "provider": provider, "service": sname,
                                  "type": "tsa" if "/TSA" in stype else "ca"})
    return {"issued": issued, "next_update": next_update, "certs": certs}


@dataclass
class TrustList:
    certs: list[x509.Certificate] = field(default_factory=list)
    providers: dict[bytes, str] = field(default_factory=dict)   # sha1 certificato -> fornitore
    issued: str = ""
    next_update: str = ""
    fetched: float = 0.0
    source: str = ""        # "online", "cache", "" (non disponibile)
    error: str = ""

    def info(self) -> dict:
        return {
            "available": bool(self.certs), "count": len(self.certs), "issued": self.issued,
            "next_update": self.next_update, "source": self.source, "error": self.error,
            "fetched": dt.datetime.fromtimestamp(self.fetched).isoformat(timespec="minutes") if self.fetched else "",
            "url": TSL_URL,
        }


_tsl: TrustList | None = None
_tsl_lock = threading.Lock()


def _build_trust(raw: bytes, source: str, fetched: float) -> TrustList:
    parsed = parse_tsl(raw)
    tl = TrustList(issued=parsed["issued"], next_update=parsed["next_update"], fetched=fetched, source=source)
    seen = set()
    for c in parsed["certs"]:
        try:
            cert = x509.Certificate.load(c["der"])
            _ = cert.subject  # forza il parsing
        except Exception:  # noqa: BLE001
            continue
        h = hashlib.sha1(c["der"]).digest()
        if h in seen:
            continue
        seen.add(h)
        tl.certs.append(cert)
        tl.providers[h] = c["provider"]
    return tl


def trust_list(refresh: bool = False, allow_download: bool = True) -> TrustList:
    """Elenco CA AgID: dalla memoria, dalla cache su disco o scaricato (se vecchio di 7 giorni)."""
    global _tsl
    with _tsl_lock:
        cache = _tsl_dir() / "TSL-IT.xml"
        age = time.time() - cache.stat().st_mtime if cache.exists() else None
        if _tsl and _tsl.certs and not refresh and age is not None and age < TSL_MAX_AGE:
            return _tsl
        err = ""
        if sys.platform == "emscripten":
            # app Android: Python non ha accesso diretto alla rete; l'app scarica l'elenco e lo passa a install_trust_list()
            allow_download = False
            if refresh:
                err = "Aggiornamento elenco AgID non riuscito: controlla la connessione a internet."
        if allow_download and (refresh or age is None or age >= TSL_MAX_AGE):
            try:
                req = urllib.request.Request(TSL_URL, headers={"User-Agent": APP_ID})
                with urllib.request.urlopen(req, timeout=20) as r:
                    raw = r.read()
                tl = _build_trust(raw, "online", time.time())
                if not tl.certs:
                    raise P7mError("l'elenco scaricato non contiene CA")
                tmp = cache.with_suffix(".tmp")
                tmp.write_bytes(raw)
                tmp.replace(cache)
                _tsl = tl
                return tl
            except Exception as ex:  # noqa: BLE001 - si ripiega sulla cache
                err = f"Download elenco AgID non riuscito: {ex}"
                log.warning(err)
        if cache.exists():
            try:
                tl = _build_trust(cache.read_bytes(), "cache", cache.stat().st_mtime)
                tl.error = err
                _tsl = tl
                return tl
            except Exception as ex:  # noqa: BLE001
                err = err or f"Cache elenco AgID non valida: {ex}"
        bundled = _bundled_tsl()
        if bundled:
            try:
                tl = _build_trust(bundled.read_bytes(), "app", bundled.stat().st_mtime)
                tl.error = err
                _tsl = tl
                return tl
            except Exception as ex:  # noqa: BLE001
                err = err or f"Elenco AgID incluso non valido: {ex}"
        _tsl = TrustList(error=err or "Elenco AgID non ancora scaricato.")
        return _tsl


def install_trust_list(raw: bytes, source: str = "online") -> TrustList:
    """Installa un elenco AgID ricevuto da fuori (scaricato dall'app Android o caricato a mano da file)."""
    global _tsl
    try:
        tl = _build_trust(raw, source, time.time())
    except Exception as ex:  # noqa: BLE001
        raise P7mError(f"Il file non è un elenco AgID valido (TSL-IT.xml): {ex}") from ex
    if not tl.certs:
        raise P7mError("Il file non contiene certificati di CA: non è l'elenco AgID (TSL-IT.xml).")
    with _tsl_lock:
        cache = _tsl_dir() / "TSL-IT.xml"
        tmp = cache.with_suffix(".tmp")
        tmp.write_bytes(raw)
        tmp.replace(cache)
        _tsl = tl
    return tl


def set_trust_list_for_tests(raw: bytes | None) -> None:
    """Usato dai test: installa un elenco al posto di quello AgID."""
    global _tsl
    with _tsl_lock:
        cache = _tsl_dir() / "TSL-IT.xml"
        if raw is None:
            _tsl = None
            cache.unlink(missing_ok=True)
            return
        cache.write_bytes(raw)
        _tsl = _build_trust(raw, "cache", time.time())


# --------------------------------------------------------------------------- lettura busta

def _decode_container(data: bytes) -> bytes:
    """DER così com'è, oppure Base64 / PEM ("-----BEGIN PKCS7-----")."""
    head = data[:1]
    if head == b"\x30":
        return data
    text = data.decode("ascii", errors="ignore")
    text = re.sub(r"-----(BEGIN|END)[^-]*-----", "", text)
    text = re.sub(r"\s+", "", text)
    if not text:
        raise P7mError("Il file non è una busta firmata (p7m) valida.")
    try:
        raw = base64.b64decode(text + "=" * (-len(text) % 4), validate=False)
    except Exception:  # noqa: BLE001
        raise P7mError("Il file non è una busta firmata (p7m) valida.")
    if raw[:1] != b"\x30":
        raise P7mError("Il file non è una busta firmata (p7m) valida.")
    return raw


def _load_signed_data(data: bytes) -> cms.SignedData | None:
    try:
        ci = cms.ContentInfo.load(_decode_container(data))
        if ci["content_type"].native != "signed_data":
            return None
        sd = ci["content"]
        _ = sd["signer_infos"].native  # forza il parsing: errori qui = file non valido
        return sd
    except P7mError:
        return None
    except Exception:  # noqa: BLE001
        return None


def is_signed_container(data: bytes) -> bool:
    return _load_signed_data(data) is not None


def _strip_ext(name: str) -> str:
    n = name
    while re.search(r"\.(p7m|p7s|p7c|p7)$", n, re.I):
        n = n[: n.rfind(".")]
    return n or "documento"


_MAGIC = [
    (b"%PDF", ".pdf", "application/pdf"),
    (b"PK\x03\x04", ".zip", "application/zip"),
    (b"\xd0\xcf\x11\xe0", ".doc", "application/msword"),
    (b"\x89PNG", ".png", "image/png"),
    (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
    (b"<?xml", ".xml", "application/xml"),
    (b"{\\rtf", ".rtf", "application/rtf"),
    (b"II*\x00", ".tif", "image/tiff"),
    (b"MM\x00*", ".tif", "image/tiff"),
]


def _sniff(data: bytes, name: str) -> tuple[str, str]:
    """Nome definitivo e tipo MIME del documento estratto."""
    ext = Path(name).suffix.lower()
    mime = ""
    for magic, mext, m in _MAGIC:
        if data.startswith(magic) or (magic == b"<?xml" and data.lstrip(b"\xef\xbb\xbf \r\n\t").startswith(magic)):
            mime = m
            if not ext:
                name += mext
                ext = mext
            break
    if ext in (".docx", ".xlsx", ".pptx") and mime == "application/zip":
        mime = {".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}[ext]
    if not mime and ext == ".xml":
        mime = "application/xml"
    if not mime and ext == ".txt":
        mime = "text/plain"
    return name, mime or "application/octet-stream"


# --------------------------------------------------------------------------- descrizione certificati

def _name_attr(name: x509.Name, key: str) -> str:
    try:
        v = name.native.get(key)
    except Exception:  # noqa: BLE001
        return ""
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v)
    return str(v or "")


def _fiscal_code(serial: str) -> str:
    """'TINIT-RSSMRA80A01H501U' -> 'RSSMRA80A01H501U'."""
    m = re.match(r"^(?:TIN|IDC|PAS|VAT)[A-Z]{2}-(.+)$", serial or "")
    return m.group(1) if m else serial


def _ext_bytes(cert: x509.Certificate, dotted: str) -> bytes:
    for ext in cert["tbs_certificate"]["extensions"] or []:
        if ext["extn_id"].dotted == dotted:
            return ext["extn_value"].contents or b""
    return b""


def describe_cert(cert: x509.Certificate) -> dict:
    subj, iss = cert.subject, cert.issuer
    given, surname = _name_attr(subj, "given_name"), _name_attr(subj, "surname")
    cn = _name_attr(subj, "common_name")
    serial = _name_attr(subj, "serial_number")
    qc = _ext_bytes(cert, "1.3.6.1.5.5.7.1.3")
    ku = []
    try:
        ku = list(cert.key_usage_value.native) if cert.key_usage_value else []
    except Exception:  # noqa: BLE001
        pass
    nb, na = cert["tbs_certificate"]["validity"]["not_before"].native, cert["tbs_certificate"]["validity"]["not_after"].native
    return {
        "name": " ".join(x for x in (given, surname) if x) or cn or "Firmatario sconosciuto",
        "common_name": cn,
        "given_name": given,
        "surname": surname,
        "fiscal_code": _fiscal_code(serial),
        "organization": _name_attr(subj, "organization_name"),
        "organizational_unit": _name_attr(subj, "organizational_unit_name"),
        "title": _name_attr(subj, "title"),
        "country": _name_attr(subj, "country_name"),
        "email": _name_attr(subj, "email_address"),
        "issuer": _name_attr(iss, "common_name") or _name_attr(iss, "organization_name"),
        "issuer_org": _name_attr(iss, "organization_name"),
        "serial": format(cert.serial_number, "X"),
        "valid_from": nb.isoformat() if nb else "",
        "valid_to": na.isoformat() if na else "",
        "key_usage": ku,
        "non_repudiation": "non_repudiation" in ku or "content_commitment" in ku,
        "qualified": _QC_COMPLIANCE in qc,
        "qscd": _QC_SSCD in qc,
        "sha256": hashlib.sha256(cert.dump()).hexdigest().upper(),
    }


# --------------------------------------------------------------------------- verifica firme

def _signer_cert(sd: cms.SignedData, si: cms.SignerInfo) -> x509.Certificate | None:
    sid = si["sid"]
    certs = [c.chosen for c in (sd["certificates"] or []) if c.name == "certificate"]
    for c in certs:
        if sid.name == "issuer_and_serial_number":
            if c.issuer == sid.chosen["issuer"] and c.serial_number == sid.chosen["serial_number"].native:
                return c
        elif sid.name == "subject_key_identifier":
            if c.key_identifier == sid.chosen.native:
                return c
    return certs[0] if len(certs) == 1 else None


def _signed_attr(si: cms.SignerInfo, name: str):
    for a in si["signed_attrs"] or []:
        if a["type"].native == name:
            return a["values"][0]
    return None


def _timestamp(si: cms.SignerInfo, roots: list) -> dict | None:
    for a in si["unsigned_attrs"] or []:
        if a["type"].dotted == "1.2.840.113549.1.9.16.2.14":   # signatureTimeStampToken
            try:
                tst = a["values"][0]
                tsd = tst["content"]
                info = tsd["encap_content_info"]["content"].parsed
                if not isinstance(info, tsp.TSTInfo):
                    info = tsp.TSTInfo.load(tsd["encap_content_info"]["content"].native)
                gen = info["gen_time"].native
                # la marca deve riguardare proprio questa firma
                algo = info["message_imprint"]["hash_algorithm"]["algorithm"].native
                expected = hashlib.new(algo, si["signature"].native).digest()
                ok = expected == info["message_imprint"]["hashed_message"].native
                tsa = ""
                tsa_cert = None
                for c in tsd["certificates"] or []:
                    if c.name == "certificate":
                        tsa_cert = c.chosen
                        tsa = _name_attr(c.chosen.subject, "common_name") or _name_attr(c.chosen.subject, "organization_name")
                        break
                return {"time": gen, "imprint_ok": ok, "tsa": tsa, "tsa_cert": tsa_cert,
                        "trusted": ok and _tst_trusted(tsd, gen, roots, si["signature"].native)}
            except Exception as ex:  # noqa: BLE001
                return {"time": None, "imprint_ok": False, "tsa": "", "error": str(ex), "tsa_cert": None}
    return None


def _tst_trusted(tsd: cms.SignedData, gen: dt.datetime, roots: list, signature: bytes) -> bool:
    """Verifica crittografica della marca temporale e della TSA rispetto all'elenco AgID."""
    if not roots:
        return False
    try:
        from pyhanko.sign.validation.generic_cms import validate_tst_signed_data
        from pyhanko.sign.validation.status import TimestampSignatureStatus
        from pyhanko_certvalidator import ValidationContext
        vc = ValidationContext(trust_roots=roots, moment=gen, best_signature_time=gen, allow_fetching=False,
                               retroactive_revinfo=True, weak_hash_algos={"md2", "md5"})
        kw = asyncio.run(validate_tst_signed_data(tsd, vc, lambda algo: hashlib.new(algo, signature).digest()))
        return bool(TimestampSignatureStatus(**kw).trusted)
    except Exception as ex:  # noqa: BLE001
        log.info("Marca temporale non verificata: %s", ex)
        return False


def _counter_signers(si: cms.SignerInfo) -> int:
    n = 0
    for a in si["unsigned_attrs"] or []:
        if a["type"].native == "counter_signature":
            n += len(a["values"])
    return n


def _single_signer(sd: cms.SignedData, si: cms.SignerInfo) -> cms.SignedData:
    c = sd.copy()
    c["signer_infos"] = cms.SignerInfos([si])
    return c


def _fetcher(online: bool):
    if not online:
        return None
    try:
        from pyhanko_certvalidator.fetchers.requests_fetchers import RequestsFetcherBackend
        return RequestsFetcherBackend(per_request_timeout=8)
    except Exception:  # noqa: BLE001
        return None


async def _validate_one(sd: cms.SignedData, si: cms.SignerInfo, raw_digest: bytes | None, roots: list,
                        moment: dt.datetime | None, online: bool):
    from pyhanko.sign.validation.generic_cms import async_validate_cms_signature
    from pyhanko.sign.validation.status import StandardCMSSignatureStatus
    from pyhanko.sign.validation.utils import CMSAlgorithmUsagePolicy
    from pyhanko_certvalidator import ValidationContext
    from pyhanko_certvalidator.policy_decl import DisallowWeakAlgorithmsPolicy

    weak = frozenset({"md2", "md5"})  # SHA-1 tollerato per i documenti storici (segnalato a parte)
    vc_kw = dict(trust_roots=roots, allow_fetching=online, revocation_mode="soft-fail", weak_hash_algos=weak,
                 other_certs=[c.chosen for c in (sd["certificates"] or []) if c.name == "certificate"])
    if moment:
        # verifica "storica" (alla data della marca o della firma): serve una prova di esistenza a quella data
        vc_kw.update(moment=moment, best_signature_time=moment, retroactive_revinfo=True)
    fb = _fetcher(online)
    if fb is not None:
        vc_kw["fetcher_backend"] = fb
    vc = ValidationContext(**vc_kw)
    policy = CMSAlgorithmUsagePolicy.lift_policy(DisallowWeakAlgorithmsPolicy(weak_hash_algos=weak))
    return await async_validate_cms_signature(_single_signer(sd, si), status_cls=StandardCMSSignatureStatus,
                                              raw_digest=raw_digest, validation_context=vc, algorithm_policy=policy)


def _status_problem(st) -> str:
    tpi = getattr(st, "trust_problem_indic", None)
    return getattr(tpi, "name", "") if tpi else ""


def _verify_signer(sd: cms.SignedData, si: cms.SignerInfo, detached: bytes | None, roots: list, online: bool) -> dict:
    """detached = documento esterno per le firme separate (.p7s), None se è dentro la busta."""
    cert = _signer_cert(sd, si)
    out: dict = {"cert": describe_cert(cert) if cert else None, "warnings": [], "errors": []}
    md_algo = si["digest_algorithm"]["algorithm"].native
    out["digest_algorithm"] = md_algo.upper()
    if md_algo in ("sha1", "md5"):
        out["warnings"].append(f"Algoritmo di impronta debole ({md_algo.upper()}).")
    st_time = _signed_attr(si, "signing_time")
    out["signing_time"] = st_time.native.isoformat() if st_time is not None else ""
    out["cades_bes"] = _signed_attr(si, "signing_certificate_v2") is not None or _signed_attr(si, "signing_certificate") is not None
    out["counter_signatures"] = _counter_signers(si)
    ts = _timestamp(si, roots)
    if ts:
        out["timestamp"] = {"time": ts["time"].isoformat() if ts.get("time") else "", "tsa": ts["tsa"],
                            "matches": ts["imprint_ok"], "trusted": bool(ts.get("trusted"))}
        if not ts["imprint_ok"]:
            out["warnings"].append("La marca temporale non corrisponde a questa firma.")
        elif not ts.get("trusted"):
            out["warnings"].append("La marca temporale non è stata emessa da una TSA dell'elenco AgID: la sua data non è considerata certa.")
    if cert is None:
        out["errors"].append("Certificato del firmatario non presente nella busta.")
        out.update(intact=False, valid=False, trusted=False, revoked=False, expired=False, verdict="invalid")
        return out

    raw_digest = hashlib.new(md_algo, detached).digest() if detached is not None else None
    # momento di verifica: marca temporale (data certa) se presente, altrimenti adesso
    moment = ts["time"] if ts and ts.get("time") and ts.get("trusted") else None
    out["checked_at"] = (moment or dt.datetime.now(dt.timezone.utc)).isoformat()
    out["checked_at_source"] = "marca temporale" if moment else "data attuale"

    def run(m):
        return asyncio.run(_validate_one(sd, si, raw_digest, roots, m, online))

    try:
        st = run(moment)
    except Exception as ex:  # noqa: BLE001
        log.warning("Verifica firma: %s", ex)
        out["errors"].append(f"Firma non verificabile: {ex}")
        out.update(intact=False, valid=False, trusted=False, revoked=False, expired=False, verdict="invalid")
        return out

    problem = _status_problem(st)
    expired = "EXPIRED" in problem or "OUT_OF_BOUNDS" in problem
    if expired and not moment and st_time is not None:
        # certificato ora scaduto: verifica alla data dichiarata della firma (come ArubaSign, con avviso)
        try:
            st2 = run(st_time.native)
            if st2.trusted:
                st = st2
                out["checked_at"] = st_time.native.isoformat()
                out["checked_at_source"] = "data dichiarata della firma"
                out["warnings"].append("Il certificato oggi è scaduto: la firma risulta valida alla data dichiarata, "
                                       "ma senza marca temporale quella data non è certa.")
                problem = _status_problem(st)
        except Exception:  # noqa: BLE001
            pass

    revoked = bool(st.revoked) or "REVOKED" in problem
    trusted = bool(st.trusted)
    out.update(intact=bool(st.intact), valid=bool(st.valid), trusted=trusted, revoked=revoked,
               expired=expired and out["checked_at_source"] == "data attuale")
    if not st.intact:
        out["errors"].append("Il documento è stato modificato dopo la firma (impronta non corrispondente).")
    elif not st.valid:
        out["errors"].append("La firma crittografica non è valida.")
    if revoked:
        out["errors"].append("Il certificato del firmatario è revocato o sospeso.")
    if st.intact and st.valid and not trusted and not revoked:
        if not roots:
            out["warnings"].append("Elenco CA AgID non disponibile: attendibilità del certificato non verificata.")
        elif expired:
            out["errors"].append("Il certificato del firmatario era scaduto (o non ancora valido) al momento della verifica.")
        else:
            out["warnings"].append("Il certificato non è stato emesso da una CA dell'elenco AgID: "
                                   "la firma è integra ma il firmatario non è garantito da un certificatore riconosciuto.")
    if not out["cert"]["non_repudiation"]:
        out["warnings"].append("Il certificato non è di firma (manca l'uso 'non ripudio').")
    path = getattr(st, "validation_path", None)
    if path is not None:
        try:
            out["chain"] = [_name_attr(c.subject, "common_name") or _name_attr(c.subject, "organization_name")
                            for c in path.iter_certs(include_root=True)]
        except Exception:  # noqa: BLE001
            pass

    if out["errors"]:
        out["verdict"] = "invalid"
    elif out["warnings"] or not trusted:
        out["verdict"] = "warning"
    else:
        out["verdict"] = "valid"
    return out


# --------------------------------------------------------------------------- analisi completa

@dataclass
class Analysis:
    report: dict
    content: bytes
    content_name: str
    content_mime: str


def analyze(data: bytes, name: str, detached: bytes | None = None, online: bool = True) -> Analysis:
    """Analizza una busta (anche annidata) e restituisce il rapporto e il documento estratto."""
    sd = _load_signed_data(data)
    if sd is None:
        raise P7mError(f"\"{name}\" non è un file firmato CAdES (p7m/p7s) valido o è danneggiato.")
    tl = trust_list(allow_download=online)
    roots = list(tl.certs)
    envelopes = []
    content: bytes | None = None
    detached_used = False
    level = 0
    while sd is not None and level < MAX_NESTING:
        eci = sd["encap_content_info"]
        inner = eci["content"].native if eci["content"].native is not None else None
        env_content = inner
        if env_content is None:
            if detached is None:
                raise P7mError("Firma separata (.p7s): carica anche il documento originale a cui si riferisce.")
            env_content = detached
            detached_used = True
        signers = [_verify_signer(sd, si, None if inner is not None else env_content, roots, online)
                   for si in sd["signer_infos"]]
        envelopes.append({"level": level, "signers": signers, "detached": inner is None})
        content = env_content
        level += 1
        nested = _load_signed_data(content) if inner is not None else None
        sd = nested
    if content is None:
        raise P7mError("La busta non contiene alcun documento.")
    if sd is not None:
        raise P7mError("Troppi livelli di firma annidati.")

    base = _strip_ext(name)
    content_name, mime = _sniff(content, base)
    all_signers = [s for e in envelopes for s in e["signers"]]
    if any(s["verdict"] == "invalid" for s in all_signers):
        verdict = "invalid"
    elif any(s["verdict"] == "warning" for s in all_signers):
        verdict = "warning"
    else:
        verdict = "valid"
    report = {
        "file": name,
        "verdict": verdict,
        "signatures": len(all_signers),
        "levels": len(envelopes),
        "envelopes": envelopes,
        "detached": detached_used,
        "online": online,
        "trust": tl.info(),
        "content": {"name": content_name, "mime": mime, "size": len(content)},
        "checked": dt.datetime.now().isoformat(timespec="seconds"),
    }
    return Analysis(report=json.loads(json.dumps(report, default=str)), content=content,
                    content_name=content_name, content_mime=mime)


# --------------------------------------------------------------------------- rapporto di verifica (PDF)

_VERDICT_TXT = {"valid": ("FIRMA VALIDA", "#15803d"), "warning": ("FIRMA VALIDA CON AVVISI", "#b45309"),
                "invalid": ("FIRMA NON VALIDA", "#b91c1c")}


def _fmt_dt(v: str) -> str:
    if not v:
        return "–"
    try:
        d = dt.datetime.fromisoformat(v)
        if d.tzinfo:
            d = d.astimezone()
        return d.strftime("%d/%m/%Y %H:%M:%S")
    except ValueError:
        return v


def _esc(v) -> str:
    import html
    return html.escape(str(v if v not in (None, "") else "–"))


def report_pdf(report: dict) -> bytes:
    """Rapporto di verifica in PDF (A4), da archiviare insieme al documento."""
    import pymupdf

    title, color = _VERDICT_TXT.get(report.get("verdict", ""), ("ESITO SCONOSCIUTO", "#334155"))
    tr = report.get("trust", {})
    parts = [f"""
<h1>Rapporto di verifica firma digitale</h1>
<p class="muted">{APP_NAME} · verificato il {_esc(_fmt_dt(report.get('checked', '')))}</p>
<p class="verdict" style="background:{color}">{title}</p>
<h2>Riepilogo</h2>
<p class="kv"><span class="k">Esito:</span> <b style="color:{color}">{title}</b></p>
<p class="kv"><span class="k">File verificato:</span> {_esc(report.get('file'))}</p>
<p class="kv"><span class="k">Documento contenuto:</span> {_esc(report['content']['name'])} ({report['content']['size']:,} byte)</p>
<p class="kv"><span class="k">Firme:</span> {report.get('signatures')} su {report.get('levels')} livello/i{' · firma separata (.p7s)' if report.get('detached') else ''}</p>
<p class="kv"><span class="k">Elenco CA:</span> {'AgID TSL-IT, ' + str(tr.get('count')) + ' certificati, emesso ' + _esc(_fmt_dt(tr.get('issued', ''))) if tr.get('available') else 'non disponibile'}</p>
<p class="kv"><span class="k">Controllo revoca:</span> {'online (OCSP/CRL)' if report.get('online') else 'non eseguito (verifica offline)'}</p>"""]
    n = 0
    for env in report.get("envelopes", []):
        for s in env["signers"]:
            n += 1
            c = s.get("cert") or {}
            vt, vc = _VERDICT_TXT.get(s.get("verdict", ""), ("–", "#334155"))
            ts = s.get("timestamp")
            rows = [
                ("Esito", f'<b style="color:{vc}">{vt}</b>'),
                ("Firmatario", _esc(c.get("name"))),
                ("Codice fiscale", _esc(c.get("fiscal_code"))),
                ("Organizzazione", _esc(c.get("organization"))),
                ("Emesso da", _esc(c.get("issuer"))),
                ("Validità certificato", f"{_esc(_fmt_dt(c.get('valid_from', '')))} – {_esc(_fmt_dt(c.get('valid_to', '')))}"),
                ("Numero di serie", _esc(c.get("serial"))),
                ("Firma qualificata", "sì" + (" (dispositivo sicuro QSCD)" if c.get("qscd") else "") if c.get("qualified") else "no"),
                ("Data della firma (dichiarata)", _esc(_fmt_dt(s.get("signing_time", "")))),
                ("Marca temporale", f"{_esc(_fmt_dt(ts['time']))} · {_esc(ts['tsa'])}{'' if ts.get('trusted') else ' (non attendibile)'}" if ts else "assente"),
                ("Verifica alla data", f"{_esc(_fmt_dt(s.get('checked_at', '')))} ({_esc(s.get('checked_at_source'))})"),
                ("Integrità documento", "sì" if s.get("intact") else "<b>NO</b>"),
                ("Certificato attendibile", "sì" if s.get("trusted") else "no"),
                ("Revocato/sospeso", "<b>SÌ</b>" if s.get("revoked") else "no"),
                ("Algoritmo", _esc(s.get("digest_algorithm"))),
                ("Catena", " → ".join(_esc(x) for x in s.get("chain", [])) or "–"),
            ]
            msgs = "".join(f'<li class="err">{_esc(e)}</li>' for e in s.get("errors", []))
            msgs += "".join(f'<li class="warn">{_esc(w)}</li>' for w in s.get("warnings", []))
            parts.append(f"<h2>Firma {n}{' · busta di livello ' + str(env['level'] + 1) if report.get('levels', 1) > 1 else ''}</h2>"
                         + "".join(f'<p class="kv"><span class="k">{k}:</span> {v}</p>' for k, v in rows)
                         + (f"<ul>{msgs}</ul>" if msgs else ""))
    parts.append('<p class="muted">Il rapporto riporta l\'esito delle verifiche eseguite su questo computer con l\'elenco '
                 'dei certificatori pubblicato da AgID. Impronta SHA-256 dei certificati disponibile nell\'applicazione.</p>')
    css = """
    * { font-family: sans-serif; }
    body { font-size: 9.5pt; color: #0f172a; }
    h1 { font-size: 16pt; color: #1e396c; margin: 0 0 2pt 0; }
    h2 { font-size: 11.5pt; color: #1e396c; margin: 12pt 0 4pt 0; border-bottom: 1px solid #cbd5e1; }
    .muted { color: #64748b; font-size: 8.5pt; }
    .verdict { color: #fff; font-weight: bold; font-size: 12pt; padding: 5pt 8pt; }
    p.kv { margin: 0 0 2.5pt 0; }
    .k { color: #64748b; }
    li.err { color: #b91c1c; } li.warn { color: #b45309; }
    """
    story = pymupdf.Story(html="".join(parts), user_css=css)
    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    page = pymupdf.paper_rect("a4")
    area = page + (42, 42, -42, -42)
    more = True
    while more:
        dev = writer.begin_page(page)
        more, _ = story.place(area)
        story.draw(dev)
        writer.end_page()
    writer.close()
    return buf.getvalue()
