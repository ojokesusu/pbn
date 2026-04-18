import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { denyIfNotAdmin } from "@/lib/auth"
import { Prisma } from "@prisma/client"

export async function GET(request: NextRequest) {
  const denied = await denyIfNotAdmin()
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const username = (searchParams.get("username") || "").trim()
    const status = searchParams.get("status") || "all" // all | success | failed
    const from = searchParams.get("from") // ISO date
    const to = searchParams.get("to") // ISO date
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const perPageRaw = parseInt(searchParams.get("perPage") || "25", 10)
    const perPage = Math.min(100, Math.max(10, perPageRaw))

    const where: Prisma.LoginAttemptWhereInput = {}
    if (username) where.username = { contains: username }
    if (status === "success") where.success = true
    else if (status === "failed") where.success = false
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) {
        const toDate = new Date(to)
        toDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = toDate
      }
    }

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const [items, total, failedLastHour, todaySuccess, todayFailed, uniqueIpsToday] =
      await Promise.all([
        prisma.loginAttempt.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.loginAttempt.count({ where }),
        prisma.loginAttempt.count({
          where: { success: false, createdAt: { gte: oneHourAgo } },
        }),
        prisma.loginAttempt.count({
          where: { success: true, createdAt: { gte: startOfToday } },
        }),
        prisma.loginAttempt.count({
          where: { success: false, createdAt: { gte: startOfToday } },
        }),
        prisma.loginAttempt.findMany({
          where: { createdAt: { gte: startOfToday } },
          select: { ip: true },
          distinct: ["ip"],
        }),
      ])

    return NextResponse.json({
      items,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      summary: {
        failedLastHour,
        todaySuccess,
        todayFailed,
        todayUniqueIps: uniqueIpsToday.length,
      },
    })
  } catch (error) {
    console.error("Failed to fetch login attempts:", error)
    return NextResponse.json(
      { error: "Failed to fetch login attempts" },
      { status: 500 }
    )
  }
}
