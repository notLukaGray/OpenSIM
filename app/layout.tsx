import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Love, Loyalty & Brand Preference",
  description:
    "A dating sim about brand perception. You think you're judging the brands — the brands are revealing you.",
  icons: { icon: "/assets/ui/logo-dsim.svg" },
  openGraph: {
    title: "Love, Loyalty & Brand Preference",
    description:
      "Date the brands. Discover the consumer you were playing all along.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e17",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
