import { describe, expect, it } from 'vitest'
import {
    DASHBOARD_DETAIL_INCLUDE,
    DASHBOARD_LIST_INCLUDE,
    WIDGET_DETAIL_INCLUDE,
    WIDGET_LIST_INCLUDE,
} from '@/resources/report/constants'

describe('WIDGET_LIST_INCLUDE', () => {
    it('locks the widget list include contract (pin/element/title + author name)', () => {
        expect(WIDGET_LIST_INCLUDE).toEqual({
            'include[]': ['pin', 'element', 'title'],
            'include[author]': 'id,name',
        })
    })
})

describe('WIDGET_DETAIL_INCLUDE', () => {
    it('locks the widget detail include contract (full payload + author name)', () => {
        expect(WIDGET_DETAIL_INCLUDE).toEqual({
            'include[]': ['pin', 'element', 'title', 'body', 'browser', 'comments', 'location', 'url', 'members'],
            'include[author]': 'id,name',
            'include[screenshot]': 'url',
            'include[video]': 'url',
        })
    })
})

describe('DASHBOARD_LIST_INCLUDE', () => {
    it('locks the dashboard list include contract (title/url/location/members:count + author email)', () => {
        expect(DASHBOARD_LIST_INCLUDE).toEqual({
            'include[]': ['title', 'url', 'location', 'members:count'],
            'include[author]': 'id,name,email',
        })
    })
})

describe('DASHBOARD_DETAIL_INCLUDE', () => {
    it('locks the dashboard detail include contract (full payload + author email)', () => {
        expect(DASHBOARD_DETAIL_INCLUDE).toEqual({
            'include[]': ['title', 'body', 'browser', 'comments', 'location', 'url', 'members'],
            'include[author]': 'id,name,email',
            'include[screenshot]': 'url',
            'include[video]': 'url',
        })
    })
})
