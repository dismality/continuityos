import "@/live/ui/live.css";
import { LiveApp } from "@/live/ui/live-app";

export const metadata = { title: "ContinuityOS Live" };

export default async function LivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <LiveApp source={params.rehearsal ? "local" : "server"} />;
}
