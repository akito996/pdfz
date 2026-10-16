"""Azioni sui file firmati oltre alla verifica (menu del tasto destro di Windows e pannello "File firmati"):

* estrai   → il documento contenuto nella busta (anche con buste annidate), senza verificare le firme;
* marca    → marca temporale RFC 3161 su ogni firma (CAdES-T): la busta resta la stessa, con in più la marca;
* cifra    → busta cifrata CMS EnvelopedData (.p7e) per uno o più destinatari (certificati RSA).
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from asn1crypto import cms, tsp
from asn1crypto import x509 as ax509

from . import APP_ID
from .p7m import MAX_NESTING, P7mError, _decode_container, _load_signed_data, _sniff, _strip_ext

# TSA gratuita (non qualificata): utile per avere una prova di esistenza, ma per la "data certa" con valore legale
# in Italia serve una TSA dell'elenco AgID (Aruba, InfoCert, Namirial…), di solito a pagamento e con credenziali.
DEFAULT_TSA = "http://timestamp.digicert.com"


def unique_path(p: Path) -> Path:
    """Stesso nome se libero, altrimenti "nome (2).ext", "nome (3).ext"…"""
    if not p.exists():
        return p
    stem, ext = p.stem, p.suffix
    m = re.match(r"^(.*) \((\d+)\)$", stem)
    if m:
        stem = m.group(1)
    i = 2
    while True:
        q = p.with_name(f"{stem} ({i}){ext}")
        if not q.exists():
            return q
        i += 1


# --------------------------------------------------------------------------- estrai

def extract(data: bytes, name: str) -> tuple[bytes, str, str]:
    """(contenuto, nome, mime) del documento firmato, togliendo tutte le buste."""
    sd = _load_signed_data(data)
    if sd is None:
        raise P7mError(f"\"{name}\" non è un file firmato (p7m) valido o è danneggiato.")
    content = None
    for _ in range(MAX_NESTING):
        inner = sd["encap_content_info"]["content"].native
        if inner is None:
            raise P7mError("È una firma separata (.p7s): il documento non è contenuto nel file.")
        content = inner
        sd = _load_signed_data(content)
        if sd is None:
            break
    else:
        raise P7mError("Troppi livelli di firma annidati.")
    out_name, mime = _sniff(content, _strip_ext(name))
    return content, out_name, mime


def extract_to_folder(src: Path) -> Path:
    content, out_name, _ = extract(src.read_bytes(), src.name)
    dest = unique_path(src.with_name(out_name))
    dest.write_bytes(content)
    return dest


# --------------------------------------------------------------------------- marca temporale

def _http_tsa(url: str, user: str = "", password: str = "", timeout: float = 25) -> Callable[[bytes], bytes]:
    def fetch(req: bytes) -> bytes:
        headers = {"Content-Type": "application/timestamp-query", "Accept": "application/timestamp-reply",
                   "User-Agent": APP_ID}
        if user:
            headers["Authorization"] = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()
        r = urllib.request.Request(url, data=req, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as ex:
            if ex.code in (401, 403):
                raise P7mError("Il servizio di marca temporale ha rifiutato l'accesso: controlla utente e password.") from ex
            raise P7mError(f"Il servizio di marca temporale ha risposto con un errore ({ex.code}).") from ex
        except Exception as ex:  # noqa: BLE001
            raise P7mError(f"Servizio di marca temporale non raggiungibile ({url}): controlla la connessione.") from ex
    return fetch


def _request_token(signature: bytes, fetch: Callable[[bytes], bytes]) -> cms.ContentInfo:
    digest = hashlib.sha256(signature).digest()
    nonce = secrets.randbits(63)
    req = tsp.TimeStampReq({
        "version": 1,
        "message_imprint": {"hash_algorithm": {"algorithm": "sha256"}, "hashed_message": digest},
        "nonce": nonce,
        "cert_req": True,
    })
    raw = fetch(req.dump())
    try:
        resp = tsp.TimeStampResp.load(raw)
        status = resp["status"]["status"].native
    except Exception as ex:  # noqa: BLE001
        raise P7mError("Risposta non valida dal servizio di marca temporale.") from ex
    if status not in ("granted", "granted_with_mods"):
        txt = resp["status"]["status_string"].native
        raise P7mError(f"Marca temporale rifiutata dal servizio ({status}{': ' + ' '.join(txt) if txt else ''}).")
    token = resp["time_stamp_token"]
    info = token["content"]["encap_content_info"]["content"].parsed
    if info["message_imprint"]["hashed_message"].native != digest:
        raise P7mError("La marca temporale ricevuta non corrisponde alla firma.")
    if info["nonce"].native not in (None, nonce):
        raise P7mError("La marca temporale ricevuta non corrisponde alla richiesta.")
    return token


TST_OID = "1.2.840.113549.1.9.16.2.14"   # signatureTimeStampToken


def add_timestamp(data: bytes, fetch: Callable[[bytes], bytes]) -> tuple[bytes, int]:
    """Aggiunge la marca temporale (CAdES-T) a ogni firma della busta esterna.
    Restituisce (busta marcata in DER, numero di firme marcate). Le firme già marcate restano come sono."""
    ci = cms.ContentInfo.load(_decode_container(data))
    if ci["content_type"].native != "signed_data":
        raise P7mError("Il file non è una busta firmata (p7m).")
    sd = ci["content"]
    if sd["encap_content_info"]["content"].native is None:
        raise P7mError("È una firma separata (.p7s): la marca si mette sulla busta con il documento (.p7m).")
    done = 0
    for si in sd["signer_infos"]:
        attrs = si["unsigned_attrs"]
        current = [] if attrs.native is None else list(attrs)
        if any(a["type"].dotted == TST_OID for a in current):
            continue
        token = _request_token(si["signature"].native, fetch)
        current.append(cms.CMSAttribute({"type": "signature_time_stamp_token", "values": [token]}))
        si["unsigned_attrs"] = cms.CMSAttributes(current)
        done += 1
    if not done:
        raise P7mError("Tutte le firme di questo file hanno già una marca temporale.")
    return ci.dump(), done


def timestamp_file(src: Path, url: str, user: str = "", password: str = "") -> tuple[Path, int]:
    out, n = add_timestamp(src.read_bytes(), _http_tsa(url or DEFAULT_TSA, user, password))
    base = _strip_ext(src.name)
    dest = unique_path(src.with_name(f"{Path(base).stem} (marcato){Path(base).suffix}.p7m"))
    dest.write_bytes(out)
    return dest, n


# --------------------------------------------------------------------------- cifra (.p7e)

def load_certificate(raw: bytes) -> ax509.Certificate:
    """Certificato del destinatario: DER, PEM o Base64 (.cer, .crt, .pem, .der)."""
    if raw[:1] != b"\x30":
        txt = raw.decode("ascii", errors="ignore")
        m = re.search(r"-----BEGIN CERTIFICATE-----(.*?)-----END CERTIFICATE-----", txt, re.S)
        b64 = re.sub(r"\s+", "", m.group(1) if m else txt)
        try:
            raw = base64.b64decode(b64 + "=" * (-len(b64) % 4))
        except Exception as ex:  # noqa: BLE001
            raise P7mError("Il certificato del destinatario non è leggibile (serve un file .cer, .crt o .pem).") from ex
    try:
        cert = ax509.Certificate.load(raw)
        _ = cert.subject.native
        return cert
    except Exception as ex:  # noqa: BLE001
        raise P7mError("Il certificato del destinatario non è leggibile (serve un file .cer, .crt o .pem).") from ex


def cert_label(cert: ax509.Certificate) -> str:
    n = cert.subject.native
    return n.get("common_name") or n.get("organization_name") or n.get("email_address") or "destinatario"


def encrypt(data: bytes, certs: list[ax509.Certificate]) -> tuple[bytes, list[str]]:
    """Busta CMS EnvelopedData: contenuto cifrato AES-256-CBC, chiave cifrata con l'RSA di ogni destinatario
    (PKCS#1 v1.5, il formato letto da Dike, ArubaSign, GoSign, OpenSSL). Restituisce (DER, avvisi)."""
    from cryptography.hazmat.primitives import padding as sym_padding
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    if not certs:
        raise P7mError("Scegli almeno un certificato del destinatario.")
    warnings = []
    key, iv = os.urandom(32), os.urandom(16)
    padder = sym_padding.PKCS7(128).padder()
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = enc.update(padder.update(data) + padder.finalize()) + enc.finalize()
    recipients = []
    for c in certs:
        pub = serialization.load_der_public_key(c.public_key.dump())
        if not isinstance(pub, rsa.RSAPublicKey):
            raise P7mError(f"Il certificato di \"{cert_label(c)}\" non è RSA: non si può usare per cifrare.")
        ku = c.key_usage_value.native if c.key_usage_value else None
        if ku is not None and "key_encipherment" not in ku:
            warnings.append(f"Il certificato di \"{cert_label(c)}\" non è previsto per la cifratura (es. è solo di firma): "
                            "il destinatario potrebbe non riuscire ad aprire il file.")
        recipients.append(cms.RecipientInfo(name="ktri", value=cms.KeyTransRecipientInfo({
            "version": "v0",
            "rid": cms.RecipientIdentifier(name="issuer_and_serial_number", value=cms.IssuerAndSerialNumber({
                "issuer": c.issuer, "serial_number": c.serial_number})),
            "key_encryption_algorithm": {"algorithm": "rsaes_pkcs1v15"},
            "encrypted_key": pub.encrypt(key, asym_padding.PKCS1v15()),
        })))
    env = cms.EnvelopedData({
        "version": "v0",
        "recipient_infos": recipients,
        "encrypted_content_info": {
            "content_type": "data",
            "content_encryption_algorithm": {"algorithm": "aes256_cbc", "parameters": iv},
            "encrypted_content": ciphertext,
        },
    })
    return cms.ContentInfo({"content_type": "enveloped_data", "content": env}).dump(), warnings


def encrypt_file(src: Path, certs: list[ax509.Certificate]) -> tuple[Path, list[str]]:
    out, warnings = encrypt(src.read_bytes(), certs)
    dest = unique_path(src.with_name(src.name + ".p7e"))
    dest.write_bytes(out)
    return dest, warnings
