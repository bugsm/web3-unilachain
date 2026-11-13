-- Up Migration
-- Pengesahan massal lewat chaincode batch (SahkanDekanBatch/SahkanRektorBatch): SATU transaksi ledger mencakup banyak SKPI.
-- ledger_tx menjadi satu baris per (transaksi, NPM) supaya pencatatan, rekonsiliasi, dan pelepasan draft tetap per SKPI.
-- Transaksi tunggal tidak berubah: satu baris dengan NPM-nya.

ALTER TABLE ledger_tx DROP CONSTRAINT ledger_tx_pkey;
ALTER TABLE ledger_tx ADD CONSTRAINT ledger_tx_pkey PRIMARY KEY (tx_id, npm);

-- Down Migration
-- Hanya dapat dibatalkan bila tidak ada transaksi batch (satu tx_id untuk banyak NPM).
ALTER TABLE ledger_tx DROP CONSTRAINT ledger_tx_pkey;
ALTER TABLE ledger_tx ADD CONSTRAINT ledger_tx_pkey PRIMARY KEY (tx_id);
