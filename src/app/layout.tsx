import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/shared/layout/AppShell";
import { APP_NAME, nav } from "./nav";
import "./globals.css";

const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_NAME,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={geist.variable}>
      <body className="font-sans antialiased">
        <AppShell appName={APP_NAME} nav={nav}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
