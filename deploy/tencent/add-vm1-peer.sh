#!/usr/bin/env bash
# Di server Tencent: daftarkan VM1 sebagai peer WireGuard.
#   sudo bash deploy/tencent/add-vm1-peer.sh <kunci-publik-wg-VM1>
# Hanya alamat peer1 (192.168.56.11) yang dirutekan ke terowongan: backend cukup menghubungi gateway peer1.
set -euo pipefail
PUB="${1:?kunci publik WireGuard VM1 wajib diisi}"
PEER1_IP="${PEER1_IP:-192.168.56.11}"
CONF=/etc/wireguard/wg0.conf

sed -i '/^\[Peer\]/,$d' "$CONF"
cat >> "$CONF" <<EOF
[Peer]
# VM1 (unila-chain): menghubungi server ini dari NAT laptop; jaga koneksi dari sisi VM1 (PersistentKeepalive).
PublicKey = $PUB
AllowedIPs = $PEER1_IP/32
EOF
systemctl restart wg-quick@wg0
wg show wg0
