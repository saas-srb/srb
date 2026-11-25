/** What the shared record writers (vendor, vendor bill, client) take and return, whichever product's screen called them. */
export interface RecordActor {
  id: string;
  email: string;
}

export interface RecordWriteResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}
