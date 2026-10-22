import { Bricolage_Grotesque } from "next/font/google";
import "@/live/ui/live.css";
import { LiveApp } from "@/live/ui/live-app";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata = { title: "ContinuityOS Live" };

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <div className={display.variable}>
      <LiveApp source={params.rehearsal ? "local" : "server"} />
    </div>
  );
}
