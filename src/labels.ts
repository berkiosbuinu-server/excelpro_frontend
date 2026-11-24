import type { Order } from "./api";

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erreur inconnue");

export const LABELS: Record<string, string> = {
  windows: "Windows", android: "Android", linux: "Linux", ios: "iOS", macos: "macOS", web: "Web",
};
export const STATUS: Record<string, string> = {
  submitted: "Vérification à payer", checking: "Vérification en cours", report_ready: "Rapport disponible",
  in_progress: "Conversion en cours", ready: "Prête",
};
export const VERDICTS: Record<string, string> = {
  convertible: "Convertible en l'état", convertible_with_changes: "Convertible après adaptations", not_convertible: "Non convertible en l'état",
};
export const ITEM_STATUS: Record<string, string> = { ok: "Fonctionne", partial: "Partiellement", fail: "Ne fonctionne pas" };
export const ITEM_ICON: Record<string, string> = { ok: "✔", partial: "~", fail: "✖" };
export const CATEGORIES: Record<string, string> = {
  feuilles: "Feuilles", formules: "Formules", vba: "Macros VBA", userforms: "UserForms", donnees: "Données", autre: "Autres éléments",
};
export const PROVIDERS: Record<string, string> = { stripe: "carte", mpesa: "M-PESA", orange: "Orange Money", airtel: "Airtel Money", transfer: "transfert mobile money" };
export const PAY_STATUS: Record<string, string> = { pending: "en attente de vérification", succeeded: "confirmé", failed: "refusé" };

export const STEPS = ["submitted", "checking", "report_ready", "in_progress", "ready"] as const;
export const STEP_SHORT = ["Soumise", "Vérification", "Rapport", "Conversion", "Prête"];

/** Ce que la personne doit payer maintenant sur une commande (null : rien à payer pour l'instant). */
export function purposeOf(o: Order): "check" | "conversion" | null {
  if (!o.check_paid) return "check";
  if (o.status === "report_ready" && !o.paid && o.check_report?.verdict !== "not_convertible") return "conversion";
  return null;
}
