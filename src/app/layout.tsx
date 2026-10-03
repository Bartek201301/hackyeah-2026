import type { Metadata } from "next";
import localFont from "next/font/local";
import { APP_NAME } from "./nav";
import "./globals.css";

const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Ask questions about company data; every answer is checked against policy first.",
};

/* Root layout: document, font and tokens only. The signed-in shell lives in (app)/layout.tsx. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
