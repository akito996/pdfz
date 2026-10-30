#!/usr/bin/env bash
# Scrive in backend/hdpdf/aggiornamenti.py l'indirizzo degli aggiornamenti (UPDATE_BASE_URL), prima della build.
# Lo usa la pipeline di GitHub (.github/workflows/release.yml: variabile UPDATE_BASE_URL del repository, altrimenti
# le GitHub Releases del repository); funziona con il sed di Linux, macOS e Git Bash.
#   UPDATE_BASE_URL=https://github.com/akito996/pdfz/releases/latest/download/ bash packaging/imposta-url-aggiornamenti.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${UPDATE_BASE_URL:?manca UPDATE_BASE_URL (es. https://github.com/akito996/pdfz/releases/latest/download/)}"
url="$UPDATE_BASE_URL"
case "$url" in
  https://*) ;;
  *://*) echo "UPDATE_BASE_URL deve usare https:// (c'e' '$url')" >&2; exit 1 ;;
  *) url="https://$url" ;;   # scritta senza https:// (es. pdfz.agjin.com): si aggiunge
esac
# caratteri che romperebbero il sed qui sotto o la stringa Python: non servono in un indirizzo di download
case "$url" in
  *[[:space:]\"\'\\#\&\|]*) echo "UPDATE_BASE_URL contiene caratteri non ammessi: '$url'" >&2; exit 1 ;;
esac
case "$url" in
  */) ;;
  *) url="$url/" ;;   # cartella: serve la "/" finale (l'app aggiunge versione-<piattaforma>.json e il nome del file)
esac
f=backend/hdpdf/aggiornamenti.py
sed -i.bak "s#^UPDATE_BASE_URL = \"\"#UPDATE_BASE_URL = \"$url\"#" "$f"
rm -f "$f.bak"
grep -qxF "UPDATE_BASE_URL = \"$url\"" "$f" || { echo "UPDATE_BASE_URL non impostato in $f" >&2; exit 1; }
echo "Avviso aggiornamenti: $url"
