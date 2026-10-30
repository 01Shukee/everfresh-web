import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AdminApp } from "@/components/admin/AdminApp";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { COOKIE, requires2fa, userFromCookie } from "@/server/auth";
import { env, getRepo } from "@/server/runtime";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const u = await userFromCookie(await getRepo(), (await cookies()).get(COOKIE)?.value, env.adminSecret());
  return <section className="wrap sec">{u ? <AdminApp me={{ name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword, needs2fa: requires2fa(u), twoFactor: !!u.totp?.enabled }} /> : <AdminLogin />}</section>;
}
