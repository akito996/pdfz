"""Certificati e buste CAdES di prova (CA radice, CA intermedia "qualificata", firmatari)."""
from __future__ import annotations

import base64
import datetime as dt

from cryptography import x509 as cx509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID, ObjectIdentifier

NOW = dt.datetime.now(dt.timezone.utc)
QC_STATEMENTS = ObjectIdentifier("1.3.6.1.5.5.7.1.3")
# SEQUENCE { SEQUENCE { QcCompliance } SEQUENCE { QcSSCD } }
QC_VALUE = bytes.fromhex("3014" "3008060604008e460101" "3008060604008e460104")


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _name(cn, **extra):
    attrs = [cx509.NameAttribute(NameOID.COUNTRY_NAME, "IT"), cx509.NameAttribute(NameOID.COMMON_NAME, cn)]
    for oid, v in extra.items():
        attrs.append(cx509.NameAttribute(getattr(NameOID, oid), v))
    return cx509.Name(attrs)


def _cert(subject, issuer, key, issuer_key, ca=False, days_from=-30, days_to=365, qc=False, nonrep=True):
    b = (cx509.CertificateBuilder().subject_name(subject).issuer_name(issuer).public_key(key.public_key())
         .serial_number(cx509.random_serial_number())
         .not_valid_before(NOW + dt.timedelta(days=days_from)).not_valid_after(NOW + dt.timedelta(days=days_to))
         .add_extension(cx509.BasicConstraints(ca=ca, path_length=None), critical=True)
         .add_extension(cx509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
         .add_extension(cx509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_key.public_key()), critical=False))
    if ca:
        b = b.add_extension(cx509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False,
                                           data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                           crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
    else:
        b = b.add_extension(cx509.KeyUsage(digital_signature=not nonrep, content_commitment=nonrep, key_encipherment=False,
                                           data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                           crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
    if qc:
        b = b.add_extension(cx509.UnrecognizedExtension(QC_STATEMENTS, QC_VALUE), critical=False)
    return b.sign(issuer_key, hashes.SHA256())


class PKI:
    def __init__(self):
        self.root_key = _key()
        self.root = _cert(_name("Prova Root CA", ORGANIZATION_NAME="Prova CA SpA"), _name("Prova Root CA", ORGANIZATION_NAME="Prova CA SpA"),
                          self.root_key, self.root_key, ca=True, days_to=3650)
        self.ca_key = _key()
        self.ca_subject = _name("Prova Qualified CA", ORGANIZATION_NAME="Prova CA SpA")
        self.ca = _cert(self.ca_subject, self.root.subject, self.ca_key, self.root_key, ca=True, days_to=3000)

    def signer(self, given="Mario", surname="Rossi", cf="RSSMRA80A01H501U", **kw):
        key = _key()
        subj = cx509.Name([
            cx509.NameAttribute(NameOID.COUNTRY_NAME, "IT"),
            cx509.NameAttribute(NameOID.GIVEN_NAME, given),
            cx509.NameAttribute(NameOID.SURNAME, surname),
            cx509.NameAttribute(NameOID.SERIAL_NUMBER, f"TINIT-{cf}"),
            cx509.NameAttribute(NameOID.COMMON_NAME, f"{given} {surname}"),
        ])
        kw.setdefault("qc", True)
        return key, _cert(subj, self.ca_subject, key, self.ca_key, **kw)

    def tsl_xml(self, include_ca=True, status="granted") -> bytes:
        cert_b64 = base64.b64encode(self.ca.public_bytes(serialization.Encoding.DER)).decode()
        svc = f"""
        <TSPService><ServiceInformation>
          <ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/CA/QC</ServiceTypeIdentifier>
          <ServiceName><Name xml:lang="it">Prova Qualified CA</Name></ServiceName>
          <ServiceDigitalIdentity><DigitalId><X509Certificate>{cert_b64}</X509Certificate></DigitalId></ServiceDigitalIdentity>
          <ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/{status}</ServiceStatus>
        </ServiceInformation></TSPService>""" if include_ca else ""
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#">
  <SchemeInformation>
    <ListIssueDateTime>2026-09-01T00:00:00Z</ListIssueDateTime>
    <NextUpdate><dateTime>2027-03-01T00:00:00Z</dateTime></NextUpdate>
  </SchemeInformation>
  <TrustServiceProviderList><TrustServiceProvider>
    <TSPInformation><TSPName><Name xml:lang="it">Prova CA SpA</Name></TSPName></TSPInformation>
    <TSPServices>{svc}</TSPServices>
  </TrustServiceProvider></TrustServiceProviderList>
</TrustServiceStatusList>""".encode()


def sign(data: bytes, signers, detached=False, pem=False) -> bytes:
    """signers: lista di (chiave, certificato, ca_extra)."""
    b = pkcs7.PKCS7SignatureBuilder().set_data(data)
    extra = []
    for key, cert, *rest in signers:
        b = b.add_signer(cert, key, hashes.SHA256())
        extra += rest[0] if rest else []
    for c in extra:
        b = b.add_certificate(c)
    opts = [pkcs7.PKCS7Options.Binary]
    if detached:
        opts.append(pkcs7.PKCS7Options.DetachedSignature)
    return b.sign(serialization.Encoding.PEM if pem else serialization.Encoding.DER, opts)


def pdf_bytes(text="Contratto di prova") -> bytes:
    import pymupdf
    d = pymupdf.open()
    d.new_page().insert_text((72, 72), text)
    out = d.tobytes()
    d.close()
    return out


def _asn1(cert):
    from asn1crypto import x509 as ax
    return ax.Certificate.load(cert.public_bytes(serialization.Encoding.DER))


def _asn1_key(key):
    from asn1crypto import keys
    return keys.PrivateKeyInfo.load(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
                                                      serialization.NoEncryption()))


def tsa(pki: PKI):
    """Autorità di marca temporale emessa dalla CA di prova."""
    key = _key()
    subj = _name("Prova TSA", ORGANIZATION_NAME="Prova CA SpA")
    b = (cx509.CertificateBuilder().subject_name(subj).issuer_name(pki.ca_subject).public_key(key.public_key())
         .serial_number(cx509.random_serial_number())
         .not_valid_before(NOW - dt.timedelta(days=900)).not_valid_after(NOW + dt.timedelta(days=900))
         .add_extension(cx509.ExtendedKeyUsage([cx509.oid.ExtendedKeyUsageOID.TIME_STAMPING]), critical=True))
    return key, b.sign(pki.ca_key, hashes.SHA256())


def sign_cades(data: bytes, key, cert, chain, signing_time=None, timestamper=None) -> bytes:
    """Busta CAdES-BES/T con pyHanko (signing-certificate-v2, data di firma scelta, marca opzionale)."""
    import asyncio
    from pyhanko.sign import signers
    from pyhanko.sign.signers.pdf_cms import PdfCMSSignedAttributes
    from pyhanko_certvalidator.registry import SimpleCertificateStore

    signer = signers.SimpleSigner(signing_cert=_asn1(cert), signing_key=_asn1_key(key),
                                  cert_registry=SimpleCertificateStore.from_certs([_asn1(c) for c in chain]))
    attrs = PdfCMSSignedAttributes(signing_time=signing_time) if signing_time else None
    ci = asyncio.run(signer.async_sign_general_data(data, "sha256", detached=False, use_cades=True,
                                                    timestamper=timestamper, signed_attr_settings=attrs))
    return ci.dump()


def dummy_timestamper(pki: PKI, at=None):
    from pyhanko.sign.timestamps import DummyTimeStamper
    k, c = tsa(pki)
    return DummyTimeStamper(tsa_cert=_asn1(c), tsa_key=_asn1_key(k), certs_to_embed=None, fixed_dt=at)
