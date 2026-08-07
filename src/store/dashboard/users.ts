/**
 * Dashboard users slice - owns user list state, filters, sort, pagination,
 * and active user selection.
 */
import { reactive } from 'vue'
import type { RedlineContext } from '@/composables/useApi'
import type { UserRow, UserDetail } from '@/resources/user/model'
import type { ListParams, SortDir } from '@/core/api/params'
import {
    filterParams,
    includeArr,
    paginateParams,
    sortParams,
    mergeParams,
} from '@/core/api/params'

export type UserStatusGroup = 'all' | 'active' | 'pending'

export interface UserFilter {
    status: UserStatusGroup
    role: string | null
    search: string
}

export interface UsersSliceState {
    list: UserRow[]
    loaded: boolean
    active: UserDetail | null
    filter: UserFilter
    sort: string
    dir: SortDir
    page: { page: number; perPage: number }
}

export function usersSlice(redline: RedlineContext) {
    const users = reactive<UsersSliceState>({
        list: [],
        loaded: false,
        active: null,
        filter: {
            status: 'all',
            role: null,
            search: '',
        },
        sort: 'name',
        dir: 'asc',
        page: { page: 1, perPage: 15 },
    })

    // Functions
    function userListParams(): ListParams {
        const parts: ListParams[] = [
            paginateParams(users.page.page, users.page.perPage),
            includeArr(['name', 'email', 'role', 'reports:count', 'comments:count']),
        ]

        if (users.sort) parts.push(sortParams(users.sort, users.dir))
        if (users.filter.search) parts.push(filterParams('search', users.filter.search, 'like'))
        if (users.filter.role) parts.push(filterParams('role', users.filter.role))
        if (users.filter.status !== 'all') parts.push(filterParams('status', users.filter.status))

        return mergeParams(...parts)
    }

    async function openUser(id: string): Promise<void> {
        try {
            /**
             * The /user/{id} endpoint returns only id/status/created_at unless we
             * ask for the rest via include[] - the show endpoint is include-gated
             * (see UserController::show).
             */
            const res = await redline.api.user.show(id, {
                'include[]': ['name', 'email', 'role', 'stats'],
            })
            if (!res.ok) return
            users.active = res.data as UserDetail
        } catch { /** Network failure - no impact on UI */ }
    }

    function closeUser(): void {
        users.active = null
    }

    return { users, userListParams, openUser, closeUser }
}
