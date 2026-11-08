import "server-only";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/talentos/db";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { EMPLOYEES_COLLECTION, type Employee } from "@/lib/products/talentos/employees";

/**
 * Bridge between the existing Careers module and HRMS. A shortlisted / selected
 * applicant can be converted into an employee; the resulting employee record
 * keeps a link back to the application so recruitment history is preserved.
 */

const CONVERTIBLE_STATUSES = ["selected", "hired"];

interface ApplicationShape {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  positionTitle: string;
  positionSlug: string | null;
  status: string;
  createdAt: Date;
}

export interface ConvertibleApplicant {
  id: string;
  name: string;
  email: string;
  phone: string;
  positionTitle: string;
  positionSlug: string | null;
  status: string;
  appliedAt: string;
}

export async function getConvertibleApplicants(): Promise<ConvertibleApplicant[]> {
  const db = await getDb();
  const applications = db.collection<Document>(APPLICATIONS_COLLECTION);
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);

  const linked = await employees
    .find({ "recruitment.applicationId": { $ne: null }, ...notDeleted }, { projection: { "recruitment.applicationId": 1 } })
    .toArray();
  const linkedIds = new Set(linked.map((e) => e.recruitment?.applicationId).filter(Boolean) as string[]);

  const docs = (await applications
    .find({ status: { $in: CONVERTIBLE_STATUSES } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray()) as unknown as ApplicationShape[];

  return docs
    .filter((d) => !linkedIds.has(String(d._id)))
    .map((d) => ({
      id: String(d._id),
      name: d.name,
      email: d.email,
      phone: d.phone,
      positionTitle: d.positionTitle,
      positionSlug: d.positionSlug,
      status: d.status,
      appliedAt: new Date(d.createdAt).toISOString(),
    }));
}

export interface ConversionPrefill {
  applicationId: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  positionSlug: string | null;
  positionTitle: string;
}

export async function getApplicationForConversion(applicationId: string): Promise<ConversionPrefill | null> {
  if (!ObjectId.isValid(applicationId)) return null;
  const db = await getDb();
  const applications = db.collection<Document>(APPLICATIONS_COLLECTION);
  const doc = (await applications.findOne({ _id: new ObjectId(applicationId) })) as unknown as ApplicationShape | null;
  if (!doc) return null;
  if (!CONVERTIBLE_STATUSES.includes(doc.status)) return null;

  const [firstName, ...rest] = doc.name.trim().split(/\s+/);
  return {
    applicationId,
    firstName: firstName ?? doc.name,
    lastName: rest.join(" "),
    workEmail: "",
    personalEmail: doc.email,
    phone: doc.phone,
    positionSlug: doc.positionSlug,
    positionTitle: doc.positionTitle,
  };
}
