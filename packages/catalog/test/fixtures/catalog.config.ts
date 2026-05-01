import { defineCatalogConfig } from "@modular-react/catalog";

export default defineCatalogConfig({
  out: ".test-output",
  title: "Catalog Smoke Test",
  roots: [
    { name: "modules", pattern: "modules/*.ts", resolver: "defaultExport" },
    { name: "journeys", pattern: "journeys/*.ts", resolver: "defaultExport" },
    { name: "object-map", pattern: "object-map/index.ts", resolver: "objectMap" },
  ],
  theme: {
    brandName: "Smoke Test Catalog",
    primaryColor: "#0E7C66",
  },
  // Exercise the extension surface end-to-end so the fixture build also
  // serves as a regression check for the SPA's filter / detail-tab plumbing.
  extensions: {
    facets: [
      {
        key: "compliance",
        label: "Compliance",
        source: (entry) => {
          // Toy rule: tag-based mapping so the fixture has something to filter on.
          if (entry.meta.tags?.includes("payments")) return ["pci", "soc2"];
          if (entry.meta.tags?.includes("identity")) return ["soc2"];
          return undefined;
        },
      },
    ],
    moduleDetailTabs: [
      {
        id: "owners-card",
        label: "Owners",
        render: (entry) =>
          entry.meta.ownerTeam
            ? `<p>Owner: <strong>${entry.meta.ownerTeam}</strong></p>`
            : undefined,
      },
    ],
  },
});
