export const PRICING_ANALYSIS_ROUTES = [
  { method: "POST", path: "/api/v1/pricing-analyses", operation: "create" },
  { method: "GET", path: "/api/v1/pricing-analyses/:pricingAnalysisId", operation: "get" },
  {
    method: "POST",
    path: "/api/v1/pricing-analyses/:pricingAnalysisId/apply",
    operation: "apply",
  },
] as const;
