import { ApiError, isLedgerDown } from "./errors"

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
