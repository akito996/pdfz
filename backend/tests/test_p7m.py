"""File firmati CAdES (.p7m/.p7s): apertura, estrazione, verifica, elenco CA."""
from __future__ import annotations

import datetime as dt
import logging
import sys
from pathlib import Path

import pymupdf
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_tools import client  # noqa: E402  (imposta le cartelle di prova)
from p7m_fixtures import NOW, PKI, dummy_timestamper, pdf_bytes, sign, sign_cades  # noqa: E402

from hdpdf import p7m  # noqa: E402

logging.getLogger("pyhanko").setLevel(logging.CRITICAL)
logging.getLogger("pyhanko_certvalidator").setLevel(logging.CRITICAL)


@pytest.fixture(scope="module")
def pki():
    k = PKI()
    p7m.set_trust_list_for_tests(k.tsl_xml())
    yield k
    p7m.set_trust_list_for_tests(None)


def upload(data: bytes, name: str) -> str:
    r = client.post("/api/assets", files={"file": (name, data)})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def analyze(data: bytes, name="contratto.pdf.p7m", expect=200, **kw) -> dict:
    r = client.post("/api/p7m/analyze", json={"asset": upload(data, name), "online": False, **kw})
    assert r.status_code == expect, r.text
    return r.json()


def signers(res: dict) -> list[dict]:
    return [s for e in res["report"]["envelopes"] for s in e["signers"]]


def test_tsl_parse(pki):
    parsed = p7m.parse_tsl(pki.tsl_xml())
    assert len(parsed["certs"]) == 1 and parsed["certs"][0]["provider"] == "Prova CA SpA"
    assert parsed["next_update"].startswith("2027")
    assert not p7m.parse_tsl(pki.tsl_xml(status="withdrawn"))["certs"]
    info = client.get("/api/p7m/trust").json()
    assert info["available"] and info["count"] == 1


def test_valid_pdf_extracted_and_opened(pki):
    data = pdf_bytes()
    k, c = pki.signer()
    res = analyze(sign(data, [(k, c, [pki.ca])]))
    assert res["report"]["verdict"] == "valid"
    s = signers(res)[0]
    assert s["cert"]["name"] == "Mario Rossi" and s["cert"]["fiscal_code"] == "RSSMRA80A01H501U"
    assert s["cert"]["qualified"] and s["cert"]["qscd"] and s["trusted"] and s["intact"]
    assert res["content"]["name"] == "contratto.pdf" and res["content"]["mime"] == "application/pdf"
    assert res["doc"]["pages"] == 1
    got = client.get(f"/api/items/{res['content']['id']}/file").content
    assert got == data


def test_multiple_nested_pem(pki):
    data = pdf_bytes()
    (k1, c1), (k2, c2) = pki.signer(), pki.signer("Anna", "Bianchi", "BNCNNA85M41F205X")
    res = analyze(sign(data, [(k1, c1, [pki.ca]), (k2, c2)]))
    assert sorted(s["cert"]["name"] for s in signers(res)) == ["Anna Bianchi", "Mario Rossi"]  # SET DER: ordine libero
    nested = sign(sign(data, [(k1, c1, [pki.ca])]), [(k2, c2, [pki.ca])])
    res = analyze(nested, "contratto.pdf.p7m.p7m")
    assert res["report"]["levels"] == 2 and res["report"]["verdict"] == "valid"
    assert res["content"]["name"] == "contratto.pdf"
    res = analyze(sign(data, [(k1, c1, [pki.ca])], pem=True))
    assert res["report"]["verdict"] == "valid"


def test_tampered_and_untrusted(pki):
    data = pdf_bytes()
    k, c = pki.signer()
    env = bytearray(sign(data, [(k, c, [pki.ca])]))
    env[env.find(b"%PDF") + 20] ^= 1
    res = analyze(bytes(env))
    assert res["report"]["verdict"] == "invalid" and not signers(res)[0]["intact"]
    other = PKI()  # CA che non è nell'elenco
    ko, co = other.signer()
    res = analyze(sign(data, [(ko, co, [other.ca])]))
    s = signers(res)[0]
    assert res["report"]["verdict"] == "warning" and s["intact"] and not s["trusted"]
    assert any("AgID" in w for w in s["warnings"])


