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
