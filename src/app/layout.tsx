import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Script-To-Video Engine v1.0",
  description:
    "Automated faceless YouTube production dashboard — paste a script, receive a finished video.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