def test_detached_p7s(pki):
    data = pdf_bytes()
    k, c = pki.signer()
    sig = sign(data, [(k, c, [pki.ca])], detached=True)
    analyze(sig, "contratto.pdf.p7s", expect=400)  # manca il documento
    res = analyze(sig, "contratto.pdf.p7s", detached=upload(data, "contratto.pdf"))
    assert res["report"]["verdict"] == "valid" and res["report"]["detached"]
    res = analyze(sig, "contratto.pdf.p7s", detached=upload(data + b"x", "contratto.pdf"))
    assert res["report"]["verdict"] == "invalid"


def test_expired_and_timestamp(pki):
    data = pdf_bytes()
    k, c = pki.signer(days_from=-400, days_to=-10)
    past = NOW - dt.timedelta(days=100)
    res = analyze(sign_cades(data, k, c, [pki.ca], signing_time=past))
    s = signers(res)[0]
    assert s["verdict"] == "warning" and s["checked_at_source"] == "data dichiarata della firma" and s["cades_bes"]
    res = analyze(sign_cades(data, k, c, [pki.ca], signing_time=past, timestamper=dummy_timestamper(pki, past)))
    s = signers(res)[0]
    assert s["verdict"] == "valid" and s["timestamp"]["trusted"] and s["checked_at_source"] == "marca temporale"
    res = analyze(sign(data, [(k, c, [pki.ca])]))  # firmato dopo la scadenza
    assert res["report"]["verdict"] == "invalid"


def test_non_pdf_content_and_errors(pki):
    k, c = pki.signer()
    res = analyze(sign(b"<?xml version='1.0'?><FatturaElettronica/>", [(k, c, [pki.ca])]), "IT0123_001.xml.p7m")
    assert res["content"]["name"] == "IT0123_001.xml" and "doc" not in res
    res = analyze(sign(b"testo semplice", [(k, c, [pki.ca])]), "nota.p7m")
    assert res["content"]["name"] == "nota"
    analyze(b"non sono una busta", "finto.p7m", expect=400)
    analyze(pdf_bytes(), "finto.pdf.p7m", expect=400)


def test_report_pdf(pki):
    k, c = pki.signer()
    res = analyze(sign(pdf_bytes(), [(k, c, [pki.ca])]))
    r = client.post("/api/p7m/report", json={"report": res["report"]})
    assert r.status_code == 200
    pdf = client.get(f"/api/items/{r.json()['id']}/file").content
    d = pymupdf.open(stream=pdf, filetype="pdf")
    text = d[0].get_text()
    assert "FIRMA VALIDA" in text and "Mario Rossi" in text and "RSSMRA80A01H501U" in text


def test_trust_upload_and_bundled(pki, tmp_path, monkeypatch):
    # elenco caricato a mano (o passato dall'app Android): viene installato e salvato in cache
    r = client.post("/api/p7m/trust/upload?source=online", content=pki.tsl_xml(), headers={"Content-Type": "application/xml"})
    assert r.status_code == 200, r.text
    assert r.json()["available"] and r.json()["source"] == "online"
    # un file qualsiasi viene rifiutato con un messaggio chiaro
    r = client.post("/api/p7m/trust/upload", content=b"<html>no</html>")
    assert r.status_code == 400 and "AgID" in r.json()["detail"]
    # senza cache e senza internet si usa la copia inclusa nell'app
    snap = tmp_path / "TSL-IT.xml"
    snap.write_bytes(pki.tsl_xml())
    monkeypatch.setenv("HDPDF_TSL_BUNDLED", str(snap))
    p7m.set_trust_list_for_tests(None)
    tl = p7m.trust_list(allow_download=False)
    assert tl.certs and tl.source == "app"
    p7m.set_trust_list_for_tests(pki.tsl_xml())


# ---------------------------------------------------------------- estrai, marca temporale, cifra (menu del tasto destro)

