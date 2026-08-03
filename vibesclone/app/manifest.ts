import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VibesClone",
    short_name: "VibesClone",
    description: "Analyze product logic, verify your adaptation, and get an ordered AI build sequence.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b0d",
    theme_color: "#c7ff22",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
