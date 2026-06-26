import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Peer Disclosures",
    short_name: "Peer Disclosures",
    description: "Fast SEC filing comparison workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#059669",
  };
}
