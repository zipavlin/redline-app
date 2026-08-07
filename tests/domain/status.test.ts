import { describe, expect, it } from 'vitest'
import {
    STATUSES,
    OPEN_STATUSES,
    CLOSED_STATUSES,
    STATUS_META,
    isOpenStatus,
    isClosedStatus,
    canTransitionStatus,
    allowedStatusTargets,
    statusLabel,
    statusColor,
    statusAction,
    statusIcon,
    statusActionIcon,
} from '@/domain/status'
import type { Status } from '@/domain/status'
import { ROLES } from '@/domain/role'
import type { Role } from '@/domain/role'

describe('status groups', () => {
    it('open + closed partition the full status set, in lifecycle order', () => {
        expect([...OPEN_STATUSES, ...CLOSED_STATUSES]).toEqual(STATUSES)
    })

    it('isOpenStatus marks new/noticed/progress as open and nothing else', () => {
        const table: Array<[Status, boolean]> = [
            ['new', true],
            ['noticed', true],
            ['progress', true],
            ['resolved', false],
            ['done', false],
        ]
        for (const [status, expected] of table) {
            expect(isOpenStatus(status), status).toBe(expected)
        }
    })

    it('isClosedStatus marks resolved/done as closed and nothing else', () => {
        const table: Array<[Status, boolean]> = [
            ['new', false],
            ['noticed', false],
            ['progress', false],
            ['resolved', true],
            ['done', true],
        ]
        for (const [status, expected] of table) {
            expect(isClosedStatus(status), status).toBe(expected)
        }
    })

    it('open and closed are complements for every status', () => {
        for (const status of STATUSES) {
            expect(isOpenStatus(status)).not.toBe(isClosedStatus(status))
        }
    })
})

describe('canTransitionStatus', () => {
    /**
     * Full edge table mirroring Status::canTransitionTo on the backend:
     *   new <-> noticed <-> progress <-> resolved <-> done
     *                  \___ noticed <-> resolved ___/  (skip progress)
     */
    const matrix: Array<[Status, Status, boolean]> = [
        ['new', 'new', false], ['new', 'noticed', true], ['new', 'progress', false], ['new', 'resolved', false], ['new', 'done', false],
        ['noticed', 'new', true], ['noticed', 'noticed', false], ['noticed', 'progress', true], ['noticed', 'resolved', true], ['noticed', 'done', false],
        ['progress', 'new', false], ['progress', 'noticed', true], ['progress', 'progress', false], ['progress', 'resolved', true], ['progress', 'done', false],
        ['resolved', 'new', false], ['resolved', 'noticed', true], ['resolved', 'progress', true], ['resolved', 'resolved', false], ['resolved', 'done', true],
        ['done', 'new', false], ['done', 'noticed', false], ['done', 'progress', false], ['done', 'resolved', true], ['done', 'done', false],
    ]

    it('matches the backend lifecycle edge table for every from/to pair', () => {
        for (const [from, to, expected] of matrix) {
            expect(canTransitionStatus(from, to), `${from} -> ${to}`).toBe(expected)
        }
    })

    it('is symmetric', () => {
        for (const from of STATUSES) {
            for (const to of STATUSES) {
                expect(canTransitionStatus(from, to)).toBe(canTransitionStatus(to, from))
            }
        }
    })

    it('never allows staying in place', () => {
        for (const status of STATUSES) {
            expect(canTransitionStatus(status, status)).toBe(false)
        }
    })
})

