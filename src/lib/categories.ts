export const LEAD_CATEGORY_LABELS = {
  WEB_DEVELOPMENT: "Web Development",
  GRAPHIC_DESIGN: "Graphic Design",
  UI_DESIGN: "UI Design",
  SEO: "SEO",
  SMM: "SMM",
} as const;

export type LeadCategoryValue = keyof typeof LEAD_CATEGORY_LABELS;

export const LEAD_CATEGORIES = Object.keys(LEAD_CATEGORY_LABELS) as LeadCategoryValue[];
