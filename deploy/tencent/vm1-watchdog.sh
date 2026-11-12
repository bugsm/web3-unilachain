#!/usr/bin/env bash
# Di VM1 (unila-chain): pengawas terowongan WireGuard.
#   sudo bash vm1-watchdog.sh
# VM di balik NAT laptop bisa kehilangan terowongan saat jaringan berpindah (WiFi/hotspot) atau laptop tidur; wg0 baru pulih
# setelah di-restart. Setiap 30 detik pengawas memeriksa umur handshake terakhir; bila lebih dari 180 detik (keepalive 25 detik
# seharusnya memperbarui handshake tiap ~2 menit), wg-quick@wg0 di-restart. Aman dijalankan ulang.
set -euo pipefail

cat > /usr/local/sbin/wg-watchdog <<'WD'
#!/bin/sh
IF=wg0
MAX="${MAX:-180}"
last=$(wg show "$IF" latest-handshakes 2>/dev/null | awk '{print $2; exit}')
now=$(date +%s)
if [ -z "$last" ] || [ "$last" -eq 0 ] || [ $((now - last)) -gt "$MAX" ]; then
  logger -t wg-watchdog "handshake basi (terakhir: ${last:-tidak ada}); restart $IF"
  systemctl restart "wg-quick@$IF"
fi
WD
chmod 755 /usr/local/sbin/wg-watchdog

cat > /etc/systemd/system/wg-watchdog.service <<'UNIT'
[Unit]
Description=Pulihkan terowongan WireGuard bila handshake basi

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/wg-watchdog
UNIT

cat > /etc/systemd/system/wg-watchdog.timer <<'UNIT'
[Unit]
Description=Periksa terowongan WireGuard tiap 30 detik

[Timer]
OnBootSec=60
OnUnitActiveSec=30
AccuracySec=5

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now wg-watchdog.timer >/dev/null
echo "Pengawas aktif. Log: journalctl -t wg-watchdog"
systemctl list-timers wg-watchdog.timer --no-pager | head -3
