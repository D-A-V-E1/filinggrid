import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FilingGrid",
    short_name: "FilingGrid",
    description: "Stateless SEC filing comparison workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#059669",
  };
}
