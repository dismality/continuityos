/**
 * Builds one self-contained HTML file of Live Mode in rehearsal (no server, simulated phones),
 * styled exactly like the dashboard: Tailwind v4 is compiled from src/app/globals.css.
 * React is loaded from cdnjs as UMD globals; everything else is inlined.
 *
 *   bun scripts/build-rehearsal.ts out/continuityos-live.html
 *
 * Optional env for unusual setups:
 *   LIVE_BUILD_ALIASES='{"pkg":"/abs/path"}'   replace packages that are not installed
 *   TAILWIND_DIR=/abs/path/to/tailwindcss      use a tailwindcss package from elsewhere
 */
declare const Bun: any; // build script runs under Bun only

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = process.argv[2] ?? "out/continuityos-live.html";
const aliases: Record<string, string> = JSON.parse(process.env.LIVE_BUILD_ALIASES ?? "{}");
const globals: Record<string, string> = { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" };

// ── JavaScript
const result = await Bun.build({
  entrypoints: [join(root, "src/live/ui/standalone.tsx")],
  target: "browser",
  format: "iife",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "live-resolve",
      setup(build: any) {
        build.onResolve({ filter: /^react(-dom(\/client)?|\/jsx-runtime)?$/ }, (a: any) => ({ path: a.path, namespace: "umd" }));
        build.onLoad({ filter: /.*/, namespace: "umd" }, (a: any) => {
          if (a.path === "react/jsx-runtime")
            return {
              loader: "js",
              contents:
                "const R=window.React;const j=(t,p,k)=>{const {children,...r}=p||{};if(k!==undefined)r.key=k;return Array.isArray(children)?R.createElement(t,r,...children):children!==undefined?R.createElement(t,r,children):R.createElement(t,r)};export const jsx=j,jsxs=j,Fragment=R.Fragment;",
            };
          return { loader: "js", contents: `module.exports = window.${globals[a.path]};` };
        });
        build.onResolve({ filter: /^@\// }, (a: any) => {
          const base = join(root, "src", a.path.slice(2));
          const hit = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].map((x) => base + x).find((p) => existsSync(p) && !p.endsWith("/"));
          return { path: hit ?? base };
        });
        for (const [pkg, target] of Object.entries(aliases)) {
          const esc = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
          build.onResolve({ filter: new RegExp(`^${esc}$`) }, () => ({ path: target }));
        }
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "build failed");
const js = (await result.outputs[0].text()).replace(/<\/script/gi, "<\\/script");

// ── CSS: compile the dashboard's Tailwind for exactly the classes the Live UI uses
const twDir = process.env.TAILWIND_DIR ?? join(root, "node_modules/tailwindcss");
const { compile } = await import(join(twDir, "dist/lib.mjs"));
const load = async (id: string, base: string) => {
  const candidates = id === "tailwindcss" ? [join(twDir, "index.css")] : [resolve(base, id), join(root, "node_modules", id), join(root, "node_modules", id, "dist", `${id}.css`)];
  const file = candidates.find((p) => existsSync(p) && !p.endsWith("/") && /\.css$/.test(p));
  return { path: file ?? id, base: file ? dirname(file) : base, content: file ? readFileSync(file, "utf8") : "" };
};
const globalsCss = readFileSync(join(root, "src/app/globals.css"), "utf8");
const compiler = await compile(globalsCss, { base: join(root, "src/app"), loadStylesheet: load });
const sources = [
  ...readdirSync(join(root, "src/live/ui")).map((f) => join(root, "src/live/ui", f)),
  ...readdirSync(join(root, "src/components/ui")).map((f) => join(root, "src/components/ui", f)),
].filter((f) => /\.tsx?$/.test(f));
const tokens = new Set<string>();
for (const f of sources) for (const t of readFileSync(f, "utf8").split(/[\s"'`{}<>]+/)) if (t) tokens.add(t);
const css = compiler.build([...tokens, "h-full", "antialiased", "flex", "min-h-full", "flex-col", "bg-muted/30"]) + "\n" + readFileSync(join(root, "src/live/ui/live.css"), "utf8");

const html = `<title>ContinuityOS Live</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>
:root { --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --font-geist-mono: "Geist Mono", ui-monospace, Menlo, monospace; color-scheme: light; }
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>document.documentElement.classList.add("h-full","antialiased");document.body.className="flex min-h-full flex-col bg-muted/30";</script>
<script>${js}</script>
`;
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
