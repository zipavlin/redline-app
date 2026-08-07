import type { Author } from '@/resources/user/model'

export interface Comment {
    id: string
    body: string
    created_at: string
    author: Author | null
}
