export type Role = 'user' | 'commander' | 'admin'
export type PersonnelType = 'Military' | 'Civilian'
export type LeaveType = 'Local Leave' | 'Overseas Leave' | 'Time Off'
export type LeaveStatus = 'pending' | 'approved' | 'cancelled'

export interface Group {
  id: number
  name: string
  short_name: string
}

export interface User {
  id: string
  personnel_type: PersonnelType
  rank?: string | null
  title?: string | null
  full_name: string
  group_id: number
  appointment: string
  mobile: string
  email?: string | null
  role: Role
  is_active: boolean
  created_at: string
  // joined
  group?: Group
}

export interface DailySubmission {
  id: string
  user_id: string
  submission_date: string
  status: string
  remarks?: string
  submitted_at: string
  is_amended: boolean
  amend_reason?: string
  amended_at?: string
  is_auto: boolean
  auto_reason?: string
  // joined
  user?: User
}

export interface LeavePeriod {
  id: string
  user_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  country?: string
  city?: string
  contactable: boolean
  emergency_contact?: string
  remarks?: string
  status: LeaveStatus
  approved_by?: string
  created_at: string
  // joined
  user?: User
}

export interface GroupReview {
  id: string
  group_id: number
  review_date: string
  reviewed_by: string
  reviewed_at: string
  notes?: string
  // joined
  reviewer?: User
}

export interface AuditLog {
  id: string
  user_id?: string
  action: string
  table_name?: string
  record_id?: string
  old_value?: any
  new_value?: any
  created_at: string
  user?: User
}

export interface GroupStats {
  group_id: number
  group_name: string
  group_short: string
  strength: number
  reported: number
  pending: number
  available: number
  local_leave: number
  overseas_leave: number
  time_off: number
  attend_b: number
  attend_c: number
  duty: number
  reviewed: boolean
}

export type Database = {
  public: {
    Tables: {
      users:              { Row: User;             Insert: Partial<User>; Update: Partial<User> }
      daily_submissions:  { Row: DailySubmission;  Insert: Partial<DailySubmission>; Update: Partial<DailySubmission> }
      leave_periods:      { Row: LeavePeriod;      Insert: Partial<LeavePeriod>; Update: Partial<LeavePeriod> }
      group_reviews:      { Row: GroupReview;      Insert: Partial<GroupReview>; Update: Partial<GroupReview> }
      audit_log:          { Row: AuditLog;         Insert: Partial<AuditLog>; Update: Partial<AuditLog> }
      groups:             { Row: Group;            Insert: Partial<Group>; Update: Partial<Group> }
    }
  }
}
