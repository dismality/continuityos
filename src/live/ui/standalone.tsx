import { createRoot } from "react-dom/client";
import { LiveApp } from "./live-app.tsx";

/** Entry for the self-contained rehearsal build (no server): `npm run build:site`. */
createRoot(document.getElementById("root")!).render(<LiveApp source="local" />);
