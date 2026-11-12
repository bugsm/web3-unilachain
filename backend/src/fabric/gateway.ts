/*
 * Implementasi Ledger di atas @hyperledger/fabric-gateway. Satu koneksi gRPC ke gateway peer; satu Gateway per
 * identitas wallet (dibuat saat pertama dipakai). Isi kunci dan sertifikat tidak pernah ditulis ke log.
 */
import { createPrivateKey } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import * as grpc from "@grpc/grpc-js"
import { GatewayError, StatusCode, connect, hash, signers, type Gateway } from "@hyperledger/fabric-gateway"
import { common, peer } from "@hyperledger/fabric-protos"
import type { Config } from "../config.js"
import { LedgerError, type Ledger } from "./ledger.js"

const UNREACHABLE = new Set([grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED, grpc.status.CANCELLED])
const decoder = new TextDecoder()
const STATUS_NAME = Object.fromEntries(Object.entries(StatusCode).map(([k, v]) => [v, k])) as Record<number, string>

/** Tahap transaksi saat galat terjadi: menentukan apakah transaksi mungkin sudah tercatat. */
type Stage = "endorse" | "submit" | "commit"

const CHAINCODE = /chaincode response \d+, |transaction returned with failure: /
const REMOTE_UNREACHABLE = /code = (Unavailable|DeadlineExceeded|Canceled)|connection refused|connection error|no route to host|i\/o timeout/i

/** Pesan chaincode dari detail galat ("chaincode response 500, <pesan>") atau dari pesan galat itu sendiri. */
export function chaincodeMessage(e: GatewayError): string {
  const raw = e.details.find((d) => d.message)?.message ?? e.message
  return raw.replace(/^.*?chaincode response \d+, /s, "").replace(/^.*?transaction returned with failure: /s, "").trim()
}

/**
 * Klasifikasi galat gateway. Hanya teks yang benar-benar berasal dari chaincode yang diteruskan ke klien (REJECTED);
 * endorser lain yang tak terjangkau (policy AND kedua peer) menjadi UNAVAILABLE; sisanya ERROR (502, rincian di log).
 */
export function classifyGatewayError(e: unknown, stage: Stage = "endorse", txId?: string): LedgerError {
  if (e instanceof LedgerError) return e
  // Menunggu status commit gagal: transaksi sudah di orderer, hasilnya belum diketahui.
  if (stage === "commit") return new LedgerError("COMMIT_UNKNOWN", e instanceof Error ? e.message : String(e), txId)
  if (stage === "submit") {
    // Orderer menolak dengan jelas → tidak tercatat; batas waktu/putus → mungkin tercatat.
    const code = e instanceof GatewayError ? e.code : grpc.status.UNKNOWN
    return UNREACHABLE.has(code)
      ? new LedgerError("COMMIT_UNKNOWN", (e as Error).message, txId)
      : new LedgerError("UNAVAILABLE", (e as Error).message)
  }
  if (e instanceof GatewayError) {
    const texts = [e.message, ...e.details.map((d) => d.message)]
    if (UNREACHABLE.has(e.code)) return new LedgerError("UNAVAILABLE", e.message)
    if (texts.some((t) => CHAINCODE.test(t))) return new LedgerError("REJECTED", chaincodeMessage(e))
    const all = texts.join(" | ")
    if (REMOTE_UNREACHABLE.test(all)) return new LedgerError("UNAVAILABLE", all)
    return new LedgerError("ERROR", all)
  }
  return new LedgerError("UNAVAILABLE", e instanceof Error ? e.message : String(e))
}

