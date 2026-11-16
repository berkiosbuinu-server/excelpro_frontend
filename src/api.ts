const BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type Pricing = {
  platforms: Record<string, number>;
  hosting: { name: string; price_usd: number; users: number; features: string[] }[];
  payment_mode: string;
  transfer_number?: string;
  whatsapp_contact?: string;
  payment_methods: { stripe: boolean; mobile_money: { id: string; label: string; number?: string }[] };
  check_fee_rates: { per_interface: string; per_macro: string; per_formula: string; per_mb: string; minimum: string };
};
export type ItemStatus = "ok" | "partial" | "fail";
export type Verdict = "convertible" | "convertible_with_changes" | "not_convertible";
export type CheckItem = { category: string; name: string; status: ItemStatus; details: string };
export type CheckReport = {
  verdict: Verdict;
  summary: string;
  tested_on: string;
  statistics: { label: string; value: number }[];
  items: CheckItem[];
  reported_at: string;
};
export type ChecklistRow = { category: string; name: string; detail: string; hint: "review" | "risk" };
export type ReportInput = { verdict: Verdict; summary: string; tested_on: string; items: CheckItem[] };
export type Payment = {
  id: number;
  provider: string;
  purpose: "check" | "conversion";
  amount_cents: number;
  status: "pending" | "succeeded" | "failed";
  reference: string | null;
  phone: string | null;
  has_proof?: boolean;
};
export type Message = { id: number; from_admin: boolean; body: string; created_at: string };
export type Conversation = { user_id: number | null; email: string; name: string | null; unread: number; last_at: string; messages: Message[] };
export type Delivery = { id: number; platform: string; filename: string };
export type Analysis = {
  sheet_count: number;
  formula_count: number;
  has_vba: boolean;
  warnings: string[];
};
export type Order = {
  id: number;
  app_name: string;
  original_filename: string;
  platforms: string[];
  total_usd: number;
  status: "submitted" | "checking" | "report_ready" | "in_progress" | "ready";
  paid: boolean;
  created_at: string;
  analysis: Analysis | null;
  claim_key: string | null;
  user_email: string | null;
  deliveries: Delivery[];
  payments: Payment[];
  check_fee_cents: number;
  check_paid: boolean;
  check_report: CheckReport | null;
  check_checklist: ChecklistRow[] | null;
};

export type CellValue = number | string | boolean | null | { e: string };
export type SheetCell = { a: string; v: CellValue; f?: string };
export type PreviewSheet = { name: string; hidden: boolean; hidden_rows: number[]; hidden_columns: number[]; cells: SheetCell[] };
export type PreviewWorkbook = { name: string; has_macros: boolean; sheets: PreviewSheet[] };
export type MacroInfo = { module: string; name: string; kind: "sub" | "function"; public: boolean; parameters: number };
export type ControlFont = { name?: string; size?: number; bold?: boolean; italic?: boolean; align?: number };
export type FormControl = {
  name: string; type: string; caption: string; left: number; top: number; width: number; height: number; tab: number; value: string; synthetic?: boolean;
  font?: ControlFont; fore?: string; back?: string; password?: string; approx?: boolean;
};
export type FormEventInfo = { control: string; event: string; proc: string };
export type FormLayout = {
  name: string; caption: string; width: number; height: number; layout: "frm" | "binary" | "inferred"; controls: FormControl[]; events: FormEventInfo[];
  picture?: string;
};
export type Preview = { id: string; filename: string; workbook: PreviewWorkbook; macros: MacroInfo[]; parse_errors: { module: string; error: string }[]; forms?: FormLayout[] };
export type ControlProps = Record<string, string | number | boolean | null | string[]>;
export type ControlState = { form: string; name: string; props: ControlProps };
export type FormEventBody = {
  form: string; proc: string; controls: Record<string, ControlProps>; edits: Record<string, string>; inputs: string[];
  active_sheet?: string; shown_forms: string[];
};
/** Où le Runner prend ses données : le serveur du site (téléversement) ou le runner natif (paquet local). */
export type RunnerSource = {
  open(): Promise<Preview>;
  recalc(edits: Record<string, string>): Promise<{ workbook: PreviewWorkbook }>;
  macro(body: { macro: string; edits: Record<string, string>; inputs: string[]; active_sheet?: string; shown_forms: string[] }): Promise<MacroRun>;
  formEvent(body: FormEventBody): Promise<MacroRun>;
  close(): void;
};
export type MacroRun = {
  status: "ok" | "vba_error";
  macro: string;
  steps: number;
  elapsed_ms: number;
  messages: string[];
  ignored: string[];
  actions: string[];
  changes_total: number;
  changes: { sheet: string; cell: string; before: CellValue; after: CellValue }[];
  error?: { number: number; description: string; procedure: string; line: number; fatal_limit: boolean };
  workbook?: PreviewWorkbook;
  controls?: ControlState[];
  forms_shown?: string[];
};

export const money = (cents: number) => `${(cents / 100).toFixed(2)} $`;

let token: string | null = null;
try {
  token = localStorage.getItem("excelpro_token");
} catch {
  /* stockage indisponible */
}

