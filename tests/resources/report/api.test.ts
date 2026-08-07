import { describe, expect, it } from 'vitest'
import { makeReportApi } from '@/resources/report/api'
import { DASHBOARD_LIST_INCLUDE } from '@/resources/report/constants'
import { createClient, expectPathAndQuery } from '../support/harness'

describe('makeReportApi', () => {
    it('lists reports via GET report with serialized grammar params', async () => {
        const client = createClient()
        await makeReportApi(client).list(DASHBOARD_LIST_INCLUDE)
        expectPathAndQuery(
            client.get.mock.calls[0][0] as string,
            'report',
            'include[]=title&include[]=url&include[]=location&include[author]=id,name,email',
        )
    })

    it('aggregates via GET report/aggregate with serialized params', async () => {
        const client = createClient()
        await makeReportApi(client).aggregate({ 'aggregate[status:count]': 'new,resolved', 'group_by[]': ['status'] })
        expectPathAndQuery(
            client.get.mock.calls[0][0] as string,
            'report/aggregate',
            'aggregate[status:count]=new,resolved&group_by[]=status',
        )
    })

    it('shows a report via GET report/{id} with serialized params', async () => {
        const client = createClient()
        await makeReportApi(client).show('r1', { 'filter[status]': 'new' })
        expectPathAndQuery(client.get.mock.calls[0][0] as string, 'report/r1', 'filter[status]=new')
    })

    it('stores a report via POST report with the payload', async () => {
        const client = createClient()
        const payload = { url: 'https://example.dev/x', body: '<p>hi</p>' }
        await makeReportApi(client).store(payload)
        expect(client.post).toHaveBeenCalledWith('report', payload)
    })

    it('deletes a report via DELETE report/{id}', async () => {
        const client = createClient()
        await makeReportApi(client).destroy('r1')
        expect(client.delete).toHaveBeenCalledWith('report/r1')
    })

    it('moves a pin via POST report/{id}/move with the pin payload', async () => {
        const client = createClient()
        const pin = { x: 12.5, y: 80, prefer_selector: true }
        await makeReportApi(client).move('r1', pin)
        expect(client.post).toHaveBeenCalledWith('report/r1/move', pin)
    })

    it('updates the body via PATCH report/{id} with { body }', async () => {
        const client = createClient()
        await makeReportApi(client).update('r1', '<p>new</p>')
        expect(client.patch).toHaveBeenCalledWith('report/r1', { body: '<p>new</p>' })
    })

    it('changes the status via PATCH report/{id}/status with { status }', async () => {
        const client = createClient()
        await makeReportApi(client).status('r1', 'resolved')
        expect(client.patch).toHaveBeenCalledWith('report/r1/status', { status: 'resolved' })
    })
})
