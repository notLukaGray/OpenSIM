import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "EXPECTATION / A Dating Sim", description: "An expectation audit disguised as a visual novel." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
