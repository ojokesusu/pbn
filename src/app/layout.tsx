import type { Metadata } from "next"
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google"
import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/components/ui/toast-provider"
import { ConfirmProvider } from "@/components/ui/confirm-modal"
import { AppShell } from "@/components/layout/app-shell"

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "PBN ROKET",
  description: "Dasbor Manajemen Jaringan Blog Privat",
  // Next.js App Router auto-discovers src/app/icon.png + apple-icon.png and
  // injects the correct <link> tags + cache-busting hashes. Keeping the
  // explicit metadata.icons here only for the legacy /favicon.png fallback
  // (older browsers that still look for /favicon.ico at site root).
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "any" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ConfirmProvider>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </ConfirmProvider>
        <ToastProvider />
      </body>
    </html>
  )
}
