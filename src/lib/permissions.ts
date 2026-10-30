// Shared by the server (authoritative) and the admin UI (convenience only: hides tabs a role cannot use).
export type Role = "owner" | "manager" | "food_staff" | "admissions_staff" | "catering_staff" | "editor";
export type Module = "food" | "vocational" | "catering" | "content" | "inbox" | "settings" | "users";
export const ROLES: Role[] = ["owner", "manager", "food_staff", "admissions_staff", "catering_staff", "editor"];
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner (everything, including staff accounts)", manager: "Manager (all business areas, no staff accounts)", food_staff: "Food ordering staff", admissions_staff: "Admissions staff (vocational studies)", catering_staff: "Catering staff", editor: "Website editor (content only)" };
/** 'w' = read and change, 'r' = read only. Anything not listed is forbidden. */
export const ROLE_MODULES: Record<Role, Partial<Record<Module, "r" | "w">>> = {
  owner: { food: "w", vocational: "w", catering: "w", content: "w", inbox: "w", settings: "w", users: "w" },
  manager: { food: "w", vocational: "w", catering: "w", content: "w", inbox: "w", settings: "w" },
  food_staff: { food: "w" },
  admissions_staff: { vocational: "w" },
  catering_staff: { catering: "w" },
  editor: { content: "w" },
};
export const can = (role: Role, m: Module, write: boolean) => { const p = ROLE_MODULES[role]?.[m]; return !!p && (!write || p === "w"); };
export const canAnyWrite = (role: Role) => Object.values(ROLE_MODULES[role] ?? {}).includes("w");
