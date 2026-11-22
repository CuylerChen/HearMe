import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { LandingPage } from "@/components/LandingPage";
import { homeJsonLd, siteDescription, siteOrigin } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: siteDescription,
};

export default async function Page() {
  const origin = await siteOrigin();
  return (
    <>
      <JsonLd data={homeJsonLd(origin)} />
      <LandingPage />
    </>
  );
}
