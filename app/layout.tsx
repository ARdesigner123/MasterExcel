import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Master",
  description: "Combine PDF and Excel price lists into one searchable master Excel file.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
