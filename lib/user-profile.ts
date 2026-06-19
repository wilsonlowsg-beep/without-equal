import type { User as AuthUser, Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database, User } from '@/types/database'

type Client = SupabaseClient<Database>

const authLog = (step: string, payload?: unknown) => {
  console.info(`[auth] ${step}`, payload ?? '')
}

const profileSelect = '*, group:groups(*)'

function defaultProfileFor(authUser: AuthUser): Database['public']['Tables']['users']['Insert'] {
  const emailName = authUser.email?.split('@')[0]
  const fullName =
    (authUser.user_metadata?.full_name as string | undefined) ||
    (authUser.user_metadata?.name as string | undefined) ||
    emailName ||
    'Pending Profile'

  return {
    id: authUser.id,
    personnel_type: 'Military',
    rank: null,
    title: null,
    full_name: fullName,
    group_id: 1,
    appointment: 'Pending onboarding',
    mobile: authUser.phone || `auth-${authUser.id.slice(0, 8)}`,
    role: 'personnel',
    is_active: true,
  }
}

async function fetchProfile(supabase: Client, userId: string, context: string) {
  const result = await supabase
    .from('users')
    .select(profileSelect)
    .eq('id', userId)
    .maybeSingle()

  authLog(`${context}: users profile query`, {
    userId,
    hasProfile: Boolean(result.data),
    error: result.error,
  })

  return result
}

export async function loadOrCreateUserProfile(
  supabase: Client,
  authUser: AuthUser,
  context = 'auth'
): Promise<{ user: User | null; error: string | null }> {
  const initial = await fetchProfile(supabase, authUser.id, context)
  if (initial.error) return { user: null, error: initial.error.message }
  if (initial.data) return { user: initial.data as User, error: null }

  const profile = defaultProfileFor(authUser)
  authLog(`${context}: profile missing; creating default profile`, profile)

  let insert = await supabase
    .from('users')
    .upsert(profile, { onConflict: 'id', ignoreDuplicates: true })
    .select(profileSelect)
    .maybeSingle()

  if (insert.error && /column .* does not exist/i.test(insert.error.message)) {
    const minimalProfile = {
      id: authUser.id,
      personnel_type: profile.personnel_type,
      rank: profile.rank,
      title: profile.title,
      full_name: profile.full_name,
      group_id: profile.group_id,
    }

    authLog(`${context}: retrying profile create with minimal deployed schema`, insert.error)
    insert = await supabase
      .from('users')
      .upsert(minimalProfile, { onConflict: 'id', ignoreDuplicates: true })
      .select(profileSelect)
      .maybeSingle()
  }

  authLog(`${context}: profile create result`, {
    hasProfile: Boolean(insert.data),
    error: insert.error,
  })

  if (insert.error && insert.error.code !== '23505') return { user: null, error: insert.error.message }
  if (insert.data) return { user: insert.data as User, error: null }

  const reloaded = await fetchProfile(supabase, authUser.id, `${context}: reload after create`)
  if (reloaded.error) return { user: null, error: reloaded.error.message }

  return {
    user: (reloaded.data as User | null) ?? null,
    error: reloaded.data ? null : 'Profile could not be loaded after creation.',
  }
}

export function logSessionResult(context: string, session: Session | null, error?: unknown) {
  authLog(`${context}: getSession result`, {
    hasSession: Boolean(session),
    userId: session?.user?.id,
    error,
  })
}

export function logUserResult(context: string, user: AuthUser | null, error?: unknown) {
  authLog(`${context}: getUser result`, {
    hasUser: Boolean(user),
    userId: user?.id,
    email: user?.email,
    error,
  })
}
