const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
})
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
})
const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
})

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => `${dateTimeFmt.format(new Date(iso))} WIB`
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
})
/** YYYYMMDDHHmm dalam WIB, untuk nomor referensi pemeriksaan. */
export function compactStamp(iso: string): string {
  const p = Object.fromEntries(stampFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}`
}
