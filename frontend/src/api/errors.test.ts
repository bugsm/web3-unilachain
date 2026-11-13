import { ApiError, isLedgerDown, userMessage } from "./errors"

test.each([
  [new ApiError(503, "UNAVAILABLE", "x"), true],
  [new ApiError(502, "UNAVAILABLE", "x"), true],
  [new ApiError(0, "NETWORK", "x"), true],
  [new ApiError(429, "RATE_LIMITED", "x"), false],
  [new ApiError(404, "NOT_FOUND", "x"), false],
  [new ApiError(401, "UNAUTHENTICATED", "x"), false],
  [new Error("x"), false],
  [undefined, false],
])("isLedgerDown(%o) = %s", (e, expected) => {
  expect(isLedgerDown(e)).toBe(expected)
})

test("status commit belum pasti tidak disebut 'ledger tidak terjangkau': transaksi mungkin sudah tercatat", () => {
  const e = new ApiError(503, "COMMIT_UNKNOWN", "Status transaksi belum pasti; sistem akan memeriksanya kembali.")
  expect(userMessage(e)).toBe("Status transaksi belum pasti; sistem sedang memastikannya di ledger.")
  expect(isLedgerDown(e)).toBe(false)
  expect(userMessage(new ApiError(503, "UNAVAILABLE", "x"))).toBe("Layanan ledger sedang tidak terjangkau.")
})
