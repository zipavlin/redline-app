import { describe, expect, it } from 'vitest'
import { initialsFromName } from '@/domain/initials'

describe('initialsFromName', () => {
    it('takes the first character of the first two words, uppercased', () => {
        expect(initialsFromName('Zoe Dev')).toBe('ZD')
    })

    it('uses a single initial for a single word', () => {
        expect(initialsFromName('Ada')).toBe('A')
    })

    it('ignores words after the first two', () => {
        expect(initialsFromName('Ada Grace Lovelace')).toBe('AG')
    })

    it('uppercases lowercase names', () => {
        expect(initialsFromName('ada lovelace')).toBe('AL')
    })

    it('trims and collapses whitespace between words', () => {
        expect(initialsFromName('  Ada  Lovelace ')).toBe('AL')
    })

    it('returns an empty string for an empty name', () => {
        expect(initialsFromName('')).toBe('')
    })

    it('returns an empty string for a whitespace-only name', () => {
        expect(initialsFromName('   ')).toBe('')
    })
})
