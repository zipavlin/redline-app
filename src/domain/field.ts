// FieldType (auth provider field descriptors)
export const FIELD_TYPES = ['string', 'number', 'password', 'pin'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
