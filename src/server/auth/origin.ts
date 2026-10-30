export const sameOrigin = (origin: string | null, siteUrl: string) => !!origin && origin === new URL(siteUrl).origin;
