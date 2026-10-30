"""PDFz - editor PDF open source che lavora in locale."""

# Nomi del prodotto: unica fonte per chi ne ha bisogno (cartelle dei dati, User-Agent, finestre, installer).
# Il pacchetto Python resta "hdpdf" (nome nel codice, come le variabili HDPDF_* e l'intestazione x-hdpdf-token).
APP_NAME = "PDFz"                   # nome visibile
APP_ID = "PDFz"                     # eseguibile, cartelle (%LOCALAPPDATA%\PDFz), classe della finestra su Linux
APP_AUTHOR = "agjin"                # autore ed editore (Manufacturer dell'MSI, chiave di registro Software\agjin)
APP_BUNDLE_ID = "com.agjin.pdfz"    # Android (applicationId), macOS e iPhone (bundle identifier)
# Versione: MAJOR.MINOR.PATCH (Semantic Versioning), es. 1.0.0, 1.0.1, 1.1.0. Fino alla 202610.015 era AAAAMM.NNN.
# PATCH per le correzioni, MINOR per le funzioni nuove, MAJOR per i cambiamenti grandi. Il tag git della release è uguale
# (es. 1.0.0 o v1.0.0): la pipeline di GitHub controlla che coincidano.
# È l'unica fonte del numero: installer Windows, APK Android, macOS e Linux lo leggono da qui (vedi versione.py).
__version__ = "1.5.0"


def _safe_localzone() -> None:
    """La firma digitale (pyhanko) chiede il fuso orario del PC a tzlocal. Nell'installer ci sono solo i fusi
    europei: se il PC ne usa un altro, invece di dare errore si usa l'ora locale con il suo scarto da UTC."""
    try:
        import tzlocal
    except Exception:  # noqa: BLE001 - tzlocal arriva con pyhanko; senza, non c'è niente da sistemare
        return
    if getattr(tzlocal.get_localzone, "_hdpdf", False):
        return
    original = tzlocal.get_localzone

    def get_localzone():
        try:
            return original()
        except Exception:  # noqa: BLE001
            import datetime as _dt
            return _dt.datetime.now().astimezone().tzinfo

    get_localzone._hdpdf = True
    tzlocal.get_localzone = get_localzone


_safe_localzone()
