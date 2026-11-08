import { connectionValues } from "@/lib/platform/connections/resolve";
import { getServiceAccountToken } from "@/lib/google-service-account";

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export interface IndexingResponse {
  success: boolean;
  url: string;
  type: IndexingNotificationType;
  message?: string;
  data?: unknown;
}

/**
 * Publishes a URL update or deletion notice to Google's Indexing API.
 */
export async function notifyGoogleIndexing(
  targetUrl: string,
  type: IndexingNotificationType = "URL_UPDATED"
): Promise<IndexingResponse> {
  const sa = await connectionValues("google-service-account");
  const clientEmail = sa?.clientEmail;
  const privateKey = sa?.privateKey;

  if (!clientEmail || !privateKey) {
    return {
      success: false,
      url: targetUrl,
      type,
      message: "Google isn't connected for this workspace. Add your service account in Workspace → Settings → Integrations.",
    };
  }

  try {
    const accessToken = await getServiceAccountToken({ clientEmail, privateKey }, ["https://www.googleapis.com/auth/indexing"]);

    const apiRes = await fetch("https://indexing.googleapis.com/v1/urlNotifications:publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        type,
      }),
    });

    const resData = await apiRes.json();

    if (!apiRes.ok) {
      return {
        success: false,
        url: targetUrl,
        type,
        message: `Google Indexing API error (${apiRes.status})`,
        data: resData,
      };
    }

    return {
      success: true,
      url: targetUrl,
      type,
      message: "Successfully published notification to Google Indexing API.",
      data: resData,
    };
  } catch (err) {
    return {
      success: false,
      url: targetUrl,
      type,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
