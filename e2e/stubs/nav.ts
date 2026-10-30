export const usePathname = () => (typeof window === "undefined" ? "/" : window.location.pathname);
export const useRouter = () => ({ refresh: () => { if (typeof window !== "undefined") window.location.reload(); } });
export const notFound = () => { throw new Error("NEXT_NOT_FOUND"); };
