export const commentKeys = {
    all: ['comments'] as const,
    list: (reportId: string) => [...commentKeys.all, reportId] as const,
}
