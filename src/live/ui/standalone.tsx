import { createRoot } from "react-dom/client";
import { LiveApp } from "./live-app.tsx";

/** Entry for the self-contained rehearsal build (no server): `bun build src/live/ui/standalone.tsx`. */
(globalThis as { __lvNoDownload?: boolean }).__lvNoDownload = true; // hosted previews block file saves
createRoot(document.getElementById("root")!).render(<LiveApp source="local" />);
