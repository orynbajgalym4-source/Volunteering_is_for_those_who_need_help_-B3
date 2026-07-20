import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "asar.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: { default: "Asar — готовность общего дела", template: "%s · Asar" },
    description: "Превращаем размытые обещания в проверяемую операционную готовность.",
    openGraph: {
      title: "Asar — общее дело без хаоса в чатах",
      description: "Риск срыва виден заранее.",
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "Asar — общее дело без хаоса в чатах" }],
    },
    twitter: { card: "summary_large_image", title: "Asar — готовность общего дела", description: "Риск срыва виден заранее.", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
