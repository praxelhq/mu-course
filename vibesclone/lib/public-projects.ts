import type { BuildUnderstanding } from "@/lib/contracts";

export type PublicProjectSource = {
  publicId: string;
  name: string;
  sourceUrl: string;
  niche: string;
  usp: string;
  publishedAt: Date;
  understanding: BuildUnderstanding;
};

export function publicProjectView(source: PublicProjectSource) {
  return {
    publicId: source.publicId,
    name: source.name,
    sourceUrl: source.sourceUrl,
    niche: source.niche,
    usp: source.usp,
    publishedAt: source.publishedAt,
    productName: source.understanding.productName,
    summary: source.understanding.summary,
    icp: source.understanding.icp,
    coreJobs: source.understanding.coreJobs,
    productFlows: source.understanding.productFlows,
    features: source.understanding.features.map(({ name, disposition, rationale }) => ({ name, disposition, rationale })),
    nicheAndUspChanges: source.understanding.nicheAndUspChanges,
  };
}
