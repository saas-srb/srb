import type { FaqHubGroup } from "@/lib/platform/saas/faqs";
import { productPath } from "@/lib/platform/saas/product-routes";

export const AI_SUPPORT_COLLABORATION_FAQS: FaqHubGroup[] = [
  {
    id: "agentos",
    title: "SelfRun AgentOS",
    href: productPath("aibots"),
    items: [
      {
        q: "Can I set up separate bots for different jobs?",
        a: "Yes. Create a bot for each task and give it its own instructions, model, knowledge files and access rules.",
        evidence: ["src/lib/products/agentos/bots.ts:15-18", "src/components/products/agentos/BotForm.tsx:174-203"],
      },
      {
        q: "What do I need to provide when creating a bot?",
        a: "Give it a name and system instructions, then choose an allowed model; category, description, appearance, prompts, attachments and access are configurable too.",
        evidence: ["src/components/products/agentos/BotForm.tsx:120-132", "src/components/products/agentos/BotForm.tsx:174-229", "src/lib/products/agentos/bots.ts:194-207"],
      },
      {
        q: "Can I leave a bot's system instructions blank?",
        a: "No. AgentOS requires instructions because they define the bot's behaviour.",
        evidence: ["src/lib/products/agentos/bots.ts:194-198", "src/components/products/agentos/BotForm.tsx:194-203"],
      },
      {
        q: "Can I change a bot's instructions after creating it?",
        a: "Yes. Edit and save them; the new instructions apply to the next message in existing chats, not to replies already given.",
        evidence: ["src/components/products/agentos/BotForm.tsx:194-203", "src/components/products/agentos/BotForm.tsx:286-290"],
      },
      {
        q: "Can I choose a model that is not in the model selector?",
        a: "No. The save action checks the selected model against the models enabled in AgentOS settings.",
        evidence: ["src/components/products/agentos/BotForm.tsx:176-178", "src/lib/products/agentos/bots.ts:198-200"],
      },
      {
        q: "What does the temperature setting change?",
        a: "It controls the response setting: the form describes 0 as focused and 1 as creative. Leave it blank for the model default.",
        evidence: ["src/components/products/agentos/BotForm.tsx:179-181", "src/lib/products/agentos/bots.ts:201-207"],
      },
      {
        q: "Can I set a temperature above 2?",
        a: "No. AgentOS accepts a numeric temperature from 0 through 2, rounded to two decimal places.",
        evidence: ["src/lib/products/agentos/bots.ts:201-207"],
      },
      {
        q: "Can I add a short description users can read before chatting?",
        a: "Yes. The description is shown before users start a chat and can be up to 500 characters.",
        evidence: ["src/components/products/agentos/BotForm.tsx:131-133", "src/lib/products/agentos/constants.ts:60-64"],
      },
      {
        q: "Are bot categories limited to the suggested list?",
        a: "No. The category field offers suggestions but accepts free text.",
        evidence: ["src/components/products/agentos/BotForm.tsx:123-129", "src/lib/products/agentos/constants.ts:23-26"],
      },
      {
        q: "Can I customize a bot's icon and colour?",
        a: "Yes. Choose from the available icon and colour palettes; the form previews the selection.",
        evidence: ["src/components/products/agentos/BotForm.tsx:115-117", "src/components/products/agentos/BotForm.tsx:136-170"],
      },
      {
        q: "Can a bot show suggested questions when a chat starts?",
        a: "Yes. Add up to four optional starter prompts; they appear as one-click questions in a new chat.",
        evidence: ["src/components/products/agentos/BotForm.tsx:206-223", "src/lib/products/agentos/constants.ts:64-67", "src/components/products/agentos/ChatWorkspace.tsx:573-577"],
      },
      {
        q: "How long can a starter prompt be?",
        a: "Each starter prompt field allows up to 200 characters.",
        evidence: ["src/components/products/agentos/BotForm.tsx:208-214"],
      },
      {
        q: "What happens when I make a bot inactive?",
        a: "Inactive bots are removed from users' sidebar and are not available to regular users for chat; bot editors can still open bots.",
        evidence: ["src/components/products/agentos/BotForm.tsx:182-190", "src/lib/products/agentos/bots.ts:86-102"],
      },
      {
        q: "Can a bot be shared with everyone who can use AgentOS?",
        a: "Yes. Set its access mode to everyone with AI Bots access.",
        evidence: ["src/components/products/agentos/BotForm.tsx:254-272", "src/lib/products/agentos/bots.ts:86-102"],
      },
      {
        q: "Can I restrict a bot to selected roles or people?",
        a: "Yes. Restricted access can list roles, individual AgentOS users, or both.",
        evidence: ["src/components/products/agentos/BotForm.tsx:254-282", "src/lib/products/agentos/bots.ts:95-102"],
      },
      {
        q: "Do people selected for a restricted bot get notified?",
        a: "Yes. Users newly added to a bot's access list receive a notification that the bot was shared with them.",
        evidence: ["src/app/(products)/agentos/(protected)/actions.ts:35-43", "src/app/(products)/agentos/(protected)/actions.ts:56-72"],
      },
      {
        q: "Can a bot manager open a bot that is restricted to others?",
        a: "Yes. AgentOS bot editors can open every bot, including restricted ones.",
        evidence: ["src/components/products/agentos/BotForm.tsx:254-255", "src/lib/products/agentos/bots.ts:86-102"],
      },
      {
        q: "What is General Chat, and how is it different from a bot?",
        a: "General Chat is a reserved assistant using the workspace's general instructions and default model; it has no bot-specific knowledge base or access list.",
        evidence: ["src/lib/products/agentos/bots.ts:125-149"],
      },
      {
        q: "Can General Chat use a bot's knowledge files?",
        a: "No. General Chat has no knowledge base; its instructions come from AgentOS settings.",
        evidence: ["src/lib/products/agentos/bots.ts:125-149"],
      },
      {
        q: "Does each bot get its own knowledge files?",
        a: "Yes. Every bot has a private OpenAI vector store, so another bot cannot search its knowledge files.",
        evidence: ["src/lib/products/agentos/bots.ts:15-18", "src/components/products/agentos/KnowledgeBase.tsx:75-78"],
      },
      {
        q: "Will a bot use general knowledge when it has knowledge files?",
        a: "No. With assigned knowledge files, it searches that bot's files and answers only from retrieved material; it says when the files do not contain the answer.",
        evidence: ["src/components/products/agentos/KnowledgeBase.tsx:24-40", "src/lib/products/agentos/engine.ts:30-43", "src/lib/products/agentos/engine.ts:181-182"],
      },
      {
        q: "How many knowledge search results can be supplied to an answer?",
        a: "The file-search request is configured to return up to eight results.",
        evidence: ["src/lib/products/agentos/engine.ts:175-182"],
      },
      {
        q: "What does a bot do before it has any assigned knowledge files?",
        a: "It answers from its configured instructions and stays within the purpose those instructions specify.",
        evidence: ["src/components/products/agentos/KnowledgeBase.tsx:33-40", "src/lib/products/agentos/engine.ts:44-48"],
      },
      {
        q: "Do disabled knowledge files still affect a bot's answer mode?",
        a: "No. Disabled files do not count as assigned knowledge; if all files are disabled, the bot switches to instruction-based answers.",
        evidence: ["src/components/products/agentos/KnowledgeBase.tsx:24-40", "src/lib/products/agentos/engine.ts:59-74"],
      },
      {
        q: "Which file types can I add to a bot's knowledge base?",
        a: "AgentOS accepts PDF, Word, text, Markdown, PowerPoint, HTML, JSON, CSV and Excel files.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:137-146", "src/lib/products/agentos/constants.ts:34-44"],
      },
      {
        q: "Can I upload a spreadsheet as knowledge?",
        a: "Yes. CSV and Excel are converted to text before they are sent for indexing.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:144-146", "src/lib/products/agentos/knowledge.ts:114-128"],
      },
      {
        q: "What is the maximum size for a knowledge file?",
        a: "Each knowledge file can be up to 4 MB.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:144-146", "src/lib/products/agentos/constants.ts:55-58"],
      },
      {
        q: "Can I queue files before the new bot exists?",
        a: "Yes. The create form queues files first and uploads them to the new bot after it is saved.",
        evidence: ["src/components/products/agentos/BotForm.tsx:80-110", "src/components/products/agentos/KnowledgeQueue.tsx:9-13", "src/components/products/agentos/BotForm.tsx:233-249"],
      },
      {
        q: "Does AgentOS upload a batch of knowledge files all at once?",
        a: "Queued files are uploaded one at a time; each file gets its own upload result.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:77-99"],
      },
      {
        q: "Can I remove a file from the upload queue before sending it?",
        a: "Yes. Remove a queued item or clear the queue before upload; queued titles can also be edited.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:64-75", "src/components/products/agentos/KnowledgeQueue.tsx:152-170"],
      },
      {
        q: "Can knowledge files have their own title, category and description?",
        a: "Yes. Give queued files editable titles and a shared category and optional description, then edit each file's details in the knowledge list.",
        evidence: ["src/components/products/agentos/KnowledgeQueue.tsx:152-176", "src/components/products/agentos/KnowledgeBase.tsx:130-176"],
      },
      {
        q: "What if I choose an empty file or a file with the wrong extension?",
        a: "Empty files, unsupported extensions and content that does not match the extension are rejected.",
        evidence: ["src/lib/products/agentos/knowledge.ts:114-122"],
      },
      {
        q: "Why does a newly uploaded file say Processing?",
        a: "Uploads are attached without waiting for indexing to finish; AgentOS checks OpenAI for the actual processing status.",
        evidence: ["src/lib/products/agentos/knowledge.ts:19-21", "src/lib/products/agentos/knowledge.ts:152-178", "src/lib/products/agentos/knowledge.ts:254-276"],
      },
      {
        q: "What do Ready, Processing, Failed and Disabled mean in the knowledge list?",
        a: "They distinguish indexed files, indexing in progress, unsuccessful indexing and files excluded from the bot's knowledge search.",
        evidence: ["src/components/products/agentos/KnowledgeBase.tsx:43-55", "src/lib/products/agentos/knowledge.ts:110-112", "src/lib/products/agentos/knowledge.ts:218-241"],
      },
      {
        q: "Can I turn off a file without uploading it again later?",
        a: "Yes. Disabling detaches it from search but keeps the OpenAI file so you can enable it again without re-uploading.",
        evidence: ["src/lib/products/agentos/knowledge.ts:214-241"],
      },
      {
        q: "Can I replace a knowledge file with a newer version?",
        a: "Yes. AgentOS attaches the replacement before removing the old indexed file and increments the file version.",
        evidence: ["src/lib/products/agentos/knowledge.ts:178-212"],
      },
      {
        q: "Can I view the text that was indexed from a knowledge file?",
        a: "Yes, when the file is enabled and Ready. The view shows extracted indexed text and indicates when the display is truncated.",
        evidence: ["src/components/products/agentos/KnowledgeBase.tsx:80-117", "src/lib/products/agentos/knowledge.ts:278-299"],
      },
      {
        q: "Does AgentOS keep a copy of my original knowledge-file bytes?",
        a: "No. The original bytes, chunks and embeddings are held by OpenAI; AgentOS stores the metadata needed by its file list.",
        evidence: ["src/lib/products/agentos/knowledge.ts:22-26", "src/lib/products/agentos/knowledge.ts:281-286"],
      },
      {
        q: "What happens when I delete a knowledge file?",
        a: "It is removed from the bot's OpenAI knowledge store and marked deleted in the app.",
        evidence: ["src/lib/products/agentos/knowledge.ts:243-252", "src/app/(products)/agentos/(protected)/actions.ts:137-145"],
      },
      {
        q: "Can I upload knowledge files if OpenAI is not connected?",
        a: "No. The create form explains that the workspace must connect OpenAI in Settings → Integrations before files can be uploaded.",
        evidence: ["src/components/products/agentos/BotForm.tsx:243-249", "src/app/(products)/api/agentos/chat/route.ts:67-69"],
      },
      {
        q: "Can a bot answer if OpenAI is not configured?",
        a: "No. The chat route returns a setup error until an OpenAI key is configured for the workspace.",
        evidence: ["src/app/(products)/api/agentos/chat/route.ts:67-69"],
      },
      {
        q: "Can I attach a file to every bot chat?",
        a: "Only if that bot allows attachments. The chat route rejects files when its attachment option is off.",
        evidence: ["src/components/products/agentos/BotForm.tsx:224-229", "src/app/(products)/api/agentos/chat/route.ts:72-76"],
      },
      {
        q: "Which types of files can I attach to a chat message?",
        a: "Chat attachments may be PDF, image, text, CSV or Excel files.",
        evidence: ["src/components/products/agentos/BotForm.tsx:224-229", "src/lib/products/agentos/constants.ts:46-51"],
      },
      {
        q: "How many files can I attach to one chat message?",
        a: "You can attach up to three files, with a combined maximum size of 4 MB.",
        evidence: ["src/lib/products/agentos/constants.ts:55-58", "src/lib/products/agentos/engine.ts:89-92"],
      },
      {
        q: "Do chat attachments become part of a bot's knowledge base?",
        a: "No. They are sent for that chat only and are not added to the bot's knowledge base.",
        evidence: ["src/components/products/agentos/BotForm.tsx:224-229"],
      },
      {
        q: "How are chat PDFs and images provided to the assistant?",
        a: "PDFs are passed as file inputs and images as image inputs; supported text-like files are included inline.",
        evidence: ["src/lib/products/agentos/engine.ts:79-113"],
      },
      {
        q: "Are long text attachments sent in full?",
        a: "Inline text attachments are capped at 60,000 characters, with a truncation marker when the text is longer.",
        evidence: ["src/lib/products/agentos/constants.ts:66-68", "src/lib/products/agentos/engine.ts:108-113"],
      },
      {
        q: "What is the maximum length of a chat message?",
        a: "The message composer allows up to 8,000 characters.",
        evidence: ["src/lib/products/agentos/constants.ts:60-65", "src/components/products/agentos/ChatWorkspace.tsx:635-645"],
      },
      {
        q: "Can I search my AgentOS chat history?",
        a: "Yes. The chat-history search filters the visible list by chat title.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:135-157"],
      },
      {
        q: "Can I rename an AgentOS chat?",
        a: "Yes. Use the chat's rename control, enter a title and save it; the title field allows up to 120 characters.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:62-121", "src/lib/products/agentos/constants.ts:60-65"],
      },
      {
        q: "Can I permanently delete an AgentOS chat?",
        a: "Yes. The delete action asks for confirmation and says it permanently deletes both the chat and its OpenAI conversation.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:118-127"],
      },
      {
        q: "Can I copy an assistant response?",
        a: "Yes. Use Copy response to copy the reply to your clipboard.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:166-184"],
      },
      {
        q: "Can I ask AgentOS to regenerate the last response?",
        a: "Yes. The last assistant response has a Regenerate control when the chat is not busy.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:188-250"],
      },
      {
        q: "Can I stop a reply that is still generating?",
        a: "Yes. While a response is streaming, the chat shows a Stop generating control.",
        evidence: ["src/components/products/agentos/ChatWorkspace.tsx:645-656"],
      },
    ],
  },
  {
    id: "databrain-ai",
    title: "DataBrain AI",
    href: productPath("intelligence"),
    items: [
      {
        q: "What can I ask DataBrain AI?",
        a: "Ask questions in plain language about company business records; answers are built from the records available to your account.",
        evidence: ["src/app/(products)/databrain-ai/(protected)/page.tsx:9-18"],
      },
      {
        q: "Can DataBrain AI make changes to the records it reads?",
        a: "No. Its query runner uses read-only aggregation and has no write path.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:11-14", "src/lib/products/databrain-ai/query/execute.ts:75-76"],
      },
      {
        q: "Does DataBrain show every business area to every user?",
        a: "No. The available catalog is filtered by company entitlements, enabled modules and the signed-in user's data permissions.",
        evidence: ["src/lib/products/databrain-ai/catalog/view.ts:9-16", "src/lib/products/databrain-ai/catalog/view.ts:58-74"],
      },
      {
        q: "Can DataBrain query a product that my company has not enabled?",
        a: "No. Entities from a module that is not included or enabled are left out of the catalog for that request.",
        evidence: ["src/lib/products/databrain-ai/catalog/view.ts:59-68"],
      },
      {
        q: "Can DataBrain reveal fields I am not allowed to read?",
        a: "No. Sensitive fields and fields outside your permission grant are excluded from the catalog used to validate queries.",
        evidence: ["src/lib/products/databrain-ai/catalog/view.ts:12-16", "src/lib/products/databrain-ai/catalog/view.ts:69-75", "src/lib/products/databrain-ai/query/validate.ts:6-14"],
      },
      {
        q: "Can I ask about information in a related record?",
        a: "Yes, when the relation and target fields are present in your catalog; a query can use up to two parent relations.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/validate.ts:87-105"],
      },
      {
        q: "Can the assistant inspect which fields an entity has?",
        a: "It can request an entity description listing the fields, valid values, types and relations available in your catalog.",
        evidence: ["src/lib/products/databrain-ai/engine.ts:71-75", "src/lib/products/databrain-ai/query/describe.ts:31-43"],
      },
      {
        q: "What if I ask about an entity that is restricted?",
        a: "The validator rejects entities outside your access or plan and tells the assistant not to retry them.",
        evidence: ["src/lib/products/databrain-ai/query/validate.ts:61-70", "src/lib/products/databrain-ai/engine.ts:197-207"],
      },
      {
        q: "What is the maximum length of a DataBrain question?",
        a: "Questions are limited to 1,000 characters.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:18-20", "src/lib/products/databrain-ai/turn.ts:26-32"],
      },
      {
        q: "How many questions can I ask in an hour?",
        a: "The per-user limit is 30 questions per hour; the application reports how long to wait after the limit is reached.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:18-20", "src/lib/products/databrain-ai/conversations.ts:135-143", "src/lib/products/databrain-ai/turn.ts:43-49"],
      },
      {
        q: "How many data queries can DataBrain run for one answer?",
        a: "The assistant can run up to six queries for a turn.",
        evidence: ["src/lib/products/databrain-ai/engine.ts:28-35", "src/lib/products/databrain-ai/engine.ts:209-212"],
      },
      {
        q: "Can I ask DataBrain to compare totals across periods?",
        a: "Yes. It supports aggregate measures and date buckets such as day, week, month, quarter and year when the selected fields permit them.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:5-20", "src/lib/products/databrain-ai/query/plan.ts:47-56"],
      },
      {
        q: "Which aggregate calculations can DataBrain use?",
        a: "Available operations include count, sum, average, minimum, maximum and distinct count; field types determine which operations are valid.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:5-10", "src/lib/products/databrain-ai/query/validate.ts:202-229"],
      },
      {
        q: "Can I filter a data question to a date range?",
        a: "Yes. Date filters accept supported comparisons and an inclusive between range using real YYYY-MM-DD dates.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:91-95", "src/lib/products/databrain-ai/query/validate.ts:114-153"],
      },
      {
        q: "Can I search text fields for a phrase?",
        a: "Yes. String fields support a contains filter, which matches text without case sensitivity.",
        evidence: ["src/lib/products/databrain-ai/query/validate.ts:48-60", "src/lib/products/databrain-ai/query/translate.ts:128-159"],
      },
      {
        q: "Can I filter a field to one of several values?",
        a: "Yes. The in filter accepts a non-empty list of up to 50 values.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/validate.ts:135-143"],
      },
      {
        q: "Can DataBrain filter for fields that are empty?",
        a: "Yes. The is_null filter takes true for empty and false for a field with a value.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:91-95", "src/lib/products/databrain-ai/query/validate.ts:130-134"],
      },
      {
        q: "Can I use a text value as a numeric filter?",
        a: "No. The validator checks filter values against the field type, requiring numbers for number and money fields and true or false for booleans.",
        evidence: ["src/lib/products/databrain-ai/query/validate.ts:114-129"],
      },
      {
        q: "What happens if I use an invalid option for an enum field?",
        a: "The query is rejected with the valid enum values rather than being run with an unrecognized value.",
        evidence: ["src/lib/products/databrain-ai/query/validate.ts:125-129"],
      },
      {
        q: "Can I filter on a date like February 30?",
        a: "No. Date filter values must be valid calendar dates in YYYY-MM-DD format.",
        evidence: ["src/lib/products/databrain-ai/query/validate.ts:4", "src/lib/products/databrain-ai/query/validate.ts:120-124"],
      },
      {
        q: "How many fields can one query select?",
        a: "A query plan allows up to eight selected fields.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/plan.ts:151-160"],
      },
      {
        q: "How many aggregate measures can one query include?",
        a: "A query plan allows up to six aggregate measures.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/plan.ts:162-169"],
      },
      {
        q: "How many filters can DataBrain apply in a query?",
        a: "A query plan allows up to 12 filters.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/plan.ts:171-178"],
      },
      {
        q: "Can I sort a result by several columns?",
        a: "Yes. A query plan can include up to three sort keys, each ascending or descending.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/plan.ts:180-186"],
      },
      {
        q: "How many rows does a list query return by default?",
        a: "A list query defaults to 50 rows unless the query requests a different limit.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:54-56", "src/lib/products/databrain-ai/query/validate.ts:249-250"],
      },
      {
        q: "How many rows does an aggregate query return by default?",
        a: "An aggregate query defaults to 100 result rows.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:54-56", "src/lib/products/databrain-ai/query/validate.ts:249-250"],
      },
      {
        q: "Can I request more than 500 result rows?",
        a: "No. Query limits are capped at 500 rows.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:47-56", "src/lib/products/databrain-ai/query/plan.ts:106", "src/lib/products/databrain-ai/query/validate.ts:249-250"],
      },
      {
        q: "Why does the assistant mention that it saw fewer rows than the table?",
        a: "The assistant receives at most 60 rows from a query result; a table or chart can display more rows returned by the query.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:120-133"],
      },
      {
        q: "Will a table show rows beyond the assistant's 60-row view?",
        a: "Yes. The assistant is shown at most 60 rows, while a result table or chart can show all rows returned by the query.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:120-133"],
      },
      {
        q: "What does a truncated result mean?",
        a: "More rows matched than the query limit allowed, so the returned rows and any numbers based on them may not cover every match.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:95-107", "src/lib/products/databrain-ai/query/execute.ts:127-133"],
      },
      {
        q: "Are aggregate totals included if a result was truncated?",
        a: "No. The executor sets totals to null when rows were cut off.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:95-107"],
      },
      {
        q: "What can I do if a query takes too long?",
        a: "Narrow the date range or add a filter, then try again; the query runner reports a timeout instead of silently retrying the same scan.",
        evidence: ["src/lib/products/databrain-ai/query/execute.ts:110-115", "src/lib/products/databrain-ai/engine.ts:216-218"],
      },
      {
        q: "Can a query plan run arbitrary database commands?",
        a: "No. The model supplies a structured plan that is validated and translated into an allowlisted read-only aggregation pipeline.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:1-4", "src/lib/products/databrain-ai/query/translate.ts:1-8", "src/lib/products/databrain-ai/query/translate.ts:21-37"],
      },
      {
        q: "Can DataBrain combine filters with OR?",
        a: "The query-plan documentation specifies that filters are ANDed, so each listed filter narrows the result.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:91-95"],
      },
      {
        q: "Does DataBrain keep the model's raw database query?",
        a: "The model produces a declarative plan, not a Mongo query; the server validates field names against the user's catalog before execution.",
        evidence: ["src/lib/products/databrain-ai/query/plan.ts:1-4", "src/lib/products/databrain-ai/query/validate.ts:6-14"],
      },
      {
        q: "Are DataBrain's answers streamed word by word?",
        a: "No. The route streams status events while it works, then returns the completed structured answer blocks.",
        evidence: ["src/lib/products/databrain-ai/engine.ts:17-24", "src/components/products/databrain-ai/ChatWorkspace.tsx:172-213"],
      },
      {
        q: "Can DataBrain show a chart as well as written text?",
        a: "Yes. The answer renderer supports structured answer blocks, including tables and charts.",
        evidence: ["src/components/products/databrain-ai/AnswerBlocks.tsx:8-14", "src/components/products/databrain-ai/AnswerBlocks.tsx:155-220"],
      },
      {
        q: "Can I download a DataBrain result table?",
        a: "Yes. The table block includes a CSV download control.",
        evidence: ["src/components/products/databrain-ai/AnswerBlocks.tsx:95-130"],
      },
      {
        q: "Can I copy a result table into a spreadsheet?",
        a: "Yes. Use Copy as table to copy a tab-separated version that can be pasted into a spreadsheet.",
        evidence: ["src/components/products/databrain-ai/AnswerBlocks.tsx:76-94", "src/components/products/databrain-ai/AnswerBlocks.tsx:40-50"],
      },
      {
        q: "Can I copy a written DataBrain answer?",
        a: "Yes. The answer view provides a Copy answer control.",
        evidence: ["src/components/products/databrain-ai/ChatWorkspace.tsx:14-32", "src/components/products/databrain-ai/ChatWorkspace.tsx:66-79"],
      },
      {
        q: "Can I see how the assistant calculated a result?",
        a: "The answer view includes a How Calculated section based on the queries used for the response.",
        evidence: ["src/components/products/databrain-ai/ChatWorkspace.tsx:70-79", "src/components/products/databrain-ai/AnswerBlocks.tsx:220-251"],
      },
      {
        q: "Can I continue asking follow-up questions in a conversation?",
        a: "Yes. DataBrain stores conversations and sends a bounded amount of earlier text as context for follow-up turns.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:71-89", "src/lib/products/databrain-ai/conversations.ts:120-133", "src/lib/products/databrain-ai/turn.ts:48-60"],
      },
      {
        q: "How is a new DataBrain conversation titled?",
        a: "Its title comes from the first question, with whitespace normalized and long titles shortened to 80 characters.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:20", "src/lib/products/databrain-ai/conversations.ts:65-76"],
      },
      {
        q: "Can I delete one of my DataBrain conversations?",
        a: "Yes. Deleting a conversation removes its messages and conversation record; the action only accepts the signed-in user's own conversation.",
        evidence: ["src/app/(products)/databrain-ai/(protected)/actions.ts:8-18", "src/lib/products/databrain-ai/conversations.ts:92-99"],
      },
      {
        q: "Can I open another user's DataBrain history if I know its ID?",
        a: "No. Conversation reads and message history are keyed to the signed-in user, and another user's ID is treated as unavailable.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:7-11", "src/lib/products/databrain-ai/conversations.ts:80-84", "src/lib/products/databrain-ai/turn.ts:39-44"],
      },
      {
        q: "How many earlier messages can DataBrain use as context?",
        a: "The model context defaults to the latest 12 successful messages, subject to a 6,000-character budget.",
        evidence: ["src/lib/products/databrain-ai/conversations.ts:120-133"],
      },
      {
        q: "Does DataBrain retain query result rows in the question audit event?",
        a: "No. The audit event records the question, entities, query and row counts, and outcome—not the returned result rows.",
        evidence: ["src/lib/products/databrain-ai/turn.ts:71-77"],
      },
      {
        q: "Can DataBrain answer before OpenAI is configured?",
        a: "No. The turn preflight returns a setup message before processing the question if OpenAI is not configured.",
        evidence: ["src/lib/products/databrain-ai/turn.ts:26-32"],
      },
      {
        q: "Can a suspended or read-only workspace ask DataBrain questions?",
        a: "No. The preflight checks the workspace AI plan block before it creates or answers the turn.",
        evidence: ["src/lib/products/databrain-ai/turn.ts:34-39"],
      },
      {
        q: "Does DataBrain use my company's local time zone for date reporting?",
        a: "Yes. The catalog includes the company time zone, and query results format date values using that time zone.",
        evidence: ["src/lib/products/databrain-ai/catalog/view.ts:59-60", "src/lib/products/databrain-ai/catalog/view.ts:88-90", "src/lib/products/databrain-ai/query/execute.ts:36-49"],
      },
      {
        q: "Why might a DataBrain answer not include a product's data?",
        a: "An entity may be unavailable because its module is not enabled, its plan does not include it, or your access does not grant it.",
        evidence: ["src/lib/products/databrain-ai/catalog/view.ts:59-74", "src/lib/products/databrain-ai/query/validate.ts:64-70"],
      },
    ],
  },
  {
    id: "resolveiq",
    title: "ResolveIQ",
    href: productPath("support"),
    items: [
      {
        q: "Where can I look for instructions before contacting support?",
        a: "Open the Help Center to browse published guides and FAQs, or search by topic, feature or error.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:9-25"],
      },
      {
        q: "Does the Help Center show unpublished draft articles?",
        a: "No. The customer Help Center lists published articles only.",
        evidence: ["src/lib/support/articles.ts:49-55", "src/lib/support/articles.ts:58-60"],
      },
      {
        q: "Can I search the Help Center for a feature or error?",
        a: "Yes. Search matches article titles, summaries, bodies and tags, and ranks title matches above body matches.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:11-16", "src/lib/support/articles.ts:20-45"],
      },
      {
        q: "Are help guides grouped by category?",
        a: "Yes. The Help Center groups its results under each article's category.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:15-18", "src/app/(products)/resolveiq/(protected)/help/page.tsx:29-34"],
      },
      {
        q: "What happens if my Help Center search has no matches?",
        a: "The page says no guides matched and offers a link to the Help Assistant or a new support request.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:20-25"],
      },
      {
        q: "Can I read a full help article and then contact support?",
        a: "Yes. An article page displays its body and has a Contact support link if it did not solve the issue.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/[slug]/page.tsx:12-23"],
      },
      {
        q: "What does the ResolveIQ Help Assistant use to answer?",
        a: "It searches relevant published help articles and is instructed to answer only from those article references.",
        evidence: ["src/lib/support/ai.ts:18-20", "src/lib/support/ai.ts:78-85", "src/lib/support/ai.ts:96-105"],
      },
      {
        q: "How many help articles can the assistant search for one question?",
        a: "It retrieves up to five matching articles for an answer.",
        evidence: ["src/lib/support/ai.ts:94-100"],
      },
      {
        q: "Can I see which articles informed a Help Assistant answer?",
        a: "Yes. The answer can show up to three linked help-article sources.",
        evidence: ["src/lib/support/ai.ts:100-114", "src/components/support/HelpChat.tsx:105-112"],
      },
      {
        q: "What if the help articles do not answer my question?",
        a: "The assistant says it could not find the answer and offers to help prepare a support request instead of guessing.",
        evidence: ["src/lib/support/ai.ts:78-85", "src/lib/support/ai.ts:98-114", "src/components/support/HelpChat.tsx:135-145"],
      },
      {
        q: "What if there are no relevant articles and the assistant has no AI connection?",
        a: "If no article matches, it returns the no-information response and indicates that a support request is needed.",
        evidence: ["src/lib/support/ai.ts:96-99"],
      },
      {
        q: "Can the assistant answer questions unrelated to using this workspace?",
        a: "It is instructed to decline requests unrelated to using the workspace and to keep answers grounded in the help articles.",
        evidence: ["src/lib/support/ai.ts:78-85"],
      },
      {
        q: "Does the Help Assistant use my company's OpenAI key?",
        a: "No. Help Assistant model calls use SelfRun AI's platform-owner connection, not the asking company's key.",
        evidence: ["src/lib/support/ai.ts:18-20", "src/lib/support/ai.ts:37-49"],
      },
      {
        q: "How long can a Help Assistant question be?",
        a: "The assistant accepts questions up to 1,000 characters.",
        evidence: ["src/lib/support/ai.ts:23", "src/lib/support/ai.ts:86-91", "src/components/support/HelpChat.tsx:139-147"],
      },
      {
        q: "Does the Help Assistant remember the conversation while I move around the workspace?",
        a: "The browser tab stores the conversation in session storage and restores it across page changes and product switches; it keeps the latest 30 turns.",
        evidence: ["src/components/support/HelpChat.tsx:22-44"],
      },
      {
        q: "Does the assistant use my current product or page as context?",
        a: "Yes. The current product, page, route or feature is passed as context to help choose relevant articles; that context is not treated as factual evidence.",
        evidence: ["src/lib/support/ai.ts:62-70", "src/lib/support/ai.ts:84-85", "src/lib/support/ai.ts:94-105"],
      },
      {
        q: "Can I ask a suggested Help Assistant question with one click?",
        a: "Yes. On the Help Assistant page, suggestions are taken from the first four published article titles.",
        evidence: ["src/app/(products)/resolveiq/(protected)/assistant/page.tsx:12-19", "src/components/support/HelpChat.tsx:73-82"],
      },
      {
        q: "Can the Help Assistant prepare a support request from our chat?",
        a: "Yes. It can draft a title, description, type, priority and category from the conversation for you to review.",
        evidence: ["src/lib/support/ai.ts:125-163", "src/components/support/HelpChat.tsx:45-58", "src/components/support/HelpChat.tsx:120-132"],
      },
      {
        q: "Is a support request saved as soon as the assistant drafts it?",
        a: "No. The assistant opens a review form; edit the draft and send it to create the request.",
        evidence: ["src/app/(products)/resolveiq/actions.ts:23-31", "src/components/support/HelpChat.tsx:120-132"],
      },
      {
        q: "Can I create a support request without using the assistant?",
        a: "Yes. Use New Request and fill in the request form directly.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/new/page.tsx:10-22", "src/components/support/RequestForm.tsx:45-83"],
      },
      {
        q: "Which request types can I choose from?",
        a: "The form loads the currently active request types and their type-specific fields from support configuration.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/new/page.tsx:14-17", "src/app/(products)/resolveiq/actions.ts:47-57", "src/components/support/RequestForm.tsx:86-108"],
      },
      {
        q: "Can support request fields change depending on the request type?",
        a: "Yes. Each selected type can display its own required or optional text, textarea and select fields.",
        evidence: ["src/components/support/RequestForm.tsx:86-108", "src/lib/support/requests.ts:77-91"],
      },
      {
        q: "Does a bug report have extra fields?",
        a: "For a bug-type request, the form can ask for severity and an optional error message.",
        evidence: ["src/components/support/RequestForm.tsx:124-143"],
      },
      {
        q: "Can I choose the priority of a request?",
        a: "Yes. Choose from the active priority options supplied to the request form.",
        evidence: ["src/components/support/RequestForm.tsx:66-76", "src/app/(products)/resolveiq/actions.ts:47-57"],
      },
      {
        q: "Is request category required?",
        a: "No. Category is optional, and the form includes a Not sure choice.",
        evidence: ["src/components/support/RequestForm.tsx:126-137"],
      },
      {
        q: "How long can a request title be?",
        a: "The form allows up to 160 characters; the server trims the submitted title to that limit.",
        evidence: ["src/components/support/RequestForm.tsx:78-81", "src/lib/support/requests.ts:77-83"],
      },
      {
        q: "How long can a support request description be?",
        a: "The description field allows up to 8,000 characters, and the server validates the same maximum.",
        evidence: ["src/components/support/RequestForm.tsx:82-85", "src/lib/support/requests.ts:77-84"],
      },
      {
        q: "What file types can I attach to a support request?",
        a: "Attachments may be images, PDF files or plain text files.",
        evidence: ["src/components/support/attachments.tsx:8-10", "src/components/support/attachments.tsx:57-67"],
      },
      {
        q: "How many files can I attach to one support request?",
        a: "The form accepts up to five files, with a maximum of 4 MB per file.",
        evidence: ["src/components/support/attachments.tsx:8-10", "src/components/support/attachments.tsx:17-33", "src/components/support/attachments.tsx:57-67"],
      },
      {
        q: "Can I paste a screenshot into the request description?",
        a: "Yes. Pasting an image from the clipboard into the description attaches it as a file.",
        evidence: ["src/components/support/attachments.tsx:39-47", "src/components/support/RequestForm.tsx:82-85"],
      },
      {
        q: "Can I remove an uploaded attachment before sending?",
        a: "Yes. Each attachment chip has a remove control before you submit the request.",
        evidence: ["src/components/support/attachments.tsx:73-88"],
      },
      {
        q: "Does ResolveIQ fill in my device details for a support request?",
        a: "When browser context is available, the form sends your product, page, browser, operating system and device details automatically.",
        evidence: ["src/components/support/RequestForm.tsx:31-35", "src/components/support/RequestForm.tsx:146-155", "src/lib/support/requests.ts:51-66"],
      },
      {
        q: "Can I include an error message with a bug report?",
        a: "Yes. Bug-type requests show an optional error-message field, up to 2,000 characters.",
        evidence: ["src/components/support/RequestForm.tsx:138-143", "src/lib/support/requests.ts:51-66"],
      },
      {
        q: "Can I find a request by its number?",
        a: "Yes. My Requests search accepts a title or request number.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/page.tsx:25-36", "src/lib/support/requests.ts:143-151"],
      },
      {
        q: "Can I filter my requests by status?",
        a: "Yes. The list offers Open, Waiting for you, Resolved and Closed status filters.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/page.tsx:17-36"],
      },
      {
        q: "Can I see support replies on my request?",
        a: "Yes. The request detail page shows the conversation thread and its attachments.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/[id]/page.tsx:38-65"],
      },
      {
        q: "Can I reply to an existing support request?",
        a: "Yes. The request detail page includes a reply box, unless the request is closed.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/[id]/page.tsx:67-69", "src/lib/support/requests.ts:220-232"],
      },
      {
        q: "What if I need to add a file but no reply text?",
        a: "A reply can contain a message or attachments; it is rejected only when both are empty.",
        evidence: ["src/lib/support/requests.ts:220-226"],
      },
      {
        q: "Can I reply to a closed request?",
        a: "No. ResolveIQ asks you to create a new request when the existing request is closed.",
        evidence: ["src/lib/support/requests.ts:227-232", "src/app/(products)/resolveiq/(protected)/requests/[id]/page.tsx:67-69"],
      },
      {
        q: "Can I view another company's support request?",
        a: "No. Request reads are scoped to the company associated with your signed-in workspace.",
        evidence: ["src/lib/support/caller.ts:12-21", "src/lib/support/requests.ts:153-161"],
      },
      {
        q: "Can I see the attachments and extra fields I submitted?",
        a: "Yes. The request detail shows submitted attachments and any type-specific fields saved with the request.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/[id]/page.tsx:38-49"],
      },
      {
        q: "How do I know a new request was created?",
        a: "The form confirms the request number and gives you a link to open its details.",
        evidence: ["src/components/support/RequestForm.tsx:52-61"],
      },
      {
        q: "Will the support team know when I create a request?",
        a: "Yes. After a successful submission, ResolveIQ notifies support staff about the new request.",
        evidence: ["src/app/(products)/resolveiq/actions.ts:33-43"],
      },
      {
        q: "Will support staff be notified when I reply?",
        a: "Yes. A successful company reply triggers a staff notification for the request.",
        evidence: ["src/app/(products)/resolveiq/actions.ts:45-56"],
      },
      {
        q: "How many AI help calls can I make in an hour?",
        a: "The verified limit is 60 AI calls per user per UTC hour; when you reach it, the assistant suggests trying later or creating a request.",
        evidence: ["src/lib/support/caller.ts:24-31", "src/app/(products)/resolveiq/actions.ts:11-19"],
      },
      {
        q: "Does creating a request use the AI help-call allowance?",
        a: "The allowance is checked for asking the assistant and drafting from chat; direct request submission uses a separate action.",
        evidence: ["src/app/(products)/resolveiq/actions.ts:15-31", "src/app/(products)/resolveiq/actions.ts:33-43"],
      },
      {
        q: "Can an assistant draft choose a request type that is no longer active?",
        a: "No. The draft validates its suggested type, priority and category against active configuration and falls back when a choice is invalid.",
        evidence: ["src/lib/support/ai.ts:125-163"],
      },
      {
        q: "What if the assistant cannot prepare a machine-generated request draft?",
        a: "It has a fallback that builds a short title and description from the conversation and selects available default type and priority options.",
        evidence: ["src/lib/support/ai.ts:130-144", "src/lib/support/ai.ts:145-163"],
      },
      {
        q: "Can the Help Center search show more than 50 matching guides?",
        a: "The search page requests up to 50 matches; without a search it lists up to 200 published articles.",
        evidence: ["src/app/(products)/resolveiq/(protected)/help/page.tsx:11-14", "src/lib/support/articles.ts:49-55"],
      },
      {
        q: "Can I report a feature idea or feedback as well as a problem?",
        a: "Yes. The New Request screen describes support requests for questions, problems, feature ideas and feedback.",
        evidence: ["src/app/(products)/resolveiq/(protected)/requests/new/page.tsx:18-22"],
      },
      {
        q: "Can I include the Help Assistant conversation with a support request?",
        a: "Yes. Requests drafted from chat are submitted with the conversation, and the saved record keeps up to 20 turns.",
        evidence: ["src/components/support/HelpChat.tsx:120-132", "src/lib/support/requests.ts:99-105"],
      },
    ],
  },
  {
    id: "huddle-ai",
    title: "Huddle AI",
    href: productPath("messenger"),
    items: [
      {
        q: "What kinds of conversations are available in Huddle AI?",
        a: "Huddle supports team and project channels, direct messages, and named groups.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:8-18", "src/components/products/huddle-ai/types.ts:1-3"],
      },
      {
        q: "Can I browse public team channels I have not joined?",
        a: "Yes. Public team channels you are not already in appear in the browse-channels list.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:185-196"],
      },
      {
        q: "Can I join a public team channel myself?",
        a: "Yes. A public team channel can be read and self-joined by a Huddle user.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:14-18", "src/app/(products)/huddle-ai/(protected)/channels/actions.ts:49-62"],
      },
      {
        q: "Can I join a private channel if I have its link?",
        a: "A private team channel requires an invitation from a member; the join action rejects a non-admin who is not already a member.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:14-18", "src/app/(products)/huddle-ai/(protected)/channels/actions.ts:49-57"],
      },
      {
        q: "Can I create a team channel?",
        a: "Users with channel-creation permission can create a team channel and choose its visibility.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:20-47"],
      },
      {
        q: "Can I set a channel name and description?",
        a: "Yes. Channel creation takes a name and optional description; channel details can also be edited later.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:20-47", "src/app/(products)/huddle-ai/(protected)/channels/actions.ts:99-114"],
      },
      {
        q: "Who can edit a channel's details?",
        a: "Workspace chat admins and channel owners or admins can edit the channel's name, description, topic and visibility.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:99-114"],
      },
      {
        q: "Can a channel member add people to a private channel?",
        a: "Only a workspace chat admin or a channel owner/admin can add members to a private channel.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:64-78"],
      },
      {
        q: "Can I leave a channel without being an admin?",
        a: "Yes. A regular member can remove themselves; removing another person requires moderation rights.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:80-97"],
      },
      {
        q: "Who can change a channel member's role?",
        a: "A workspace chat admin or the channel owner can change member roles.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:99-107"],
      },
      {
        q: "Can a channel be archived and later reopened?",
        a: "Yes. The channel owner or a chat admin can archive or unarchive it.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/channels/actions.ts:116-130"],
      },
      {
        q: "Can people still post in an archived channel?",
        a: "No. Archived channels are read-only.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:126-142"],
      },
      {
        q: "Can I see channel members and their roles?",
        a: "Yes. Channel details has a Members tab with names and non-member role labels.",
        evidence: ["src/components/products/huddle-ai/ChannelWorkspace.tsx:23-41", "src/components/products/huddle-ai/ChannelWorkspace.tsx:102-140"],
      },
      {
        q: "Where can I find a pinned channel message?",
        a: "Open channel Details and select the Pinned tab to review pinned messages.",
        evidence: ["src/components/products/huddle-ai/ChannelWorkspace.tsx:56-75", "src/components/products/huddle-ai/ChannelWorkspace.tsx:143-158"],
      },
      {
        q: "Where do I find files shared in a channel?",
        a: "Open channel Details and select Files; each listed item links to its file.",
        evidence: ["src/components/products/huddle-ai/ChannelWorkspace.tsx:56-75", "src/components/products/huddle-ai/ChannelWorkspace.tsx:160-183"],
      },
      {
        q: "Are project channels public?",
        a: "No. Project channels are private and bound to a SprintOS project.",
        evidence: ["src/lib/products/huddle-ai/channels.ts:8-12", "src/lib/products/huddle-ai/projects.ts:58-81"],
      },
      {
        q: "Who is added to a SprintOS project channel?",
        a: "Active SprintOS project members and the project manager are mapped to Huddle accounts; employees without a Huddle login are not added.",
        evidence: ["src/lib/products/huddle-ai/projects.ts:18-22", "src/lib/products/huddle-ai/projects.ts:57-66"],
      },
      {
        q: "Do project channel names stay in sync with SprintOS?",
        a: "Yes. The sync routine updates a project's channel name and description when the SprintOS project changes.",
        evidence: ["src/lib/products/huddle-ai/projects.ts:104-120"],
      },
      {
        q: "What happens to a project channel if its SprintOS project is cancelled?",
        a: "The project channel is archived and its history is retained.",
        evidence: ["src/lib/products/huddle-ai/projects.ts:52-56"],
      },
      {
        q: "Does Huddle create a project channel when nobody has a Huddle account?",
        a: "No. If there are no project members with Huddle accounts to add, channel creation waits until a later sync.",
        evidence: ["src/lib/products/huddle-ai/projects.ts:69-82"],
      },
      {
        q: "Can I send a direct message to a coworker?",
        a: "Yes. Starting a direct message opens the existing or newly created one-to-one conversation with that person.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/dm/actions.ts:8-18", "src/app/(products)/huddle-ai/(protected)/dm/[conversationId]/page.tsx:19-44"],
      },
      {
        q: "Can I pin a direct-message conversation?",
        a: "Yes. The direct-message action toggles the conversation's pinned state for your account.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/dm/actions.ts:18-24"],
      },
      {
        q: "Can I see whether the other person is online?",
        a: "The direct-message header receives the other person's presence status and last-active time.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/dm/[conversationId]/page.tsx:26-38"],
      },
      {
        q: "Can a message contain only an attachment?",
        a: "Yes. A message is accepted with text or at least one attachment; a completely empty message is rejected.",
        evidence: ["src/lib/products/huddle-ai/messages.ts:297-302"],
      },
      {
        q: "How long can a Huddle message be?",
        a: "A message body can contain up to 8,000 characters.",
        evidence: ["src/lib/products/huddle-ai/messages.ts:297-302"],
      },
      {
        q: "Can I mention a teammate in a message?",
        a: "Yes. Type @ to find channel or conversation members and select a matching person.",
        evidence: ["src/components/products/huddle-ai/MessageComposer.tsx:78-85", "src/components/products/huddle-ai/MessageComposer.tsx:193-202", "src/components/products/huddle-ai/MessageComposer.tsx:228-240"],
      },
      {
        q: "Can I notify everyone in a channel with a mention?",
        a: "The composer recognizes @channel and @here, and the message service treats either as a broadcast mention.",
        evidence: ["src/components/products/huddle-ai/MessageComposer.tsx:107-116", "src/lib/products/huddle-ai/messages.ts:478-498"],
      },
      {
        q: "Do all channel messages send a personal notification?",
        a: "No. Channel messages notify mentioned members; other members get a lightweight activity update. Direct messages notify the recipient.",
        evidence: ["src/lib/products/huddle-ai/messages.ts:478-507"],
      },
      {
        q: "Do direct messages show read receipts?",
        a: "Yes. The chat view tracks the other participant's read sequence for the double-check receipt.",
        evidence: ["src/components/products/huddle-ai/ChatView.tsx:52-53", "src/components/products/huddle-ai/ChatView.tsx:68-82"],
      },
      {
        q: "Can I reply to a specific message in a thread?",
        a: "Yes. Open a message thread and send a reply scoped to its parent message.",
        evidence: ["src/components/products/huddle-ai/ChatView.tsx:164-170", "src/components/products/huddle-ai/MessageComposer.tsx:25-35", "src/lib/products/huddle-ai/messages.ts:252-265"],
      },
      {
        q: "Can I load older messages in a conversation?",
        a: "Yes. The chat loads older messages in pages of 40 when you request more.",
        evidence: ["src/components/products/huddle-ai/ChatView.tsx:143-160"],
      },
      {
        q: "Can I edit another person's Huddle message?",
        a: "No. The message service only allows the author to edit their own message.",
        evidence: ["src/lib/products/huddle-ai/messages.ts:448-460"],
      },
      {
        q: "Can I add an emoji reaction to a message?",
        a: "Yes. Use the reaction control; reactions are grouped by emoji and updated in real time.",
        evidence: ["src/components/products/huddle-ai/ChatView.tsx:106-119", "src/components/products/huddle-ai/ChatView.tsx:172-178", "src/lib/products/huddle-ai/messages.ts:489-516"],
      },
      {
        q: "Can I forward a message to another conversation?",
        a: "Yes. Forwarding reposts the message body and attachments, and records the original author and source conversation label.",
        evidence: ["src/lib/products/huddle-ai/messages.ts:424-446"],
      },
      {
        q: "Can I delete a message after sending it?",
        a: "Yes. The chat offers a delete action; other open clients receive an update that hides the message body and attachments.",
        evidence: ["src/components/products/huddle-ai/ChatView.tsx:180-187", "src/components/products/huddle-ai/ChatView.tsx:102-105"],
      },
      {
        q: "Can I share files in a Huddle channel or DM?",
        a: "Yes. The composer uploads files against the current channel or direct-message scope before sending them with a message.",
        evidence: ["src/components/products/huddle-ai/MessageComposer.tsx:87-104", "src/components/products/huddle-ai/MessageComposer.tsx:125-139"],
      },
      {
        q: "Can I record a voice note in the message composer?",
        a: "Yes. The composer can record microphone audio as a voice-note attachment and add it to the message.",
        evidence: ["src/components/products/huddle-ai/MessageComposer.tsx:151-189"],
      },
      {
        q: "Can I search messages and people across Huddle?",
        a: "Yes. Global search has result types for messages, channels and users, limited to scopes and content the caller may access.",
        evidence: ["src/lib/products/huddle-ai/search.ts:10-17", "src/lib/products/huddle-ai/search.ts:31-59"],
      },
      {
        q: "Does Huddle's global search find files or projects?",
        a: "Not currently. The search implementation returns empty results for files, projects and groups.",
        evidence: ["src/lib/products/huddle-ai/search.ts:14-28", "src/lib/products/huddle-ai/search.ts:79-83"],
      },
      {
        q: "Can search show messages from private channels I cannot access?",
        a: "No. Message search is restricted to visible channels and direct-message conversations resolved for the signed-in user.",
        evidence: ["src/lib/products/huddle-ai/search.ts:10-13", "src/lib/products/huddle-ai/search.ts:31-40"],
      },
      {
        q: "Can I send an announcement to only selected people?",
        a: "Announcements can target everyone, selected roles, HRMS departments or specific channels.",
        evidence: ["src/lib/products/huddle-ai/announcements.ts:10-18", "src/lib/products/huddle-ai/announcements.ts:119-156"],
      },
      {
        q: "Who is allowed to write Huddle announcements?",
        a: "Announcement authoring is limited to users with the configured announcement permission, including super admins, chat admins or HR roles.",
        evidence: ["src/lib/products/huddle-ai/announcements.ts:10-13", "src/app/(products)/huddle-ai/(protected)/announcements/actions.ts:14-21"],
      },
      {
        q: "Can I save an announcement and publish it later?",
        a: "Yes. The composer supports saving a draft, scheduling it, or publishing it immediately.",
        evidence: ["src/components/products/huddle-ai/AnnouncementComposer.tsx:90-121", "src/app/(products)/huddle-ai/(protected)/announcements/actions.ts:22-69"],
      },
      {
        q: "Can an announcement require readers to acknowledge it?",
        a: "Yes. Enable confirmation tracking; Huddle records reads and provides reader and unread statistics.",
        evidence: ["src/lib/products/huddle-ai/announcements.ts:10-13", "src/lib/products/huddle-ai/announcements.ts:192-228", "src/app/(products)/huddle-ai/(protected)/announcements/actions.ts:78-83"],
      },
      {
        q: "Can an announcement be cross-posted to a channel?",
        a: "Yes. The announcement includes a cross-post option, enabled by default in the composer.",
        evidence: ["src/components/products/huddle-ai/AnnouncementComposer.tsx:37-45", "src/app/(products)/huddle-ai/(protected)/announcements/actions.ts:40-48"],
      },
      {
        q: "Can an announcement have an importance level?",
        a: "Yes. Choose Normal, Important or Critical priority.",
        evidence: ["src/lib/products/huddle-ai/announcements.ts:24-31", "src/components/products/huddle-ai/AnnouncementComposer.tsx:30-35"],
      },
      {
        q: "Can I attach files to an announcement?",
        a: "Yes. The composer uploads attachments and the save action keeps up to ten attachments on an announcement.",
        evidence: ["src/components/products/huddle-ai/AnnouncementComposer.tsx:52-70", "src/app/(products)/huddle-ai/(protected)/announcements/actions.ts:40-48"],
      },
      {
        q: "Can I set an RSVP for a Huddle meeting?",
        a: "Yes. Meeting invitees can respond Yes, No or Maybe.",
        evidence: ["src/lib/products/huddle-ai/meetings.ts:24-27", "src/app/(products)/huddle-ai/(protected)/meetings/actions.ts:97-103"],
      },
      {
        q: "Can I start an instant meeting or schedule one for later?",
        a: "Yes. Meetings support instant and scheduled types; scheduled meetings require a start time.",
        evidence: ["src/lib/products/huddle-ai/meetings.ts:24-25", "src/app/(products)/huddle-ai/(protected)/meetings/actions.ts:22-36"],
      },
      {
        q: "Can I invite people to a meeting?",
        a: "Yes. The meeting form accepts invitees, and the meeting service stores participant records.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/meetings/actions.ts:15-20", "src/app/(products)/huddle-ai/(protected)/meetings/actions.ts:38-50", "src/lib/products/huddle-ai/meetings.ts:40-48"],
      },
      {
        q: "Does a meeting have a linked chat?",
        a: "Yes. Meetings have a linked group channel for meeting chat and shared files.",
        evidence: ["src/lib/products/huddle-ai/meetings.ts:15-17", "src/lib/products/huddle-ai/meetings.ts:36-38", "src/app/(products)/huddle-ai/(protected)/meetings/[id]/page.tsx:65-74"],
      },
      {
        q: "Can I see who is attending or has responded to a meeting?",
        a: "The meeting details list participants, who is currently in the call, and RSVP labels for invitees who are not in it.",
        evidence: ["src/lib/products/huddle-ai/meetings.ts:199-219", "src/app/(products)/huddle-ai/(protected)/meetings/[id]/page.tsx:80-104"],
      },
      {
        q: "Can I use scheduled meetings for real remote video calls?",
        a: "Meeting records and invitations are implemented, but the documented meeting transport is local-only: it shows the joiner's own camera and has no remote streams.",
        evidence: ["src/app/(products)/huddle-ai/(protected)/meetings/page.tsx:68-74", "src/lib/products/huddle-ai/meeting-transport.ts:36-75", "src/lib/products/huddle-ai/meetings.ts:10-17"],
      },
    ],
  },
];