describe('allowedStatusTargets', () => {
    /**
     * Role x currentStatus matrix, mirroring Report::allowedStatusTargets on the
     * backend (roles from the backend Role enum: guest/reporter/developer/admin).
     */
    const matrix: Array<[Role, Status, string[]]> = [
        // Guest: no status changes at all.
        ['guest', 'new', []],
        ['guest', 'noticed', []],
        ['guest', 'progress', []],
        ['guest', 'resolved', []],
        ['guest', 'done', []],
        // Reporter: candidates progress/done, filtered by the lifecycle chain.
        ['reporter', 'new', []],
        ['reporter', 'noticed', ['progress']],
        ['reporter', 'progress', []],
        ['reporter', 'resolved', ['progress', 'done']],
        ['reporter', 'done', []],
        // Developer: candidates noticed/progress/resolved, filtered by the chain.
        ['developer', 'new', ['noticed']],
        ['developer', 'noticed', ['progress', 'resolved']],
        ['developer', 'progress', ['noticed', 'resolved']],
        ['developer', 'resolved', ['noticed', 'progress']],
        ['developer', 'done', ['resolved']],
        // Admin: developer candidates (no done - admins target noticed|progress|resolved only).
        ['admin', 'new', ['noticed']],
        ['admin', 'noticed', ['progress', 'resolved']],
        ['admin', 'progress', ['noticed', 'resolved']],
        ['admin', 'resolved', ['noticed', 'progress']],
        ['admin', 'done', ['resolved']],
    ]

    it('matches the role x status matrix for every role and current status', () => {
        for (const [role, current, expected] of matrix) {
            expect(allowedStatusTargets(current, role), `${role}@${current}`).toEqual(expected)
        }
    })

    it('never lets a reporter target noticed', () => {
        for (const current of STATUSES) {
            expect(allowedStatusTargets(current, 'reporter')).not.toContain('noticed')
        }
    })

    it('grants a guest nothing regardless of current status', () => {
        for (const current of STATUSES) {
            expect(allowedStatusTargets(current, 'guest')).toEqual([])
        }
    })

    it('every returned target is a legal chain transition from the current status', () => {
        for (const role of ROLES) {
            for (const current of STATUSES) {
                for (const to of allowedStatusTargets(current, role)) {
                    expect(canTransitionStatus(current, to as Status), `${role}@${current} -> ${to}`).toBe(true)
                }
            }
        }
    })

    it('an admin must not be offered done as a target (fixed)', () => {
        /**
         * Fixed in src/domain/status.ts: the admin row is ['noticed', 'progress', 'resolved'] and no
         * longer lists 'done' (contract parity with the backend: Report::allowedStatusTargets treats an admin
         * as isDeveloper -> [noticed, progress, resolved]). This test guards against a regression.
         */
        for (const current of STATUSES) {
            expect(allowedStatusTargets(current, 'admin').includes('done'), `admin@${current}`).toBe(false)
        }
    })
})

describe('STATUS_META', () => {
    it('has an entry for every status and nothing else', () => {
        expect(Object.keys(STATUS_META).sort()).toEqual([...STATUSES].sort())
    })

    it('orders entries to match the lifecycle', () => {
        expect(Object.keys(STATUS_META)).toEqual([...STATUSES])
    })

    it('exposes the documented label/action/icon/color/bar/dot per status', () => {
        expect(STATUS_META).toEqual({
            new: { label: 'New', action: '/', icon: 'i-lucide-sparkles', actionIcon: 'i-lucide-sparkles', color: 'error', bar: 'bg-error', dot: 'bg-error' },
            noticed: { label: 'Noticed', action: 'Reopen', icon: 'i-lucide-eye', actionIcon: 'i-lucide-rotate-ccw', color: 'warning', bar: 'bg-warning', dot: 'bg-warning' },
            progress: { label: 'Progress', action: 'Accept', icon: 'i-lucide-loader-circle', actionIcon: 'i-lucide-circle-arrow-right', color: 'info', bar: 'bg-info', dot: 'bg-info' },
            resolved: { label: 'Resolved', action: 'Resolve', icon: 'i-lucide-check', actionIcon: 'i-lucide-circle-check', color: 'success', bar: 'bg-success', dot: 'bg-success' },
            done: { label: 'Done', action: 'Close', icon: 'i-lucide-crown', actionIcon: 'i-lucide-circle-check-big', color: 'success', bar: 'bg-success/50', dot: 'bg-success/50' },
        })
    })

    it('every entry is fully populated with icon/bg utility classes', () => {
        for (const status of STATUSES) {
            const meta = STATUS_META[status]
            expect(meta.label.length).toBeGreaterThan(0)
            expect(meta.action.length).toBeGreaterThan(0)
            expect(meta.icon.startsWith('i-')).toBe(true)
            expect(meta.actionIcon.startsWith('i-')).toBe(true)
            expect(meta.bar.startsWith('bg-')).toBe(true)
            expect(meta.dot.startsWith('bg-')).toBe(true)
        }
    })

    it('resolved and done share the success color; done is visually dimmed', () => {
        expect(STATUS_META.resolved.color).toBe('success')
        expect(STATUS_META.done.color).toBe('success')
        expect(STATUS_META.resolved.bar).toBe('bg-success')
        expect(STATUS_META.done.bar).toBe('bg-success/50')
    })
})

describe('status accessors', () => {
    it('statusLabel / statusColor / statusAction / statusIcon / statusActionIcon return the metadata for each status', () => {
        for (const status of STATUSES) {
            expect(statusLabel(status)).toBe(STATUS_META[status].label)
            expect(statusColor(status)).toBe(STATUS_META[status].color)
            expect(statusAction(status)).toBe(STATUS_META[status].action)
            expect(statusIcon(status)).toBe(STATUS_META[status].icon)
            expect(statusActionIcon(status)).toBe(STATUS_META[status].actionIcon)
        }
    })

    it('fall back gracefully for an unknown status', () => {
        const unknown = 'bogus' as unknown as Status
        expect(statusLabel(unknown)).toBe('bogus')
        expect(statusAction(unknown)).toBe('bogus')
        expect(statusIcon(unknown)).toBe('bogus')
        expect(statusActionIcon(unknown)).toBe('bogus')
        expect(statusColor(unknown)).toBe('neutral')
    })
})