def test_extract_to_folder(pki, tmp_path):
    data = pdf_bytes()
    k, c = pki.signer()
    src = tmp_path / "contratto.pdf.p7m"
    src.write_bytes(sign(sign(data, [(k, c, [pki.ca])]), [(k, c, [pki.ca])], pem=True))   # busta annidata, PEM
    r = client.post("/api/p7m/extract", json={"path": str(src)})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "contratto.pdf" and (tmp_path / "contratto.pdf").read_bytes() == data
    r = client.post("/api/p7m/extract", json={"path": str(src)})          # non sovrascrive
    assert r.json()["name"] == "contratto (2).pdf"
    bad = tmp_path / "x.p7m"
    bad.write_bytes(b"non firmato")
    assert client.post("/api/p7m/extract", json={"path": str(bad)}).status_code == 400


def test_timestamp_cades_t(pki, tmp_path, monkeypatch):
    import asyncio
    from asn1crypto import tsp
    from hdpdf import p7m_tools
    data = pdf_bytes()
    k, c = pki.signer()
    ts = dummy_timestamper(pki)
    fetch = lambda b: asyncio.run(ts.async_request_tsa_response(tsp.TimeStampReq.load(b))).dump()  # noqa: E731
    monkeypatch.setattr(p7m_tools, "_http_tsa", lambda *a, **kw: fetch)
    src = tmp_path / "contratto.pdf.p7m"
    src.write_bytes(sign_cades(data, k, c, [pki.ca]))
    r = client.post("/api/p7m/timestamp", json={"path": str(src)})
    assert r.status_code == 200, r.text
    out = Path(r.json()["path"])
    assert out.name == "contratto (marcato).pdf.p7m" and r.json()["count"] == 1
    res = analyze(out.read_bytes())
    s = signers(res)[0]
    assert res["report"]["verdict"] == "valid" and s["intact"] and s["timestamp"]["trusted"]
    assert client.post("/api/p7m/timestamp", json={"path": str(out)}).status_code == 400   # già marcato


def test_encrypt_p7e(pki, tmp_path):
    import datetime as dt
    import shutil
    import subprocess
    from cryptography import x509 as cx
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec, rsa
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = cx.Name([cx.NameAttribute(cx.oid.NameOID.COMMON_NAME, "Ufficio Legale")])
    cert = (cx.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(7)
            .not_valid_before(NOW - dt.timedelta(days=1)).not_valid_after(NOW + dt.timedelta(days=30)).sign(key, hashes.SHA256()))
    k, c = pki.signer()
    data = sign(pdf_bytes(), [(k, c, [pki.ca])])
    src = tmp_path / "contratto.pdf.p7m"
    src.write_bytes(data)
    cid = upload(cert.public_bytes(serialization.Encoding.PEM), "ufficio.cer")
    r = client.post("/api/p7m/encrypt", json={"files": [{"path": str(src)}], "certs": [cid]})
    assert r.status_code == 200, r.text
    res = r.json()["results"][0]
    assert res["name"] == "contratto.pdf.p7m.p7e" and r.json()["recipients"] == ["Ufficio Legale"]
    if shutil.which("openssl"):
        (tmp_path / "k.pem").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                           serialization.NoEncryption()))
        (tmp_path / "c.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        dec = subprocess.run(["openssl", "cms", "-decrypt", "-inform", "DER", "-binary", "-in", res["path"],
                              "-recip", str(tmp_path / "c.pem"), "-inkey", str(tmp_path / "k.pem")], capture_output=True)
        assert dec.returncode == 0 and dec.stdout == data
    # certificato non RSA: errore chiaro
    eck = ec.generate_private_key(ec.SECP256R1())
    ecc = (cx.CertificateBuilder().subject_name(name).issuer_name(name).public_key(eck.public_key()).serial_number(8)
           .not_valid_before(NOW - dt.timedelta(days=1)).not_valid_after(NOW + dt.timedelta(days=30)).sign(eck, hashes.SHA256()))
    r = client.post("/api/p7m/encrypt", json={"files": [{"path": str(src)}], "certs": [upload(ecc.public_bytes(serialization.Encoding.DER), "ec.cer")]})
    assert r.status_code == 400 and "RSA" in r.json()["detail"]


def test_assets_from_paths(tmp_path):
    (tmp_path / "a.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    r = client.post("/api/assets/path", json={"paths": [str(tmp_path / "a.png"), str(tmp_path / "manca.jpg")]})
    assert r.status_code == 200 and [x["name"] for x in r.json()] == ["a.png"]
