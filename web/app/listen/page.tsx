import { GuidePage } from "@/components/GuidePage";
import { JsonLd } from "@/components/JsonLd";
import { guideByPath, guideJsonLd, guideMetadata } from "@/lib/promote";
import { siteOrigin } from "@/lib/site";

const guide = guideByPath("/listen")!;

export async function generateMetadata() {
  return guideMetadata(guide, await siteOrigin());
}

export default async function Page() {
  const origin = await siteOrigin();
  return (
    <>
      <JsonLd data={guideJsonLd(guide, origin)} />
      <GuidePage guide={guide} />
    </>
  );
}
