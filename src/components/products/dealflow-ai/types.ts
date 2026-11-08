/** A Lead as it crosses the Server -> Client boundary (ObjectId stringified). */
export interface SerializedLead {
  _id: string;
  category: string;
  name: string;
  email?: string;
  phone: string;
  message?: string;
  subService?: string;
  status?: string;
  notes?: string;
  resume?: { storageKey: string; filename: string; contentType: string; size: number };
  source?: string;
  campaign?: string;
  campaignKey?: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  dealValue?: number;
  attribution?: { method: "utm" | "csv" | "manual"; at?: string | Date };
  createdAt: string;
  updatedAt: string;
}

/** A CareerApplication as it crosses the Server -> Client boundary (ObjectId stringified). */
export interface SerializedCareerApplication {
  _id: string;
  positionSlug: string | null;
  positionTitle: string;
  name: string;
  email: string;
  phone: string;
  coverNote?: string;
  status: string;
  notes?: string;
  resume: { storageKey: string; filename: string; contentType: string; size: number };
  source?: string;
  createdAt: string;
  updatedAt: string;
}
