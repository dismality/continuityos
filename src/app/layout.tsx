import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { integrations } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ContinuityOS: autonomous disruption recovery",
  description: "Detects staffing disruptions, negotiates recovery options and safely executes the manager-approved plan.",
};

function SetupNotice() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-medium">ShiftPilot needs a database</h1>
      <p className="mt-2 text-muted-foreground">
        Copy <code>.env.example</code> to <code>.env.local</code>, set <code>DATABASE_URL</code> to your Postgres connection string, run{" "}
        <code>npm run db:push</code>, then restart <code>npm run dev</code>.
      </p>
    </main>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const pathname = (await headers()).get("x-shiftpilot-pathname");
  const databaseFreeDemo = pathname === "/demo" || pathname?.startsWith("/live") === true;
  // Without a database the ShiftPilot dashboard can't run, so send people to the ContinuityOS live demo.
  if (!integrations.database && pathname === "/") redirect("/live");
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-muted/30">
        <TooltipProvider>{integrations.database || databaseFreeDemo ? children : <SetupNotice />}</TooltipProvider>
      </body>
    </html>
  );
}
