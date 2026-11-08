import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import MyDocuments from "@/components/products/talentos/MyDocuments";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { listDocuments, serializeDocument } from "@/lib/products/talentos/documents";

export default async function MyDocumentsPage() {
  const user = await getCurrentHrmsUser();
  const docs = (await listDocuments(user!.employeeId!)).map(serializeDocument);

  return (
    <div className="space-y-5">
      <PanelPageHeader
        title={<>My Documents</>}
        description={<>Download your records, or upload certificates and proofs.</>}
      />
      <PanelListFilters>
<MyDocuments
        documents={docs.map((d) => ({
          _id: d._id,
          category: d.category,
          title: d.title,
          filename: d.filename,
          contentType: d.contentType,
          size: d.size,
          expiryDate: d.expiryDate,
          version: d.version,
          uploadedByRole: d.uploadedByRole,
          createdAt: d.createdAt,
        }))}
      />
</PanelListFilters>
    </div>
  );
}
