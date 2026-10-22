import { Bricolage_Grotesque } from "next/font/google";
import "@/live/ui/live.css";
import { LeaveApp } from "@/live/ui/leave";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata = { title: "Can't make a shift? · ContinuityOS" };

export default function LeavePage() {
  return (
    <div className={display.variable}>
      <LeaveApp />
    </div>
  );
}
