import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "./Button"

test("loading menonaktifkan tombol dan menandai sibuk", () => {
  render(<Button loading>Sahkan</Button>)
  const btn = screen.getByRole("button", { name: /Sahkan/ })
  expect(btn).toBeDisabled()
  expect(btn).toHaveAttribute("aria-busy", "true")
})

test("umpan balik tekan tanpa transition-all", () => {
  render(<Button>Sahkan</Button>)
  const cls = screen.getByRole("button").className
  expect(cls).toContain("active:scale-[0.97]")
  expect(cls).not.toContain("transition-all")
})

test("klik saat loading tidak memanggil handler", async () => {
  const onClick = vi.fn()
  render(
    <Button loading onClick={onClick}>
      Sahkan
    </Button>,
  )
  await userEvent.click(screen.getByRole("button"))
  expect(onClick).not.toHaveBeenCalled()
})

// Tailwind v4: scale-* memakai properti CSS `scale`, bukan `transform`.
test("transisi tekan mencakup properti scale", () => {
  render(<Button>Sahkan</Button>)
  expect(screen.getByRole("button").className).toMatch(/transition-\[[^\]]*\bscale\b/)
})
