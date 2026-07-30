import { notFound } from "next/navigation";
import { ImageGalleryPresenter } from "@/components/image-gallery-presenter";
import type { GalleryPresentationItem } from "@/lib/gallery-presentation";

function imageData(index: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d97842"/><text x="320" y="250" text-anchor="middle" font-size="64" fill="#f5f0e8">${index}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function GalleryProjectorLayoutFixture() {
  if (process.env.NODE_ENV === "production") notFound();

  const items: GalleryPresentationItem[] = Array.from({ length: 48 }, (_, index) => ({
    submissionId: `submission-${index + 1}`,
    imageUrl: imageData(index + 1),
    ownerName: `Student ${index + 1}`,
    caption: `Caption ${index + 1}`,
  }));

  return (
    <main style={{ padding: "2rem" }}>
      <ImageGalleryPresenter title="S2 · Meme" sectionCode="H" items={items} />
    </main>
  );
}
