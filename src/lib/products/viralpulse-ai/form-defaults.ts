/** Form value shapes + empty values for the campaign and post brief forms (a plain module, so server pages can spread them). */

export interface CampaignFormValues {
  name: string;
  objective: string;
  platforms: string[];
  targetAudience: string;
  industry: string;
  location: string;
  budget: string;
  currency: string;
  startDate: string;
  endDate: string;
  cta: string;
  landingPage: string;
  offerService: string;
  offerId: string;
  clientId: string;
  brandInfo: string;
  keywords: string;
  tone: string;
  language: string;
}

export const EMPTY_CAMPAIGN_FORM: CampaignFormValues = { name: "", objective: "", platforms: [], targetAudience: "", industry: "", location: "", budget: "", currency: "INR", startDate: "", endDate: "", cta: "", landingPage: "", offerService: "", offerId: "", clientId: "", brandInfo: "", keywords: "", tone: "", language: "English" };

export interface PostBriefValues {
  title: string;
  topic: string;
  serviceProduct: string;
  audience: string;
  tone: string;
  language: string;
  objective: string;
  contentType: "image" | "video";
  platforms: string[];
  link: string;
  plannedAt: string;
  campaignId: string;
  offerId: string;
  clientId: string;
  notes: string;
}

export const EMPTY_POST_BRIEF: PostBriefValues = { title: "", topic: "", serviceProduct: "", audience: "", tone: "", language: "English", objective: "", contentType: "image", platforms: [], link: "", plannedAt: "", campaignId: "", offerId: "", clientId: "", notes: "" };