export function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem("excelpro_token", t);
    else localStorage.removeItem("excelpro_token");
  } catch {
    /* ignoré */
  }
}
export const hasToken = () => token !== null;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* corps non JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  pricing: () => request<Pricing>("/pricing"),
  register: (email: string, password: string) =>
    request<{ token: string; role: string }>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<{ token: string; role: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<{ email: string; role: string }>("/auth/me"),
  hostingConfig: () => request<{ enabled: boolean; server_url: string }>("/hosting/config"),
  hostingToken: () => request<{ token: string; expires_at: number; server_url: string; tenant: string }>("/hosting/token", { method: "POST" }),
  createOrder: (form: FormData) => request<Order>("/orders", { method: "POST", body: form }),
  myOrders: () => request<Order[]>("/orders"),
  autoReportBlob: async (orderId: number) => {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(BASE + `/orders/${orderId}/auto-report.pdf`, { headers });
    if (!res.ok) {
      let message = `Erreur ${res.status}`;
      try { const data = await res.json(); message = data.detail ?? message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return res.blob();
  },
  previewOpen: (file: File) => {
    const f = new FormData();
    f.append("file", file);
    return request<Preview>("/preview", { method: "POST", body: f });
  },
  previewRecalc: (id: string, edits: Record<string, string>) =>
    request<{ workbook: PreviewWorkbook }>(`/preview/${id}/recalc`, { method: "POST", body: JSON.stringify({ edits }) }),
  previewMacro: (id: string, body: { macro: string; edits: Record<string, string>; inputs: string[]; active_sheet?: string; shown_forms?: string[] }) =>
    request<MacroRun>(`/preview/${id}/macro`, { method: "POST", body: JSON.stringify(body) }),
  previewFormEvent: (id: string, body: FormEventBody) =>
    request<MacroRun>(`/preview/${id}/form-event`, { method: "POST", body: JSON.stringify(body) }),
  previewClose: (id: string) => request<{ ok: boolean }>(`/preview/${id}`, { method: "DELETE" }),
  claim: (key: string) =>
    request<{ app_name: string; files: Delivery[] }>("/claim", { method: "POST", body: JSON.stringify({ key }) }),
  payStripe: (orderId: number) => request<{ url: string }>(`/payments/orders/${orderId}/stripe`, { method: "POST" }),
  payMobileMoney: (orderId: number, operator: string, phone: string, transaction_ref: string) =>
    request<{ payment: Payment; instructions: string }>(`/payments/orders/${orderId}/mobile-money`, {
      method: "POST",
      body: JSON.stringify({ operator, phone, transaction_ref }),
    }),
  payTransfer: (orderId: number, form: FormData) =>
    request<Payment>(`/payments/orders/${orderId}/transfer`, { method: "POST", body: form }),
  messages: () => request<Message[]>("/messages"),
  unread: () => request<{ count: number }>("/messages/unread"),
  sendMessage: (body: string) => request<Message>("/messages", { method: "POST", body: JSON.stringify({ body }) }),
  contact: (name: string, email: string, body: string) =>
    request<{ ok: boolean }>("/contact", { method: "POST", body: JSON.stringify({ name, email, body }) }),
  adminConversations: () => request<Conversation[]>("/admin/messages"),
  adminReply: (userId: number, body: string) =>
    request<Message>(`/admin/messages/${userId}`, { method: "POST", body: JSON.stringify({ body }) }),
  adminMarkRead: (userId: number) => request<{ ok: boolean }>(`/admin/messages/${userId}/read`, { method: "POST" }),
  adminPayment: (paymentId: number, action: "confirm" | "reject") =>
    request<Order>(`/admin/payments/${paymentId}/${action}`, { method: "POST" }),
  adminOrders: () => request<Order[]>("/admin/orders"),
  adminAction: (id: number, action: "start" | "ready") =>
    request<Order>(`/admin/orders/${id}/${action}`, { method: "POST" }),
  adminMarkPaid: (id: number, purpose: "check" | "conversion") =>
    request<Order>(`/admin/orders/${id}/paid?purpose=${purpose}`, { method: "POST" }),
  adminSubmitReport: (id: number, body: ReportInput) =>
    request<Order>(`/admin/orders/${id}/check-report`, { method: "POST", body: JSON.stringify(body) }),
  adminDeliver: (id: number, platform: string, file: File) => {
    const f = new FormData();
    f.append("platform", platform);
    f.append("file", file);
    return request<Order>(`/admin/orders/${id}/deliveries`, { method: "POST", body: f });
  },
};

async function saveBlob(path: string, extraHeaders: Record<string, string>, filename: string) {
  const headers = new Headers(extraHeaders);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadDelivery = (d: Delivery, key: string) =>
  saveBlob(`/claim/${d.id}/download`, { "X-Claim-Key": key.trim() }, d.filename);

export const downloadSource = (o: Order) => saveBlob(`/admin/orders/${o.id}/source`, {}, o.original_filename);

export async function openProof(paymentId: number) {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`${BASE}/admin/payments/${paymentId}/proof`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Capture introuvable (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url; else window.location.href = url;
  } catch (e) {
    win?.close();
    throw e;
  }
}

export const FALLBACK_TRANSFER_NUMBER = "+243813780223";
export const FALLBACK_WHATSAPP = "243820586551";
export const whatsappUrl = (number: string, text: string) => `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

/** Source du site : le fichier est téléversé au serveur, qui le garde le temps du test. */
export function webSource(file: File): RunnerSource {
  let id: string | null = null;
  const need = () => { if (!id) throw new Error("Aperçu non ouvert"); return id; };
  return {
    open: async () => { const p = await api.previewOpen(file); id = p.id; return p; },
    recalc: (edits) => api.previewRecalc(need(), edits),
    macro: (b) => api.previewMacro(need(), b),
    formEvent: (b) => api.previewFormEvent(need(), b),
    close: () => { if (id) api.previewClose(id).catch(() => undefined); },
  };
}
