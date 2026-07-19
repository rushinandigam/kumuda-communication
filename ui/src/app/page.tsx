import { redirect } from "next/navigation";

import { getServerAccessToken, getServerAuthProvider } from "@/lib/auth/server";

export const dynamic = 'force-dynamic';

export default async function Home() {
  const authProvider = await getServerAuthProvider();

  if (authProvider === 'local') {
    const accessToken = await getServerAccessToken();
    if (accessToken) {
      redirect('/overview');
    } else {
      redirect('/auth/login');
    }
  }

  redirect('/auth/login');
}
