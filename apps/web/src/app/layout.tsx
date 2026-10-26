import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order & Inventory Management System",
  description: "Modular Monorepo for Order and Inventory Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
