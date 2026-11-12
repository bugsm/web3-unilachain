#!/usr/bin/env bash
# Persiapan server aplikasi (Tencent Cloud Lighthouse, Ubuntu 24.04). Dijalankan sekali sebagai user dengan sudo:
#   sudo bash deploy/tencent/server-setup.sh
# Memasang Docker + WireGuard + ufw dan menyiapkan wg0 (server terowongan ke VM1). Aman dijalankan ulang.
#
# Alamat WireGuard server = 192.168.56.100, di dalam subnet riset 192.168.56.0/24, sehingga firewall VM
# (ufw + DOCKER-USER, ALLOWED_SUBNET) menerimanya tanpa mengubah konfigurasi unila-chain.
set -euo pipefail

WG_ADDR="${WG_ADDR:-192.168.56.100}"
WG_PORT="${WG_PORT:-51820}"
PEER1_IP="${PEER1_IP:-192.168.56.11}"

echo "== Paket"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw wireguard >/dev/null

if ! command -v docker >/dev/null; then
  echo "== Docker (repositori resmi)"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
usermod -aG docker "${SUDO_USER:-ubuntu}"

echo "== Swap 2 GB (build image di RAM 2 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== WireGuard wg0"
umask 077
mkdir -p /etc/wireguard
[ -f /etc/wireguard/server.key ] || wg genkey > /etc/wireguard/server.key
wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
if [ ! -f /etc/wireguard/wg0.conf ]; then
  cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = $WG_ADDR/32
ListenPort = $WG_PORT
PostUp = wg set %i private-key /etc/wireguard/server.key
# [Peer] VM1 ditambahkan oleh add-vm1-peer.sh
EOF
fi
systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 || true

echo "== Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw allow "$WG_PORT/udp" >/dev/null
ufw --force enable >/dev/null

echo
echo "Selesai. Kunci publik WireGuard server (untuk VM1):"
cat /etc/wireguard/server.pub
echo "Peer1 yang akan dijangkau: $PEER1_IP:7051 lewat wg0"
