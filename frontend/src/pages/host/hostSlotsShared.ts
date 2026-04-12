/** 이번 달 1일 ~ 말일 (YYYY-MM-DD) */
export function defaultSlotRange() {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth() + 1
  const pad = (x: number) => String(x).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${y}-${pad(m)}-${pad(last)}`
  return { from, to }
}

export function slotStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return '예약 가능'
    case 'BOOKED':
      return '예약됨'
    case 'BLOCKED':
      return '차단됨'
    default:
      return status
  }
}
