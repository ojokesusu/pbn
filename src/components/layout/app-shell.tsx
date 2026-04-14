"use client"

import { usePathname } from "next/navigation"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname === "/login" || pathname.startsWith("/login/")

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      {children}
    </SidebarProvider>
  )
}
