#!/usr/bin/env bash
# Di VM1 (unila-chain): klien WireGuard ke server aplikasi Tencent.
#   sudo bash vm1-wireguard.sh <IP-publik-server> <kunci-publik-wg-server>
# Koneksi keluar lewat adapter NAT VM (bisa dari WiFi rumah, kampus, atau hotspot); tidak perlu port forwarding.
# Paket dari server datang dengan alamat 192.168.56.100 (di dalam ALLOWED_SUBNET), jadi firewall Fabric tidak diubah.
# Aman dijalankan ulang; mencetak kunci publik VM1 untuk add-vm1-peer.sh di server.
set -euo pipefail
SERVER_IP="${1:?IP publik server wajib diisi}"
SERVER_PUB="${2:?kunci publik WireGuard server wajib diisi}"
WG_PORT="${WG_PORT:-51820}"
APP_WG_ADDR="${APP_WG_ADDR:-192.168.56.100}"

apt-get update -qq && apt-get install -y -qq wireguard >/dev/null
umask 077
mkdir -p /etc/wireguard
[ -f /etc/wireguard/vm1.key ] || wg genkey > /etc/wireguard/vm1.key
wg pubkey < /etc/wireguard/vm1.key > /etc/wireguard/vm1.pub

# Tanpa Address: wg0 hanya membawa balasan peer1 (192.168.56.11) ke server aplikasi.
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
PostUp = wg set %i private-key /etc/wireguard/vm1.key

[Peer]
PublicKey = $SERVER_PUB
Endpoint = $SERVER_IP:$WG_PORT
AllowedIPs = $APP_WG_ADDR/32
PersistentKeepalive = 25
EOF
systemctl enable wg-quick@wg0 >/dev/null 2>&1
systemctl restart wg-quick@wg0

echo "Kunci publik WireGuard VM1 (untuk add-vm1-peer.sh di server):"
cat /etc/wireguard/vm1.pub