export async function createFabricLedger(cfg: Config["fabric"]): Promise<Ledger> {
  const tlsCa = await readFile(cfg.tlsCaPath)
  const client = new grpc.Client(cfg.peerEndpoint, grpc.credentials.createSsl(tlsCa), {
    "grpc.ssl_target_name_override": cfg.peerHostAlias,
  })
  const gateways = new Map<string, Promise<Gateway>>()
  const deadline = (ms: number) => () => ({ deadline: Date.now() + ms })

  async function open(identity: string): Promise<Gateway> {
    if (!/^[a-z0-9-]+$/.test(identity)) throw new LedgerError("REJECTED", "Identitas tidak valid")
    const dir = path.join(cfg.walletDir, identity)
    const [credentials, keyPem] = await Promise.all([readFile(path.join(dir, "cert.pem")), readFile(path.join(dir, "key.pem"))]).catch(() => {
      throw new LedgerError("UNAVAILABLE", `Identitas ${identity} tidak tersedia di wallet`)
    })
    return connect({
      client,
      identity: { mspId: cfg.mspId, credentials },
      signer: signers.newPrivateKeySigner(createPrivateKey(keyPem)),
      hash: hash.sha256,
      evaluateOptions: deadline(cfg.timeouts.evaluateMs),
      endorseOptions: deadline(cfg.timeouts.endorseMs),
      submitOptions: deadline(cfg.timeouts.submitMs),
      commitStatusOptions: deadline(cfg.timeouts.commitMs),
    })
  }

  function gateway(identity: string): Promise<Gateway> {
    let g = gateways.get(identity)
    if (!g) {
      g = open(identity)
      gateways.set(identity, g)
      g.catch(() => gateways.delete(identity))
    }
    return g
  }

  const network = async (identity: string) => (await gateway(identity)).getNetwork(cfg.channel)

  async function qscc(fn: string, args: string[]): Promise<Uint8Array> {
    try {
      return await (await network(cfg.readerIdentity)).getContract("qscc").evaluateTransaction(fn, cfg.channel, ...args)
    } catch (e) {
      throw classifyGatewayError(e)
    }
  }

  return {
    async submit(identity, fn, args, onSubmitting) {
      let txId: string | undefined
      let stage: Stage = "endorse"
      try {
        const contract = (await network(identity)).getContract(cfg.chaincode)
        const proposal = contract.newProposal(fn, { arguments: args })
        txId = proposal.getTransactionId()
        const tx = await proposal.endorse()
        await onSubmitting?.(txId)
        stage = "submit"
        const commit = await tx.submit()
        stage = "commit"
        const status = await commit.getStatus()
        if (!status.successful) {
          const name = STATUS_NAME[status.code] ?? String(status.code)
          // Konflik MVCC dapat diulang pengguna (409); kode validasi lain adalah galat ledger (502, rincian di log).
          throw new LedgerError(/MVCC|PHANTOM/.test(name) ? "REJECTED" : "ERROR", `Transaksi tidak valid: ${name}`)
        }
        return { txId, result: decoder.decode(tx.getResult()) }
      } catch (e) {
        throw classifyGatewayError(e, stage, txId)
      }
    },

    async evaluate(identity, fn, args) {
      try {
        const contract = (await network(identity)).getContract(cfg.chaincode)
        return decoder.decode(await contract.evaluateTransaction(fn, ...args))
      } catch (e) {
        throw classifyGatewayError(e)
      }
    },

    async chainHeight() {
      return common.BlockchainInfo.deserializeBinary(await qscc("GetChainInfo", [])).getHeight()
    },

    async txStatus(txId) {
      try {
        const bytes = await qscc("GetTransactionByID", [txId])
        const code = peer.ProcessedTransaction.deserializeBinary(bytes).getValidationcode()
        return code === peer.TxValidationCode.VALID ? "COMMITTED" : "INVALID"
      } catch (e) {
        // Transaksi tidak ada di ledger (belum/never committed) → belum pasti; peer mati → lempar.
        if (e instanceof LedgerError && (e.kind === "REJECTED" || e.kind === "ERROR")) return "UNKNOWN"
        throw e
      }
    },

    async close() {
      for (const g of gateways.values()) (await g.catch(() => null))?.close()
      gateways.clear()
      client.close()
    },
  }
}
