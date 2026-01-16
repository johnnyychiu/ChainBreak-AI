import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "ChainBreak AI",
  description: "Real-time attack-path reasoning for defenders."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
