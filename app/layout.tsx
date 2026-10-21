import type { Metadata } from "next";
import "./globals.css";
import "./gray.css";
import "./play.css";
import "./cinema.css";
import "./hand-tray.css";
import "./chrome.css";
import "./social.css";
import "./spectator.css";
import "./jump-in.css";
import "./developer.css";

export const metadata: Metadata = {
  title: "毫不留情 · 朋友牌桌",
  description: "3～6 人 No Mercy 联机牌桌，自定义开局和 7 的玩法，随心整理手牌。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
