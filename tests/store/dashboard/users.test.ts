import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usersSlice } from '@/store/dashboard/users'

function createMockRedline() {
    return {
        api: {
            user: {
                show: vi.fn().mockResolvedValue({ ok: true, data: { id: '1', name: 'Test User', email: 'test@example.com', role: 'developer', status: 'approved', created_at: '2024-01-01', last_active_at: null, stats: { reports: 0, open: 0, resolved: 0 } } }),
            },
        },
        config: { features: [] },
    } as any
}

describe('usersSlice', () => {
    let redline: ReturnType<typeof createMockRedline>

    beforeEach(() => {
        redline = createMockRedline()
    })

    it('initializes with default filter state', () => {
        const { users } = usersSlice(redline)

        expect(users.filter.status).toBe('all')
        expect(users.filter.role).toBeNull()
        expect(users.filter.search).toBe('')
        expect(users.sort).toBe('name')
        expect(users.dir).toBe('asc')
        expect(users.page.page).toBe(1)
        expect(users.page.perPage).toBe(15)
    })

    it('builds list params with pagination, sort, and includes', () => {
        const { userListParams } = usersSlice(redline)
        const params = userListParams()

        expect(params['paginate[page]']).toBe('1')
        expect(params['paginate[per_page]']).toBe('15')
        expect(params['sort[name]']).toBe('asc')
        const includes = params['include[]'] as string[]
        expect(includes).toContain('name')
        expect(includes).toContain('email')
        expect(includes).toContain('role')
    })

    it('includes search filter with like operator', () => {
        const { users, userListParams } = usersSlice(redline)
        users.filter.search = 'john'
        const params = userListParams()

        /**
         * `like` is the only operator the user search filter allows (see
         * User::querySchema()); the backend 422s on the default `eq`.
         */
        expect(params['filter[search:like]']).toBe('john')
    })

    it('includes role filter', () => {
        const { users, userListParams } = usersSlice(redline)
        users.filter.role = 'admin'
        const params = userListParams()

        expect(params['filter[role]']).toBe('admin')
    })

    it('includes status filter when not "all"', () => {
        const { users, userListParams } = usersSlice(redline)
        users.filter.status = 'pending'
        const params = userListParams()

        expect(params['filter[status]']).toBe('pending')
    })

    it('openUser loads user detail and sets active', async () => {
        const { users, openUser } = usersSlice(redline)
        await openUser('1')

        /**
         * The show endpoint is include-gated (see UserController::show) so we
         * must pass include[] to get name/email/role back.
         */
        expect(redline.api.user.show).toHaveBeenCalledWith('1', expect.objectContaining({
            'include[]': expect.arrayContaining(['name', 'email', 'role']),
        }))
        expect(users.active).toEqual(expect.objectContaining({ id: '1' }))
    })

    it('closeUser clears active user', async () => {
        const { users, openUser, closeUser } = usersSlice(redline)
        await openUser('1')
        expect(users.active).not.toBeNull()

        closeUser()
        expect(users.active).toBeNull()
    })
})
