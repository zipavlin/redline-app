import type { ListParams } from '@/core/api/params'

export const WIDGET_LIST_INCLUDE: ListParams = {
    'include[]': ['pin', 'element', 'title'],
    'include[author]': 'id,name',
}

export const WIDGET_DETAIL_INCLUDE: ListParams = {
    'include[]': ['pin', 'element', 'title', 'body', 'browser', 'comments', 'location', 'url'],
    'include[author]': 'id,name',
    'include[screenshot]': 'url',
    'include[video]': 'url',
}

export const DASHBOARD_LIST_INCLUDE: ListParams = {
    'include[]': ['title', 'url', 'location'],
    'include[author]': 'id,name,email',
}

export const DASHBOARD_DETAIL_INCLUDE: ListParams = {
    'include[]': ['title', 'body', 'browser', 'comments', 'location', 'url'],
    'include[author]': 'id,name,email',
    'include[screenshot]': 'url',
    'include[video]': 'url',
}
