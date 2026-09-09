import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ASHVECTOR — Team Deathmatch",
  description:
    "6v6 team deathmatch in Sable Harbor. Choose your loadout. First to 50 wins.",
  metadataBase: new URL(
    "https://ashvector-last-signal.humanityfounders99.chatgpt.site",
  ),
  openGraph: {
    title: "ASHVECTOR — Team Deathmatch",
    description: "Blue versus red. First to 50. Get back in the fight.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "ASHVECTOR — Team Deathmatch",
    description: "A local multiplayer team deathmatch shooter.",
    images: ["/og.png"],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
