export const C = {
  bg:       '#08111C',
  surf:     '#0F1E2E',
  surfHi:   '#162840',
  border:   '#1E3450',
  borderHi: '#2A4468',
  amber:    '#E8A020',
  amberBg:  '#2A1E08',
  red:      '#DC3545',
  redBg:    '#2A0810',
  green:    '#16A96B',
  greenBg:  '#082A1A',
  blue:     '#2D7DD2',
  blueBg:   '#081828',
  purple:   '#9B59B6',
  purpleBg: '#1A0828',
  teal:     '#0891B2',
  tealBg:   '#042830',
  text:     '#E8EEF4',
  dim:      '#7A9AB8',
  faint:    '#3A5470',
} as const

export const MIL_RANKS = ['BG','COL','LTC','MAJ','CPT','LTA','2LT','ME6','ME5','ME4','ME3','ME2','ME1','MSG','SSG','3SG','CFC','CPL','LCP','PTE','REC']
export const CIV_TITLES = ['Mr','Ms','Mdm','Dr']

export const GROUPS = [
  {id:0,name:'Office',    short:'OFC'},
  {id:1,name:'Civil',     short:'CIV'},
  {id:2,name:'Info',      short:'INF'},
  {id:3,name:'Current',   short:'CUR'},
  {id:4,name:'Logistics', short:'LOG'},
  {id:5,name:'Plans',     short:'PLN'},
]

export const STATUS_CATS = [
  {
    cat: 'Available',
    color: C.green,
    items: ['Present (Office)', 'Present (WFH)', 'External Meeting'],
  },
  {
    cat: 'Medical',
    color: C.red,
    items: ['Attend B', 'Attend C'],
  },
  {
    cat: 'Leave',
    color: C.amber,
    items: ['Local Leave', 'Overseas Leave', 'Time Off'],
    hasLeaveForm: true,
  },
  {
    cat: 'Official Duties',
    color: C.blue,
    items: ['Duty', 'Course', 'Exercise', 'Official Travel'],
  },
  {
    cat: 'Shift Work',
    color: C.teal,
    items: ['Day Shift', 'Night Shift', 'Rest Day'],
  },
  {
    cat: 'Others',
    color: C.dim,
    items: ['Attached Out', 'Other'],
  },
]

export const LEAVE_STATUSES    = ['Local Leave', 'Overseas Leave', 'Time Off']
export const AVAILABLE_STATUSES = ['Present (Office)', 'Present (WFH)', 'External Meeting', 'Day Shift']
export const DUTY_STATUSES      = ['Duty', 'Course', 'Exercise', 'Official Travel']
export const SHIFT_STATUSES     = ['Day Shift', 'Night Shift', 'Rest Day']

// Pre-reporting: after this hour (18 = 6pm), staff can submit for tomorrow
export const PRE_REPORT_HOUR = 18

export function statusColor(status: string): string {
  if (status === MALAYSIA_STATUS)        return C.teal
  if (status === PUBLIC_HOLIDAY_STATUS)  return C.green
  if (status === WEEKEND_STATUS)         return C.green
  for (const cat of STATUS_CATS) {
    if (cat.items.includes(status)) return cat.color
  }
  return C.dim
}

export function statusCat(status: string) {
  return STATUS_CATS.find(c => c.items.includes(status))
}

export function isLeaveStatus(status: string) {
  return LEAVE_STATUSES.includes(status)
}

export function isAvailableStatus(status: string) {
  return AVAILABLE_STATUSES.includes(status)
}

export const CUTOFF_HOUR   = parseInt(process.env.NEXT_PUBLIC_CUTOFF_HOUR   ?? '8')
export const CUTOFF_MINUTE = parseInt(process.env.NEXT_PUBLIC_CUTOFF_MINUTE ?? '30')

export function isPastCutoff(now = new Date()): boolean {
  return now.getHours() > CUTOFF_HOUR ||
    (now.getHours() === CUTOFF_HOUR && now.getMinutes() >= CUTOFF_MINUTE)
}

