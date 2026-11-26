import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaRegister } from "@/components/PwaRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CENTRUM CRM — Робочий простір",
  description: "Мультитенантна CRM-система для управління бізнесом",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CENTRUM CRM",
  },
  icons: {
    icon: "/android-chrome-192x192.png",
    apple: "/android-chrome-192x192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  width: "device-width",
  initialScale: 1,
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('centrum-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="uk"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#f8f9fb] text-slate-900 dark:bg-[#090b10] dark:text-slate-100">
        <PwaRegister />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
