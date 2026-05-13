import type { Metadata } from "next";
import { FirebaseGuard } from "@/components/FirebaseGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeagueOps by Meridian Sun Golf Club",
  description: "League Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased text-gray-900 bg-gray-50">
        <FirebaseGuard>
          {children}
        </FirebaseGuard>
      </body>
    </html>
  );
}
