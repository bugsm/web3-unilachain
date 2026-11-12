#!/usr/bin/env bash
# Salin identitas Fabric yang dipakai backend dari VM-1 ke ./wallet (tidak masuk Git).
#
#   scripts/fetch-wallet.sh skpi@192.168.56.11 [path-repo-onchain-di-vm1] [DOMAIN]
#
# Hasil:
#   wallet/tls-ca.pem                      CA TLS UnilaMSP (verifikasi sertifikat peer)
#   wallet/<label>/cert.pem, key.pem       app-reader, rektor, dan dekan-<fakultas> dari network/pengesah.conf
# Kunci privat dibuat hanya-baca pemilik. Isi berkas tidak pernah dicetak.
set -euo pipefail

VM1="${1:?Contoh: scripts/fetch-wallet.sh skpi@192.168.56.11}"
REMOTE_REPO="${2:-~/unila-chain}"
DOMAIN="${3:-unila.local}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WALLET="$HERE/wallet"
ORG="$REMOTE_REPO/organizations/unila"

LABELS=(app-reader rektor dekan-feb dekan-fh dekan-fkip dekan-fp dekan-ft dekan-fisip dekan-fmipa dekan-fk)

mkdir -p "$WALLET"
chmod 700 "$WALLET"
umask 077

echo "CA TLS"
scp -q "$VM1:$ORG/msp/tlscacerts/ca.crt" "$WALLET/tls-ca.pem"

for label in "${LABELS[@]}"; do
  msp="$ORG/users/$label@$DOMAIN/msp"
  mkdir -p "$WALLET/$label"
  # Satu sertifikat & satu kunci per identitas (enroll.sh); nama berkas kunci acak (*_sk).
  if ! scp -q "$VM1:$msp/signcerts/cert.pem" "$WALLET/$label/cert.pem"; then
    echo "  $label: tidak ditemukan di VM-1 (dilewati)"
    rmdir "$WALLET/$label" 2>/dev/null || true
    continue
  fi
  ssh "$VM1" "cat $msp/keystore/*_sk" > "$WALLET/$label/key.pem"
  chmod 600 "$WALLET/$label/key.pem"
  echo "  $label"
done

echo "Selesai: $WALLET"
