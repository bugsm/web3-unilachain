import { act, fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function ui(open: boolean, onClose = vi.fn()) {
  return (
    <Modal open={open} onClose={onClose} title="Tinjau SKPI">
      isi
    </Modal>
  )
}

test("masuk, Escape menutup, dan tetap ter-mount selama transisi keluar", () => {
  const onClose = vi.fn()
  const { rerender } = render(ui(true, onClose))
  act(() => {
    vi.advanceTimersByTime(20)
  })
  const dialog = screen.getByRole("dialog", { name: "Tinjau SKPI" })
  expect(dialog).toHaveAttribute("data-state", "open")

  fireEvent.keyDown(window, { key: "Escape" })
  expect(onClose).toHaveBeenCalledTimes(1)

  rerender(ui(false, onClose))
  expect(screen.getByRole("dialog")).toHaveAttribute("data-state", "closed")
  act(() => {
    vi.advanceTimersByTime(150)
  })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("tertutup sejak awal tidak merender apa pun", () => {
  render(ui(false))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("panel modal menganimasikan properti scale (Tailwind v4)", () => {
  render(ui(true))
  expect(screen.getByRole("dialog").className).toMatch(/transition-\[[^\]]*\bscale\b/)
})
