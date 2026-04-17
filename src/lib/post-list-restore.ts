const POST_LIST_SNAPSHOT_STORAGE_KEY = 'distilink:post-list-snapshot'
const POST_LIST_RESTORE_PENDING_KEY = 'distilink:post-list-restore-pending'

export interface PostListSnapshot<TPost = unknown> {
  tab: string
  posts: TPost[]
  page: number
  hasMore: boolean
  scrollY: number
  targetPostId: string
  savedAt: number
}

function isPostListSnapshot(value: unknown): value is PostListSnapshot<unknown> {
  if (!value || typeof value !== 'object') return false

  const snapshot = value as Record<string, unknown>

  return (
    typeof snapshot.tab === 'string' &&
    Array.isArray(snapshot.posts) &&
    typeof snapshot.page === 'number' &&
    typeof snapshot.hasMore === 'boolean' &&
    typeof snapshot.scrollY === 'number' &&
    typeof snapshot.targetPostId === 'string' &&
    typeof snapshot.savedAt === 'number'
  )
}

export function getPostListItemId(postId: string) {
  return `post-${postId}`
}

export function savePostListSnapshot<TPost>(snapshot: PostListSnapshot<TPost>) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(POST_LIST_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
}

export function readPostListSnapshot<TPost = unknown>() {
  if (typeof window === 'undefined') return null

  const rawSnapshot = sessionStorage.getItem(POST_LIST_SNAPSHOT_STORAGE_KEY)
  if (!rawSnapshot) return null

  try {
    const parsedSnapshot = JSON.parse(rawSnapshot)
    if (!isPostListSnapshot(parsedSnapshot)) {
      sessionStorage.removeItem(POST_LIST_SNAPSHOT_STORAGE_KEY)
      return null
    }

    return parsedSnapshot as PostListSnapshot<TPost>
  } catch {
    sessionStorage.removeItem(POST_LIST_SNAPSHOT_STORAGE_KEY)
    return null
  }
}

export function clearPostListSnapshot() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(POST_LIST_SNAPSHOT_STORAGE_KEY)
}

export function markPostListRestorePending() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(POST_LIST_RESTORE_PENDING_KEY, '1')
}

export function isPostListRestorePending() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(POST_LIST_RESTORE_PENDING_KEY) === '1'
}

export function clearPostListRestorePending() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(POST_LIST_RESTORE_PENDING_KEY)
}

export function clearPostListRestoreState() {
  clearPostListSnapshot()
  clearPostListRestorePending()
}
