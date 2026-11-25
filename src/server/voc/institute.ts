import { site } from "@/config/site";
import type { Repo } from "../repo";

export interface Institute {
  name: string;
  address: string | null;
  phones: string[];
  note: string | null;
}

export const DEFAULT_INSTITUTE: Institute = {
  name: "Everfresh Vocational Institute",
  address: null,
  phones: site.contact.vocationalPhone
    ? [site.contact.vocationalPhone]
    : [],
  note: null,
};

export async function getInstitute(repo: Repo): Promise<Institute> {
  const saved =
    (await repo.docGet<Partial<Institute>>("settings", "institute")) ?? {};

  return {
    ...DEFAULT_INSTITUTE,
    ...saved,
    phones: DEFAULT_INSTITUTE.phones,
  };
}

const s = (v: unknown, max: number) =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max)
    : "";

export async function saveInstitute(
  repo: Repo,
  raw: unknown
): Promise<{ status: number; body: unknown }> {
  const r =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  const name = s(r.name, 80);

  if (!name) {
    return {
      status: 422,
      body: { error: "Enter the institute's name." },
    };
  }

  const v: Institute = {
    name,
    address: s(r.address, 200) || null,
    phones: DEFAULT_INSTITUTE.phones,
    note: s(r.note, 200) || null,
  };

  await repo.docPut("settings", "institute", v);

  return { status: 200, body: v };
}