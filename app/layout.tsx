import type { Metadata } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import branding from "@/branding.json";
import "./globals.css";
export const metadata: Metadata = { title: branding.logoText, referrer: "no-referrer", description: "Registro personal de gastos en COP. Consulta, agrega y edita tus gastos en una sola pantalla." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const faces = branding.brandbook.fontFaces.map(f => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('${existsSync(join(process.cwd(), "public", "fonts", `${f.sha256}.ttf`)) ? `/fonts/${f.sha256}.ttf` : f.url}') format('truetype');}`).join("");
  return <html lang="es"><head><style>{faces}</style></head><body style={{ "--brand-background": branding.backgroundColor, "--brand-surface": branding.secondaryColor, "--brand-primary": branding.primaryColor, "--brand-accent": branding.accentColor, "--brand-text": branding.textColor, "--brand-font-heading": `'${branding.fontHeading}', sans-serif`, "--brand-font-body": `'${branding.fontBody}', sans-serif` } as React.CSSProperties}>{children}<script src={"https://constructor-api-prod.vercel.app/v1/projects/P-97ZUB4/analytics/script.js"} defer></script><script src="/constructor-editor.js" defer></script></body></html>;
}
