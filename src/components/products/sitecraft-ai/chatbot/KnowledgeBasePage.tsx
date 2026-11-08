import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import KnowledgeBaseManager from "@/components/products/dealflow-ai/KnowledgeBaseManager";
import { getWebsiteKbSummary, listIndexedPages } from "@/lib/kb-website";
import { getPdfKbSummary, listPdfDocuments } from "@/lib/kb-pdf";
import { listKbRuns } from "@/lib/kb-runs";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { isOpenAIConfigured } from "@/lib/openai";

export default async function KnowledgeBasePage() {
  const [websiteSummary, pages, pdfSummary, pdfs, runs, config] = await Promise.all([
    getWebsiteKbSummary(),
    listIndexedPages(),
    getPdfKbSummary(),
    listPdfDocuments(),
    listKbRuns(15),
    getChatbotConfig(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/commandos" },
          { label: "AI Chatbot", href: "/commandos/chatbot" },
          { label: "Knowledge Base" },
        ]}
        title={<>Knowledge Base</>}
        description={<>Index website content and documents into the OpenAI vector store the assistant retrieves from.</>}
      />

      <PanelListFilters>
<KnowledgeBaseManager
        openAiConfigured={(await isOpenAIConfigured())}
        vectorStoreId={config.vectorStoreId}
        websiteSummary={websiteSummary}
        pages={pages}
        pdfSummary={pdfSummary}
        pdfs={pdfs}
        initialRuns={runs}
      />
</PanelListFilters>
    </div>
  );
}
