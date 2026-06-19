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
  text:     '#E8EEF4',
  dim:      '#7A9AB8',
  faint:    '#3A5470',
} as const

export const MIL_RANKS = ['BG','COL','LTC','MAJ','CPT','LTA','2LT','ME6','ME5','ME4','ME3','ME2','ME1','MSG','SSG','3SG','CFC','CPL','LCP','PTE','REC']
export const CIV_TITLES = ['Mr','Ms','Mdm','Dr']

export const GROUPS = [
  {id:0,name:'AC3',    short:'AC3'},
  {id:1,name:'Current',short:'CUR'},
  {id:2,name:'Infor',  short:'INF'},
  {id:3,name:'Civil',  short:'CIV'},
  {id:4,name:'Log',    short:'LOG'},
  {id:5,name:'Plans',  short:'PLN'},
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
    cat: 'Others',
    color: C.dim,
    items: ['Attached Out', 'Other'],
  },
]

export const LEAVE_STATUSES = ['Local Leave', 'Overseas Leave', 'Time Off']
export const AVAILABLE_STATUSES = ['Present (Office)', 'Present (WFH)', 'External Meeting']
export const DUTY_STATUSES = ['Duty', 'Course', 'Exercise', 'Official Travel']

export function statusColor(status: string): string {
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

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function tomorrowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
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

export function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-SG', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}
