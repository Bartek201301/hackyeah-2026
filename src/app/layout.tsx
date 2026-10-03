import type { Metadata } from "next";
import localFont from "next/font/local";
import { unstable_rethrow } from "next/navigation";
import { getActor } from "@/shared/auth/actor";
import type { ActorContext } from "@/shared/contracts";
import { AppShell } from "@/shared/layout/AppShell";
import { APP_NAME, nav } from "./nav";
import "./globals.css";

const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_NAME,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Role is for display only; a failed lookup just hides it.
  let role: ActorContext["role"] | undefined;
  try {
    role = (await getActor())?.role;
  } catch (error) {
    unstable_rethrow(error);
  }
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans antialiased">
        <AppShell appName={APP_NAME} nav={nav} role={role}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