/** Returns today's date in SGT (UTC+8) as YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

/** Returns tomorrow's date in SGT as YYYY-MM-DD */
export function tomorrowStr(): string {
  return new Date(Date.now() + 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

export function nextWorkingDay(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function displayName(u: { personnel_type: string; rank?: string; title?: string; full_name: string } | null | undefined): string {
  if (!u) return ''
  return u.personnel_type === 'Military'
    ? `${u.rank} ${u.full_name}`
    : `${u.title} ${u.full_name}`
}

export function lastName(u: { full_name: string } | null | undefined): string {
  if (!u) return ''
  const parts = u.full_name.trim().split(' ')
  return parts[parts.length - 1]
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

export const MEDICAL_STATUSES       = ['Attend B', 'Attend C']
export const WEEKEND_STATUS         = 'Weekend'
export const PUBLIC_HOLIDAY_STATUS  = 'Public Holiday'
export const MALAYSIA_STATUS        = 'Malaysia Trip'
// All auto stand-down statuses (weekday staff exempt from reporting)
export const STANDDOWN_STATUSES     = [WEEKEND_STATUS, PUBLIC_HOLIDAY_STATUS, MALAYSIA_STATUS]

export function isWeekend(date = new Date()): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

// Singapore public holidays — update annually (mom.gov.sg)
export const SG_PUBLIC_HOLIDAYS: string[] = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-02-17', // CNY Day 1
  '2026-02-18', // CNY Day 2
  '2026-03-20', // Hari Raya Puasa (tentative)
  '2026-04-03', // Good Friday
  '2026-05-01', // Labour Day
  '2026-05-25', // Vesak Day (tentative)
  '2026-05-27', // Hari Raya Haji (tentative)
  '2026-08-09', // National Day (Sun — in-lieu Mon 10 Aug)
  '2026-08-10', // National Day in-lieu
  '2026-11-02', // Deepavali (tentative)
  '2026-12-25', // Christmas Day
  // 2027
  '2027-01-01', // New Year's Day (Fri)
  '2027-01-27', // CNY Day 1 (Wed — Year of Goat)
  '2027-01-28', // CNY Day 2 (Thu)
  '2027-03-09', // Hari Raya Puasa (tentative)
  '2027-03-26', // Good Friday (Easter Sun = 28 Mar)
  '2027-05-01', // Labour Day (Sat — in-lieu Mon 3 May)
  '2027-05-03', // Labour Day in-lieu
  '2027-05-10', // Vesak Day (tentative)
  '2027-05-17', // Hari Raya Haji (tentative)
  '2027-08-09', // National Day (Mon)
  '2027-10-29', // Deepavali (tentative)
  '2027-12-25', // Christmas Day (Sat — in-lieu Mon 27 Dec)
  '2027-12-27', // Christmas in-lieu
]

export function isPublicHoliday(date = new Date()): boolean {
  return SG_PUBLIC_HOLIDAYS.includes(date.toISOString().slice(0, 10))
}

/** Stand-down = weekend OR public holiday (for weekday-schedule staff only) */
export function isStandDown(date = new Date()): boolean {
  return isWeekend(date) || isPublicHoliday(date)
}

/** Human-readable label for the stand-down reason */
export function standDownLabel(date = new Date()): string {
  if (isPublicHoliday(date)) return 'Public Holiday'
  const day = date.getDay()
  return day === 6 ? 'Saturday' : 'Sunday'
}

/** Returns days remaining until medical_end_date (0 = today, negative = expired) */
export function medicalDaysRemaining(endDate: string): number {
  const today = new Date(todayStr())
  const end   = new Date(endDate)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

/** "Until 25 Jun · 3 days" or "Until 25 Jun · Expires today" or "Expired 2 days ago" */
export function medicalDurationLabel(endDate: string): string {
  const days = medicalDaysRemaining(endDate)
  const label = new Date(endDate + 'T00:00:00').toLocaleDateString('en-SG', { day:'2-digit', month:'short' })
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return `Until ${label} · Expires today`
  return `Until ${label} · ${days}d remaining`
}

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-SG', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  })
}

/** Short date with day of week — e.g. "Sat, 20 Jun" */
export function formatDateShort(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-SG', {
    weekday: 'short', day: '2-digit', month: 'short'
  })
}

/** Three-letter day abbreviation for a YYYY-MM-DD string */
export function dayOfWeek(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' })
}
