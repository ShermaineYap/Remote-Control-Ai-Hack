import type { Metadata, Viewport } from "next";
import "@fontsource/overpass/400.css";
import "@fontsource/overpass/700.css";
import "@fontsource/overpass/900.css";
import "@fontsource/overpass-mono/400.css";
import "./globals.css";

export const metadata: Metadata = { title: "Brek", description: "Approve your AI agent's plan once. Brek holds it to that plan.", manifest: "/manifest.json" };
export const viewport: Viewport = { themeColor: "#F5C400", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
