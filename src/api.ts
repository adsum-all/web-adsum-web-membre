// Thin client for the ADSUM API. The base URL is configurable so the app can
// point at the deployed API (https://adsum-api.vercel.app) or a local one.

import { computePhash } from "./phash.js";
import { signalerFinDeSession } from "./sessionExpiree.js";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://adsum-api.vercel.app";

/** Bilingual user-facing message for errors thrown outside React (no useT here).
 * Reads the language the UI persists in localStorage; returns French by default. */
function apiMsg(fr: string, en: string): string {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("adsum.lang") === "en" ? en : fr;
  } catch {
    return fr;
  }
}

export interface Me {
  id: string;
  email: string;
  role: string;
  membre_id: string | null;
}

export interface MembreProfile {
  id: string;
  matricule: string;
  code_membre: string | null;
  email: string;
  nom: string | null;
  prenoms: string | null;
  nom_affichage: string;
  nom_naissance: string | null;
  nom_marital: string | null;
  nom_affiche: string | null;
  est_berger: boolean;
  berger_declare: boolean;
  berger_nom_declare: string | null;
  equipe_dirigeante_declaree?: boolean;
  nom_pastoral: string | null;
  nom_pastoral_affiche: string | null;
  fonction_perimetre: string | null;
  fonctions: { libelle: string; perimetre: string | null; cle: string | null; categorie: CategorieAttribution; abreviation: string | null }[];
  // Resolved organisational appellation (central resolver: special function >
  // title > function > particular > civil name), ready to display as-is.
  appellation: string;
  appellation_formelle: string;
  categorie_principale: string;
  telephone: string | null;
  indicatif_telephone: string | null;
  whatsapp_numero: string | null;
  groupe: string | null;
  photo_url: string | null;
  photo_pending: boolean;
  photo_focus_x: number | null;
  photo_focus_y: number | null;
  statut: string;
  verifie: boolean;
  genre: string | null;
  date_naissance: string | null;
  naissance_annee_visible: boolean;
  pays: string | null;
  region: string | null;
  ville: string | null;
  adresse: string | null;
  adresse_complement: string | null;
  date_entree: string | null;
  cheminement_pastoral: string | null;
  statut_administratif: string | null;
  type_membre: string | null;
  promotion: string | null;
  situation_matrimoniale: string | null;
  type_mariage: string | null;
  /** In a relationship progressing toward marriage (single/in-couple only). */
  en_cheminement: boolean | null;
  profession: string | null;
  niveau_etudes: string | null;
  baptise: boolean | null;
  confirme: boolean | null;
  premiere_communion: boolean | null;
  commission: string | null;
  commission_type: string | null;
  intendance: string | null;
  intendant: string | null;
  intendant_titre: string | null;
  berger: string | null;
  tribu: string | null;
  patriarche: string | null;
  coordination: string | null;
  coordination_id?: string | null;
  coordinateur: string | null;
  coordinateur_titre: string | null;
  champs_deverrouilles: string[];
  langue: string;
  theme: "light" | "dark" | "system";
  titre?: string | null;
  fonction_cle?: string | null;
  fonction_confirmee: boolean;
  commission_id?: string | null;
  intendance_id?: string | null;
  tribu_id?: string | null;
  anniversaire_visible_annuaire: boolean;
}

export interface EvenementOut {
  id: string;
  titre: string;
  type: string | null;
  /** Catalogue event type (name + unique colour), used to colour and label the calendar. */
  type_evenement_id?: string | null;
  type_evenement_nom?: string | null;
  couleur?: string | null;
  volet: string;
  debut: string;
  fin: string | null;
  lieu: string | null;
  session_ouverte: boolean;
  lien_session: string | null;
  liens: string[];
  mode?: string | null;
  type_diffusion: "embed" | "externe" | "aucun";
  visibilite: "public" | "membres" | "prive";
  cible_type?: "general" | "coordination" | "commission" | "intendance" | "tribu" | "bergers" | "responsables" | "liste";
  cible_id?: string | null;
  cible_libelle?: string | null;
  tags?: { id: string; cle: string; libelle: string }[];
  /** Editorial detail shown to the member on the activity card (public information). */
  description?: string | null;
  intervenant_principal?: string | null;
  intervenants?: string[];
  phase: "a_venir" | "bientot" | "en_cours" | "termine";
  joignable: boolean;
  formulaire_ouvert: boolean;
}

/** A public attachment of an activity, opened inside the app (never leaves it). */
export interface PieceEvenement {
  id: string;
  nom: string;
  type: string;
  taille: number;
  url: string;
  cree_le?: string | null;
}

/** An application the connected member has been granted access to (LEVEL 1: visibility). */
export interface ApplicationAccessible {
  code: string;
  nom: string;
  description?: string | null;
  url?: string | null;
  actif: boolean;
  acces_actif: boolean;
  /** True when the member can actually CONNECT (default app, or at least one access
   * group tied to the application). Visibility alone shows the card only. */
  ouvrable?: boolean;
}

export function getMesApplications(token: string): Promise<ApplicationAccessible[]> {
  return authedGet<ApplicationAccessible[]>(
    "/api/v1/membres/me/applications",
    token,
    apiMsg("Applications indisponibles", "Applications unavailable"),
  );
}

export function getEvenementPieces(token: string, eventId: string): Promise<PieceEvenement[]> {
  return authedGet<PieceEvenement[]>(
    `/api/v1/membres/me/evenements/${eventId}/pieces`,
    token,
    apiMsg("Documents indisponibles", "Documents unavailable"),
  );
}

export type CategorieAttribution = "titre" | "fonction_speciale" | "fonction" | "fonction_particuliere";

export interface FonctionItem {
  cle: string;
  libelle_h: string;
  libelle_f: string;
  libelle_n: string;
  categorie: CategorieAttribution;
  abreviation: string | null;
  est_vip: boolean;
  ordre: number;
  actif: boolean;
}

export interface AnniversaireOut {
  id: string;
  prenoms: string;
  nom: string;
  photo_url: string | null;
  jour: number;
  mois: number;
  commission?: string | null;
  est_vip: boolean;
  titre?: string | null;
  // Category-aware birthday label ("Modérateur (Berger David)", "Berger David",
  // "Resp. Jean DUPONT"), resolved server-side. Falls back to the civil name.
  appellation?: string | null;
  categorie_principale?: string | null;
}

export type AnniversaireCategorie =
  | "moi"
  | "vip"
  | "responsables"
  | "commission"
  | "tribu"
  | "coordination"
  | "intendance"
  | "direction"
  | "coordinateurs"
  | "bergers"
  | "patriarches";

export interface NotifPreferences {
  evenements: boolean;
  demandes: boolean;
  rappels: boolean;
  email: boolean;
  telegram: boolean;
  whatsapp: boolean;
  sms: boolean;
  anniversaire: boolean;
  anniv_pairs: boolean;
  cal_vip: boolean;
  cal_responsables: boolean;
  cal_commission: boolean;
  cal_tribu: boolean;
  cal_coordination: boolean;
  cal_intendance: boolean;
  // Per-group, per-channel matrix. Keys are notification groups; each maps to the
  // channels that group is delivered on (in-app is always on and not listed here).
  matrice_canaux: Record<string, { email?: boolean; telegram?: boolean; whatsapp?: boolean; sms?: boolean }>;
  // Whether a Telegram chat is actually bound to this member (true only after the member
  // completed the secure link with the confirmation code). Drives the "Linked" indicator.
  telegram_lie?: boolean;
}

export interface QuestionItem {
  id: string;
  libelle: string;
  type: string;
  options: string[];
}

export interface QuestionnaireMembre {
  disponible: boolean;
  deja_repondu?: boolean;
  fenetre_heures?: number;
  titre?: string;
  questions: QuestionItem[];
}

export interface PresenceOut {
  evenement_id: string;
  evenement_titre: string;
  debut: string | null;
  arrivee: string | null;
  depart: string | null;
  methode: string | null;
}

export interface QrToken {
  token: string;
  membre_id: string;
  issued_at: string;
  expires_at: string;
  key_version: number;
}

export interface Recensement {
  id: string;
  annee: number;
  statut: string;
  ouvert: boolean;
  deja_repondu: boolean;
}

export interface DocumentItem {
  id: string;
  type: string | null;
  statut: string;
  demande_le: string | null;
  recu_le: string | null;
  traite_le: string | null;
}

export interface EngagementItem {
  id: string;
  type: string | null;
  version: string;
  signe: boolean;
  signe_le: string | null;
}

export interface ConsentSummary {
  cle: string;
  version: string;
  titre: string;
  bloquant: boolean;
  ordre: number;
}

export interface ConsentDoc {
  cle: string;
  version: string;
  titre: string;
  contenu: string;
}

export interface SignatureRef {
  cle: string;
  version: string;
}

export interface NotificationItem {
  id: string;
  type: string | null;
  titre: string | null;
  corps: string | null;
  lu: boolean;
  cree_le: string | null;
}

/** One notification as served by the categorized center. */
export interface NotifCentreItem {
  id: string;
  type: string | null;
  categorie: string;
  priorite: string;
  action_requise: boolean;
  titre: string | null;
  corps: string | null;
  lu: boolean;
  lu_le: string | null;
  cree_le: string | null;
}

export interface NotifCentrePage {
  items: NotifCentreItem[];
  total: number;
  non_lus: number;
  page: number;
  pages: number;
  limit: number;
}

export interface NotifCentreParams {
  onglet?: "toutes" | "non_lues" | "lues" | "actions" | "systeme";
  categorie?: string;
  mois?: number;
  annee?: number;
  q?: string;
  limit?: number;
  offset?: number;
}

/** A terminated activity carrying the member's OFFICIAL survey participation status. */
export interface ActivitePasseeItem {
  id: string;
  titre: string;
  type: string | null;
  couleur: string | null;
  mode: string | null;
  debut: string | null;
  fin: string | null;
  lieu: string | null;
  statut_personnel: "present" | "participe_en_ligne" | "partiel" | "absent" | "non_repondu" | "cloture_sans_reponse";
  source: string | null;
  repondu_le: string | null;
}

export interface ActivitesPasseesPage {
  items: ActivitePasseeItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

/** One identity-check (scan) record. A scan is not proof of participation. */
export interface ControleAccesItem {
  evenement_id: string;
  evenement_titre: string | null;
  debut: string | null;
  lieu: string | null;
  arrivee: string | null;
  depart: string | null;
  mode: string | null;
  methode: string | null;
  resultat: string;
}

export interface ControlesPage {
  items: ControleAccesItem[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/** Read the JSON error body (FastAPI `detail`) without throwing on a non-JSON
 * response, so the caller can surface the precise reason for a 4xx. */
async function readDetail(res: Response): Promise<unknown> {
  try {
    const data = (await res.clone().json()) as { detail?: unknown };
    return data?.detail ?? data;
  } catch {
    return undefined;
  }
}

/** Tell the application shell the session is over, with the reason the server gives.
 *  Called from every authenticated helper: a member left on a screen that no longer
 *  works, with a red "Session expirée" banner, reads as a defect rather than the
 *  ordinary end of a session. */
function reporterFinDeSession(res: Response): void {
  const motif = res.headers.get("X-Session-Fin");
  signalerFinDeSession(motif === "inactivite" ? "inactivite" : motif === "revoquee" ? "revoquee" : "expiree");
}

async function authedGet<T>(path: string, token: string, onError: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) reporterFinDeSession(res);
    throw new ApiError(res.status === 401 ? apiMsg("Session expirée", "Session expired") : onError, res.status);
  }
  return (await res.json()) as T;
}

export interface LoginResult {
  // When the second factor is required, otpRequired is true and token is empty;
  // the caller then collects the code and calls loginVerify.
  otpRequired: boolean;
  token: string | null;
  doitChangerMdp: boolean;
  canal: string | null;
  // Canonical account e-mail once the password is validated, so a matricule or
  // member-code sign-in still drives the e-mail based first-login flow correctly.
  email: string | null;
}

/** Stable per-device id kept in localStorage, sent so the server can remember a
 * trusted device for 30 days. A random UUID, never personal data. */
export function deviceId(): string {
  if (typeof localStorage === "undefined") return "";
  let id = localStorage.getItem("adsum.device.id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("adsum.device.id", id);
  }
  return id;
}

function loginError(status: number): ApiError {
  if (status === 401) return new ApiError(apiMsg("Identifiants invalides ou mot de passe temporaire expiré", "Invalid credentials or expired temporary password"), status);
  if (status === 429) return new ApiError(apiMsg("Trop de tentatives de connexion. Patientez quelques minutes, puis réessayez.", "Too many sign-in attempts. Wait a few minutes, then try again."), status);
  if (status === 400) return new ApiError(apiMsg("Code incorrect ou expiré. Vérifiez et réessayez.", "Incorrect or expired code. Check and try again."), status);
  return new ApiError(apiMsg("Service momentanément indisponible. Réessayez dans un instant.", "Service temporarily unavailable. Try again shortly."), status);
}

/** Sign in with an identifier that may be the e-mail, the ADSUM matricule or the
 * member code. The server resolves it to the account. */
export async function login(identifiant: string, password: string): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ identifiant, password }),
    });
  } catch {
    throw new ApiError(apiMsg("Connexion au serveur impossible. Vérifiez votre réseau.", "Cannot reach the server. Check your network."), 0);
  }
  if (!res.ok) throw loginError(res.status);
  const data = (await res.json()) as { otp_required?: boolean; access_token?: string | null; doit_changer_mdp?: boolean; canal?: string | null; email?: string | null };
  return {
    otpRequired: Boolean(data.otp_required),
    token: data.access_token ?? null,
    doitChangerMdp: Boolean(data.doit_changer_mdp),
    canal: data.canal ?? null,
    email: data.email ?? null,
  };
}

/** Second step of a 2FA login: send the one-time code (and optionally trust this
 * device for 30 days) to obtain the session token. */
export async function loginVerify(
  identifiant: string,
  password: string,
  code: string,
  faireConfiance: boolean,
): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/auth/login-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ identifiant, password, code, faire_confiance: faireConfiance }),
    });
  } catch {
    throw new ApiError(apiMsg("Connexion au serveur impossible. Vérifiez votre réseau.", "Cannot reach the server. Check your network."), 0);
  }
  if (!res.ok) throw loginError(res.status);
  const data = (await res.json()) as { access_token?: string | null; doit_changer_mdp?: boolean; email?: string | null };
  return { otpRequired: false, token: data.access_token ?? null, doitChangerMdp: Boolean(data.doit_changer_mdp), canal: null, email: data.email ?? null };
}

/** Re-send the login code on a chosen channel. Telegram is the default at login;
 * the member can switch to e-mail (or SMS once enabled) or simply resend. Returns the
 * channel actually used, so the screen can say where the code was sent. */
export async function requestLoginCode(identifiant: string, canal: "email" | "telegram" | "sms" | "auto"): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/auth/login-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiant, canal }),
    });
  } catch {
    throw new ApiError(apiMsg("Connexion au serveur impossible. Vérifiez votre réseau.", "Cannot reach the server. Check your network."), 0);
  }
  if (!res.ok) throw loginError(res.status);
  const data = (await res.json()) as { canal?: string };
  return data.canal ?? canal;
}

export interface MfaAppareil {
  id: string;
  libelle: string;
  cree_le: string | null;
  dernier_usage: string | null;
  expire_le: string | null;
}

export interface MfaState {
  // Reinforced mode chosen by the member (shorter trust window).
  actif: boolean;
  // Whether 2FA is active on the account at all (baseline enforced or opted in).
  verification_active: boolean;
  canal: "auto" | "telegram" | "email";
  recommander: boolean;
  relance_forte: boolean;
  // Whether the account belongs to staff (2FA is mandatory for staff).
  est_staff: boolean;
  // Whether a login code is (or will be) required for this account.
  obligatoire: boolean;
  // Days left before 2FA becomes mandatory for a plain member; null when already obliged.
  jours_avant_obligation: number | null;
  appareils: MfaAppareil[];
}

export async function getMfaState(token: string): Promise<MfaState> {
  const res = await fetch(`${BASE}/api/v1/membres/me/mfa`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(apiMsg("Impossible de charger l'état de la double authentification.", "Could not load the two-factor authentication status."), res.status);
  return (await res.json()) as MfaState;
}

export async function setDoubleFacteur(token: string, actif: boolean): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/membres/me/double-facteur`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ actif }),
  });
  if (!res.ok) throw new ApiError(apiMsg("Modification impossible pour le moment.", "Change not possible right now."), res.status);
}

export async function setMfaCanal(token: string, canal: "auto" | "telegram" | "email"): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/membres/me/mfa-canal`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ canal }),
  });
  if (!res.ok) throw new ApiError(apiMsg("Modification impossible pour le moment.", "Change not possible right now."), res.status);
}

export async function revokeAppareilConfiance(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/membres/me/appareils-confiance/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Révocation impossible pour le moment.", "Revocation not possible right now."), res.status);
}

export interface ConnexionSession {
  id: string;
  courante: boolean;
  ouverte: boolean;
  appareil: string | null;
  adresse: string | null;
  lieu: string | null;
  ouverte_le: string | null;
  fermee_le: string | null;
  revoquee: boolean;
}

export interface ConnexionsPage {
  items: ConnexionSession[];
  total: number;
  page: number;
  taille: number;
  pages: number;
  ouvertes: number;
  autres_ouvertes: number;
}

export async function getConnexions(token: string, page = 1, taille = 10): Promise<ConnexionsPage> {
  const res = await fetch(`${BASE}/api/v1/membres/me/connexions?page=${page}&taille=${taille}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Impossible de charger l'historique des connexions.", "Could not load the connection history."), res.status);
  return (await res.json()) as ConnexionsPage;
}

export async function fermerAutresConnexions(token: string): Promise<{ fermees: number }> {
  const res = await fetch(`${BASE}/api/v1/membres/me/connexions/fermer-autres`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Fermeture impossible pour le moment.", "Could not close the other sessions right now."), res.status);
  return (await res.json()) as { fermees: number };
}

export async function premiereConnexion(
  email: string,
  mdpTemporaire: string,
  nouveauMdp: string,
  codeOtp: string,
): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/auth/premiere-connexion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, mdp_temporaire: mdpTemporaire, nouveau_mdp: nouveauMdp, code_otp: codeOtp }),
  });
  if (!res.ok) {
    throw new ApiError(res.status === 400 ? apiMsg("Code ou mot de passe invalide", "Invalid code or password") : apiMsg("Validation impossible", "Validation failed"), res.status);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export function getMe(token: string): Promise<Me> {
  return authedGet<Me>("/api/v1/auth/me", token, apiMsg("Session expirée", "Session expired"));
}

/** Detect the device IANA time zone (e.g. "Europe/Paris"), no geolocation prompt. */
export function detectFuseau(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** Report the member's detected time zone so server messages localize correctly. */
export async function setFuseau(token: string, fuseau: string): Promise<void> {
  if (!fuseau) return;
  await fetch(`${BASE}/api/v1/membres/me/fuseau`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fuseau }),
  });
}

export function getMembreProfile(token: string): Promise<MembreProfile> {
  return authedGet<MembreProfile>("/api/v1/membres/me", token, apiMsg("Profil indisponible", "Profile unavailable"));
}

export type InformationPriorite = "normale" | "importante" | "urgente";

/** An institutional Information as seen by a member, with their own read/confirm state. */
export interface InformationMembre {
  id: string;
  titre: string;
  sous_titre: string | null;
  contenu: string;
  priorite: InformationPriorite;
  auteur: string | null;
  signature: string | null;
  signature_url: string | null;
  requiert_accuse: boolean;
  lecture_vocale_auto: boolean;
  lien_url: string | null;
  action_label: string | null;
  action_url: string | null;
  audio_url: string | null;
  image_url: string | null;
  document_url: string | null;
  expire_le: string | null;
  epingle_jusqu: string | null;
  cree_le: string | null;
  envoye_le: string | null;
  lu: boolean;
  confirme: boolean;
  lu_le?: string | null;
  confirme_le?: string | null;
}

export interface InformationsFeedPage {
  items: InformationMembre[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface InformationsFeedParams {
  priorite?: "importante" | "urgente" | "normale";
  lecture?: "lu" | "non_lu";
  q?: string;
  mois?: number;
  annee?: number;
  type_contenu?: "audio" | "document" | "lien" | "texte";
  auteur?: string;
  limit?: number;
  offset?: number;
}

/** Active high-priority Informations for the discreet open-app banner. */
export interface InformationPrioritaire {
  id: string;
  titre: string | null;
  sous_titre: string | null;
  priorite: InformationPriorite;
  expire_le: string | null;
}

export function getInformationsPrioritaires(token: string): Promise<InformationPrioritaire[]> {
  return authedGet<InformationPrioritaire[]>("/api/v1/membres/me/informations/prioritaires", token, apiMsg("Informations indisponibles", "Information unavailable"));
}

/** Paginated, filterable, searchable member feed for the Informations tab. */
export function getMesInformationsFeed(token: string, params: InformationsFeedParams = {}): Promise<InformationsFeedPage> {
  return authedGet<InformationsFeedPage>(`/api/v1/membres/me/informations/feed${toQuery({ ...params })}`, token, apiMsg("Informations indisponibles", "Information unavailable"));
}

export function getMesInformations(token: string): Promise<InformationMembre[]> {
  return authedGet<InformationMembre[]>("/api/v1/membres/me/informations", token, apiMsg("Informations indisponibles", "Information unavailable"));
}

/** Fetching the detail records the read server side (never a list view or a push). */
export function getInformation(token: string, id: string): Promise<InformationMembre> {
  return authedGet<InformationMembre>(`/api/v1/membres/me/informations/${id}`, token, apiMsg("Information indisponible", "Information unavailable"));
}

export function compteurInformations(token: string): Promise<{ non_lus: number }> {
  return authedGet<{ non_lus: number }>("/api/v1/membres/me/informations/compteur", token, apiMsg("Compteur indisponible", "Counter unavailable"));
}

export function confirmerInformation(token: string, id: string): Promise<{ ok: boolean; confirme_le: string | null }> {
  return authedPost<{ ok: boolean; confirme_le: string | null }>(`/api/v1/membres/me/informations/${id}/confirmer`, token, {}, apiMsg("Confirmation impossible", "Confirmation failed"));
}

/** Server-side neural reading of a content (cached). 503 when no TTS provider is
 * configured in Réglages IA; the caller then falls back to the device voice. */
export function synthetiserTexte(token: string, texte: string, genre: "homme" | "femme"): Promise<{ mime: string; audio: string; cache: boolean }> {
  return authedPost<{ mime: string; audio: string; cache: boolean }>("/api/v1/membres/me/tts", token, { texte, genre }, apiMsg("Synthèse vocale indisponible", "Voice synthesis unavailable"));
}

export interface MembreConsultation {
  id: string;
  titre: string;
  description: string | null;
  evenement_id: string | null;
}

export interface ConsultationQuestion {
  id: string;
  libelle: string;
  type: string;
  options: string[];
}

export interface ConsultationDetail {
  id: string;
  titre: string;
  description: string | null;
  statut: string;
  questions: ConsultationQuestion[];
}

export function getMesConsultations(token: string): Promise<MembreConsultation[]> {
  return authedGet<MembreConsultation[]>("/api/v1/membres/me/consultations", token, apiMsg("Consultations indisponibles", "Consultations unavailable"));
}

export function getConsultationDetail(token: string, id: string): Promise<ConsultationDetail> {
  return authedGet<ConsultationDetail>(`/api/v1/membres/me/consultations/${id}`, token, apiMsg("Consultation indisponible", "Consultation unavailable"));
}

export function repondreConsultation(
  token: string,
  id: string,
  reponses: { question_id: string; valeur: string }[],
): Promise<{ ok: boolean; enregistrees: number }> {
  return authedPost(`/api/v1/membres/me/consultations/${id}/reponses`, token, { reponses }, apiMsg("Envoi impossible", "Sending failed"));
}

export function getEvenements(token: string): Promise<EvenementOut[]> {
  return authedGet<EvenementOut[]>("/api/v1/membres/me/evenements", token, apiMsg("Activités indisponibles", "Activities unavailable"));
}

// Reference dates (institutional commemorations + catholic feasts) shown in the
// calendar. They are NOT activities: never a survey, attendance or QR (est_activite
// is always false). description is server-sanitised HTML.
export interface DateReferenceOccurrence {
  source_id: string;
  origine: string;
  categorie: string;
  type: string | null;
  titre: string;
  date: string;
  couleur: string | null;
  couleur_hex: string | null;
  priorite: string | null;
  rang: string | null;
  toute_journee: boolean;
  anciennete: number | null;
  description: string | null;
  image_url: string | null;
  lieu: string | null;
  lien: string | null;
  message_membre: string | null;
  source: string | null;
  badge: string;
  est_activite: boolean;
}

export function getDatesReference(token: string, annee: number): Promise<{ annee: number; occurrences: DateReferenceOccurrence[] }> {
  return authedGet(`/api/v1/membres/me/calendrier/dates-reference?annee=${annee}`, token, apiMsg("Dates de référence indisponibles", "Reference dates unavailable"));
}

/** Download the member's reference-date iCalendar (.ics) for a year. */
export async function telechargerDatesReferenceICS(token: string, annee: number): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/membres/me/calendrier/dates-reference.ics?annee=${annee}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(apiMsg("Export impossible", "Export failed"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dates-reference-${annee}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getFonctions(token: string): Promise<FonctionItem[]> {
  return authedGet<FonctionItem[]>("/api/v1/fonctions", token, apiMsg("Fonctions indisponibles", "Functions unavailable"));
}

export interface UniteHierarchie {
  nom: string | null;
  responsable: string | null;
  fonction: string;
}

export interface HierFonction {
  fonction: string;
  categorie: string;
  perimetre: string | null;
  principale: boolean;
  abreviation: string | null;
  depuis: string | null;
}
export interface HierNiveau {
  rang: string;
  fonction: string;
  unite: string | null;
  occupants: { nom: string; interim?: boolean }[];
  vacant: boolean;
  interim?: boolean;
  titulaire?: string | null;
}
export interface HierChaine {
  titre: string;
  niveaux: HierNiveau[];
}
export interface HierLien {
  type: string;
  libelle: string;
  detail: string | null;
}
export interface HierAppui {
  type: string; // "vice" | "interim"
  fonction: string;
  perimetre: string | null;
  detail: string | null;
  depuis: string | null;
  jusqu_au: string | null;
}
export interface HierActeur {
  nom: string;
  role: string;
  vacant?: boolean;
}
export interface HierRattachement {
  type: string;
  nom: string | null;
  mon_role: string;
  titulaire: string | null;
  responsables?: HierActeur[];
  appui?: HierActeur[];
  patriarche?: string | null;
  principal: boolean;
}

export interface MaHierarchie {
  moi: { nom: string | null; est_berger: boolean; nom_pastoral: string | null };
  position_principale: HierFonction | null;
  fonctions: HierFonction[];
  chaines: HierChaine[];
  titres: HierLien[];
  appui_suppleance: HierAppui[];
  liens_particuliers: HierLien[];
  rattachements: HierRattachement[];
  // backward-compatible fields
  commission: UniteHierarchie | null;
  coordination: UniteHierarchie | null;
  intendance: UniteHierarchie | null;
  tribu: { nom: string | null; patriarche: string | null } | null;
  chaine_fonctionnelle: { fonction: string; titulaire: string | null }[];
}

export function getMaHierarchie(token: string): Promise<MaHierarchie> {
  return authedGet<MaHierarchie>("/api/v1/membres/me/hierarchie", token, apiMsg("Hiérarchie indisponible", "Hierarchy unavailable"));
}

// Organisation chart types, kept in exact sync with the back-office (adsum-back-office
// src/api.ts) so the SAME React-Flow renderer draws the published version identically.
export type OrgVersionStatut = "brouillon" | "publie" | "archive";
export interface OrganigrammeVersion {
  id: string;
  libelle: string;
  statut: OrgVersionStatut;
  note: string | null;
  cree_le: string;
  publie_le: string | null;
}
export type OrgNodeType = "personne" | "structure" | "groupe" | "separateur" | "note" | "zone";
export type OrgCategorie = "titre" | "fonction_speciale" | "fonction" | "fonction_particuliere" | null;
export type OrgUniteType = "commission" | "coordination" | "intendance" | "tribu" | "college" | "groupe" | null;
export type OrgStatut = "actif" | "vacant" | "attente" | "archive";
export interface OrgNode {
  id: string;
  cle: string;
  type_noeud: OrgNodeType;
  nom: string;
  sous_titre: string | null;
  membre_id: string | null;
  membre_nom: string | null;
  photo_url: string | null;
  afficher_photo: boolean;
  couleur: string | null;
  fonction_cle: string | null;
  categorie: OrgCategorie;
  unite_type: OrgUniteType;
  unite_id: string | null;
  effectif: number | null;
  statut: OrgStatut;
  pos_x: number | null;
  pos_y: number | null;
  largeur: number | null;
  hauteur: number | null;
  ordre: number | null;
}
export type OrgLinkType =
  | "hierarchique"
  | "coordination"
  | "supervision"
  | "suivi_transversal"
  | "responsabilite_tribu"
  | "assistance";
export interface OrgLink {
  id: string;
  source_id: string;
  cible_id: string;
  type_lien: OrgLinkType;
  libelle: string | null;
}
export interface OrgContenu {
  version: OrganigrammeVersion;
  noeuds: OrgNode[];
  liens: OrgLink[];
}
/** The published feed can have no published version yet (version null). */
export interface OrgContenuPublie {
  version: OrganigrammeVersion | null;
  noeuds: OrgNode[];
  liens: OrgLink[];
}
export interface OrgAnomalie {
  code: string;
  libelle: string;
  nombre: number;
}
export interface OrgStatistiques {
  affectations: { effectif_unique: number; affectations_actives: number; membres_en_cumul: number; ecart_cumul: number; principales: number; secondaires: number };
  placement: { membres_places: number; intendances: number; coordinations: number; commissions: number; tribus: number; bergers: number };
  anomalies: OrgAnomalie[];
}
export interface CategorieAttributionOrg {
  code: string;
  label: string;
}
export const CATEGORIES_ATTRIBUTION: readonly CategorieAttributionOrg[] = [
  { code: "titre", label: "Titre" },
  { code: "fonction_speciale", label: "Fonction spéciale" },
  { code: "fonction", label: "Fonction" },
  { code: "fonction_particuliere", label: "Fonction particulière" },
];

export function getOrganigrammePublie(token: string): Promise<OrgContenuPublie> {
  return authedGet<OrgContenuPublie>("/api/v1/organigramme/publie", token, apiMsg("Organigramme indisponible", "Org chart unavailable"));
}
export function getOrganigrammeStatistiques(token: string): Promise<OrgStatistiques> {
  return authedGet<OrgStatistiques>("/api/v1/organigramme/statistiques", token, apiMsg("Statistiques indisponibles", "Statistics unavailable"));
}

/** Back-office controlled display settings for the member hierarchy view. */
export interface OrganigrammeReglages {
  onglets: { chaine: boolean; rattachements: boolean; titres: boolean; organigramme: boolean };
  affichage: "interactif" | "image";
}
export function getOrganigrammeReglages(token: string): Promise<OrganigrammeReglages> {
  return authedGet<OrganigrammeReglages>("/api/v1/organigramme/reglages", token, apiMsg("Réglages indisponibles", "Settings unavailable"));
}

export function getAnniversaires(
  token: string,
  params: { categorie: AnniversaireCategorie; mois?: number },
): Promise<AnniversaireOut[]> {
  const query = new URLSearchParams({ categorie: params.categorie });
  if (params.mois != null) query.set("mois", String(params.mois));
  return authedGet<AnniversaireOut[]>(
    `/api/v1/membres/anniversaires?${query.toString()}`,
    token,
    apiMsg("Anniversaires indisponibles", "Birthdays unavailable"),
  );
}

export function setAnniversaireVisibilite(token: string, visible: boolean): Promise<{ ok: boolean }> {
  return authedPut("/api/v1/membres/me/anniversaire-visibilite", token, { visible }, apiMsg("Mise à jour impossible", "Update failed"));
}

export function getNotifPreferences(token: string): Promise<NotifPreferences> {
  return authedGet<NotifPreferences>("/api/v1/membres/me/preferences-notification", token, apiMsg("Préférences indisponibles", "Preferences unavailable"));
}

export function exportDonneesRGPD(token: string): Promise<Record<string, unknown>> {
  return authedGet<Record<string, unknown>>("/api/v1/membres/me/export", token, apiMsg("Export impossible", "Export failed"));
}

export function setLangue(token: string, langue: "fr" | "en"): Promise<{ ok: boolean; langue: string }> {
  return authedPut("/api/v1/membres/me/langue", token, { langue }, apiMsg("Changement de langue impossible", "Could not change language"));
}

export function setTheme(token: string, theme: "light" | "dark" | "system"): Promise<{ ok: boolean; theme: string }> {
  return authedPut("/api/v1/membres/me/theme", token, { theme }, apiMsg("Changement de thème impossible", "Could not change theme"));
}

export interface TelegramEtat {
  disponible: boolean;
  liee: boolean;
  en_attente_de_code: boolean;
  secondes_restantes: number;
  essais_restants: number;
  lien_demande: boolean;
}

export async function getTelegramEtat(token: string): Promise<TelegramEtat> {
  const res = await fetch(`${BASE}/api/v1/membres/me/telegram`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(apiMsg("Impossible de lire l'état de la liaison Telegram.", "Could not read the Telegram link status."), res.status);
  return (await res.json()) as TelegramEtat;
}

export async function delierTelegram(token: string): Promise<{ liee: boolean }> {
  const res = await fetch(`${BASE}/api/v1/membres/me/telegram`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Déliaison impossible pour le moment.", "Could not unlink right now."), res.status);
  return (await res.json()) as { liee: boolean };
}

export function telegramLien(token: string): Promise<{ deep_link: string }> {
  return authedPost("/api/v1/membres/me/telegram/lien", token, {}, apiMsg("Lien indisponible", "Link unavailable"));
}

export function telegramVerifier(token: string): Promise<{ pending_confirmation: boolean; message?: string }> {
  return authedPost("/api/v1/membres/me/telegram/verifier", token, {}, apiMsg("Vérification impossible", "Verification failed"));
}

export function telegramConfirmer(token: string, code: string): Promise<{ linked: boolean }> {
  return authedPost("/api/v1/membres/me/telegram/confirmer", token, { code }, apiMsg("Confirmation impossible", "Confirmation failed"));
}

export function enregistrerWhatsapp(token: string, numero: string): Promise<{ ok: boolean }> {
  return authedPut("/api/v1/membres/me/whatsapp", token, { numero }, apiMsg("Enregistrement impossible", "Save failed"));
}

export function demanderSuppression(token: string): Promise<{ ok: boolean; demande_id?: string; deja_demandee?: boolean }> {
  return authedPost("/api/v1/membres/me/suppression", token, {}, apiMsg("Demande impossible", "Request failed"));
}

export function setNotifPreferences(token: string, prefs: NotifPreferences): Promise<NotifPreferences> {
  return authedPut<NotifPreferences>("/api/v1/membres/me/preferences-notification", token, prefs, apiMsg("Mise à jour impossible", "Update failed"));
}

export interface ParticipationMembre {
  statut: "present" | "partiel" | "absent" | null;
  source: "scan" | "declaration" | null;
  valide: boolean;
  /** Whether the member has already used their one-time ANONYMOUS evaluation. The
   * content of that evaluation is never returned (no member link exists). */
  deja_evalue: boolean;
  deja_scanne: boolean;
  verrouille: boolean;
  ouvert: boolean;
  disponible_le: string | null;
  /** True once the declaration window is over (server-enforced). */
  cloture?: boolean;
  /** End of the declaration window, so the form can show its deadline. */
  cloture_le?: string | null;
  /** presentiel (proven by scan or declared) or en_ligne (declared). */
  modalite?: "presentiel" | "en_ligne" | null;
}

export function getParticipation(token: string, eventId: string): Promise<ParticipationMembre> {
  return authedGet<ParticipationMembre>(`/api/v1/membres/me/evenements/${eventId}/participation`, token, apiMsg("Participation indisponible", "Participation unavailable"));
}

export function declarerParticipation(
  token: string,
  eventId: string,
  body: { statut?: string; modalite?: "presentiel" | "en_ligne"; avis?: string; note?: number; valider?: boolean },
): Promise<{ ok: boolean; verrouille: boolean; statut: string; message?: string }> {
  return authedPut(`/api/v1/membres/me/evenements/${eventId}/participation`, token, body, apiMsg("Envoi impossible", "Sending failed"));
}

export function getEventQuestionnaire(token: string, eventId: string): Promise<QuestionnaireMembre> {
  return authedGet<QuestionnaireMembre>(
    `/api/v1/membres/me/evenements/${eventId}/questionnaire`,
    token,
    apiMsg("Questionnaire indisponible", "Questionnaire unavailable"),
  );
}

export function submitQuestionnaire(token: string, eventId: string, reponses: Record<string, string>): Promise<{ ok: boolean }> {
  return authedPost<{ ok: boolean }>(
    `/api/v1/membres/me/evenements/${eventId}/questionnaire`,
    token,
    { reponses },
    apiMsg("Envoi impossible", "Sending failed"),
  );
}

export function getHistorique(token: string): Promise<PresenceOut[]> {
  return authedGet<PresenceOut[]>("/api/v1/membres/me/historique", token, apiMsg("Historique indisponible", "History unavailable"));
}

export function getQrToken(token: string): Promise<QrToken> {
  return authedGet<QrToken>("/api/v1/membres/me/qr", token, "QR indisponible");
}

export function getNotifications(token: string): Promise<NotificationItem[]> {
  return authedGet<NotificationItem[]>("/api/v1/membres/me/notifications", token, apiMsg("Notifications indisponibles", "Notifications unavailable"));
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Categorized, paginated, status-aware notification center. */
export function getNotificationsCentre(token: string, params: NotifCentreParams = {}): Promise<NotifCentrePage> {
  return authedGet<NotifCentrePage>(`/api/v1/membres/me/notifications/centre${toQuery({ ...params })}`, token, apiMsg("Notifications indisponibles", "Notifications unavailable"));
}

/** Unread badge count (excludes archived and self-hidden). */
export function compteurNotifications(token: string): Promise<{ non_lus: number }> {
  return authedGet<{ non_lus: number }>("/api/v1/membres/me/notifications/compteur", token, apiMsg("Compteur indisponible", "Counter unavailable"));
}

export function marquerNotificationNonLue(token: string, id: string): Promise<void> {
  return authedPost<void>(`/api/v1/membres/me/notifications/${id}/non-lu`, token, {}, apiMsg("Marquage impossible", "Could not update"));
}

export function masquerNotification(token: string, id: string): Promise<void> {
  return authedPost<void>(`/api/v1/membres/me/notifications/${id}/masquer`, token, {}, apiMsg("Masquage impossible", "Could not hide"));
}

/** Terminated activities with the member's official survey participation status. */
export function getActivitesPassees(token: string, params: { mois?: number; annee?: number; type_id?: string; statut?: string; q?: string; limit?: number; offset?: number } = {}): Promise<ActivitesPasseesPage> {
  return authedGet<ActivitesPasseesPage>(`/api/v1/membres/me/activites/passees${toQuery({ ...params })}`, token, apiMsg("Historique indisponible", "History unavailable"));
}

/** Identity-check (scan) trail. Distinct from participation. */
export function getControlesAcces(token: string, params: { limit?: number; offset?: number } = {}): Promise<ControlesPage> {
  return authedGet<ControlesPage>(`/api/v1/membres/me/activites/controles${toQuery({ ...params })}`, token, apiMsg("Contrôles indisponibles", "Controls unavailable"));
}

export function marquerNotificationLue(token: string, id: string): Promise<void> {
  return authedPost<void>(`/api/v1/membres/me/notifications/${id}/lire`, token, {}, apiMsg("Marquage impossible", "Could not update"));
}

export async function markNotificationsRead(token: string): Promise<void> {
  await fetch(`${BASE}/api/v1/membres/me/notifications/lire`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getRecensement(token: string): Promise<Recensement | null> {
  return authedGet<Recensement | null>("/api/v1/membres/me/recensement", token, apiMsg("Recensement indisponible", "Census unavailable"));
}

export function getDocuments(token: string): Promise<DocumentItem[]> {
  return authedGet<DocumentItem[]>("/api/v1/membres/me/documents", token, apiMsg("Dossier indisponible", "File unavailable"));
}

export function getEngagements(token: string): Promise<EngagementItem[]> {
  return authedGet<EngagementItem[]>("/api/v1/membres/me/engagements", token, apiMsg("Engagements indisponibles", "Commitments unavailable"));
}

async function authedPost<T>(path: string, token: string, body: unknown, onError: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await readDetail(res);
    if (res.status === 401) reporterFinDeSession(res);
    throw new ApiError(res.status === 400 ? apiMsg("Requête invalide", "Invalid request") : res.status === 401 ? apiMsg("Session expirée", "Session expired") : onError, res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function changePassword(token: string, ancien: string, nouveau: string): Promise<void> {
  return authedPost<void>("/api/v1/membres/me/change-password", token, { ancien, nouveau }, apiMsg("Changement impossible", "Change failed"));
}

export function acceptEngagement(token: string, type: string): Promise<EngagementItem> {
  return authedPost<EngagementItem>("/api/v1/membres/me/engagements/accepter", token, { type }, apiMsg("Signature impossible", "Signing failed"));
}

export function submitDocument(token: string, type: string, libelle?: string): Promise<DocumentItem> {
  return authedPost<DocumentItem>("/api/v1/membres/me/documents", token, { type, libelle }, apiMsg("Envoi impossible", "Sending failed"));
}

export function participer(token: string, evenementId: string, note?: number, commentaire?: string): Promise<void> {
  return authedPost<void>(
    "/api/v1/membres/me/participation",
    token,
    { evenement_id: evenementId, note, commentaire },
    apiMsg("Validation impossible", "Validation failed"),
  );
}

async function publicPost<T>(path: string, body: unknown, onError: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status === 400 ? apiMsg("Code ou requête invalide", "Invalid code or request") : onError, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function requestOtp(email: string, purpose: string): Promise<{ ok: boolean; sent: boolean; provider: string }> {
  return publicPost("/api/v1/auth/request-otp", { email, purpose }, apiMsg("Envoi du code impossible", "Could not send the code"));
}

/** Close the current session server-side (records the logout and its duration). */
export function logoutSession(token: string): Promise<{ ok: boolean }> {
  return authedPost("/api/v1/auth/logout", token, {}, apiMsg("Déconnexion", "Sign-out failed"));
}

export interface NiveauItem {
  cle: string;
  libelle: string;
  ordre: number;
  actif: boolean;
}

/** Active engagement levels (admin catalogue), for labels on the card and lists. */
export function getNiveaux(token: string): Promise<NiveauItem[]> {
  return authedGet<NiveauItem[]>("/api/v1/niveaux-engagement", token, apiMsg("Niveaux indisponibles", "Levels unavailable"));
}

export interface DemandeMessage {
  id: string;
  auteur_type: "membre" | "staff" | "systeme";
  auteur_nom: string | null;
  corps: string;
  cree_le: string | null;
  document_id?: string | null;
  /** Read receipts: when the member / the staff read this message. */
  lu_par_membre_le?: string | null;
  lu_par_staff_le?: string | null;
}

export interface Demande {
  id: string;
  numero: string;
  type: string;
  sujet: string;
  champ_concerne: string | null;
  statut: string;
  categorie?: string | null;
  sous_categorie?: string | null;
  motif_cloture?: string | null;
  cree_le: string | null;
  nb_messages: number;
  /** Step tracking: when the administration took the request over / closed it. */
  pris_en_charge_le?: string | null;
  clos_le?: string | null;
  /** Deadline for the member's action after an unlock (auto-close when over). */
  echeance_reponse?: string | null;
}

export interface CatalogueSous {
  cle: string;
  libelle: string;
  sujet: string;
  message: string;
  piece: string;
}

export interface CatalogueCategorie {
  categorie: string;
  libelle: string;
  sous: CatalogueSous[];
}

export interface DemandeCatalogue {
  categories: CatalogueCategorie[];
  statuts: Record<string, string>;
}

export function getDemandeCatalogue(token: string): Promise<DemandeCatalogue> {
  return authedGet<DemandeCatalogue>("/api/v1/membres/me/demandes/catalogue", token, apiMsg("Catalogue indisponible", "Catalogue unavailable"));
}

export interface DemandeDetail extends Demande {
  messages: DemandeMessage[];
}

export function getDemandes(token: string): Promise<Demande[]> {
  return authedGet<Demande[]>("/api/v1/membres/me/demandes", token, apiMsg("Demandes indisponibles", "Requests unavailable"));
}

export type ActionUrgence = "normale" | "elevee" | "critique";

/** One request awaiting the member's own action, with the timing signals that let
 * the reminder escalate calmly (age, deadline) rather than nag from minute one. */
export interface ActionAttendue {
  id: string;
  reference: string;
  sujet: string;
  statut: string;
  statut_libelle: string;
  depuis_jours: number;
  echeance: string | null;
  echeance_jours: number | null;
  urgence: ActionUrgence;
}

/** Compact summary that drives the discreet "an action awaits you" surfaces. */
export interface ActionsAttendues {
  total: number;
  plus_ancienne_jours: number;
  urgence_max: ActionUrgence;
  cible_unique_id: string | null;
  items: ActionAttendue[];
}

export function getActionsAttendues(token: string): Promise<ActionsAttendues> {
  return authedGet<ActionsAttendues>(
    "/api/v1/membres/me/demandes/en-attente",
    token,
    apiMsg("Actions indisponibles", "Actions unavailable"),
  );
}

export function getDemande(token: string, id: string): Promise<DemandeDetail> {
  return authedGet<DemandeDetail>(`/api/v1/membres/me/demandes/${id}`, token, apiMsg("Demande indisponible", "Request unavailable"));
}

export function createDemande(
  token: string,
  input: { type: string; sujet: string; champ_concerne?: string; message: string; categorie?: string; sous_categorie?: string },
): Promise<DemandeDetail> {
  return authedPost<DemandeDetail>("/api/v1/membres/me/demandes", token, input, apiMsg("Création impossible", "Creation failed"));
}

export function sendDemandeMessage(token: string, id: string, corps: string, documentId?: string): Promise<DemandeMessage> {
  return authedPost<DemandeMessage>(
    `/api/v1/membres/me/demandes/${id}/messages`,
    token,
    documentId ? { corps, document_id: documentId } : { corps },
    apiMsg("Envoi impossible", "Sending failed"),
  );
}

export function resetPassword(email: string, code: string, nouveau: string): Promise<void> {
  return publicPost<void>("/api/v1/auth/reset-password", { email, code, nouveau }, apiMsg("Réinitialisation impossible", "Reset failed"));
}

export interface RefItem {
  id: string;
  nom: string;
  patriarche?: string | null;
  type_organisation?: string | null;
}

export function getReference(token: string, kind: string): Promise<RefItem[]> {
  return authedGet<RefItem[]>(`/api/v1/reference/${kind}`, token, apiMsg("Liste indisponible", "List unavailable"));
}

export interface ProfilFields {
  prenoms?: string;
  nom?: string;
  telephone?: string;
  indicatif_telephone?: string;
  date_naissance?: string;
  naissance_annee_visible?: boolean;
  genre?: string;
  pays?: string;
  region?: string;
  ville?: string;
  adresse?: string;
  adresse_complement?: string;
  commission_id?: string;
  intendance_id?: string;
  coordination_id?: string;
  tribu_id?: string;
  groupe?: string;
  profession?: string;
  niveau_etudes?: string;
  situation_matrimoniale?: string;
  type_mariage?: string;
  en_cheminement?: boolean | null;
  baptise?: boolean;
  confirme?: boolean;
  premiere_communion?: boolean;
  code_membre?: string;
  date_entree?: string;
  promotion?: string;
  berger_declare?: boolean;
  berger_nom_declare?: string;
  equipe_dirigeante_declaree?: boolean;
  type_membre?: string;
  fonction_cle?: string;
  // Four-block registration declarations (special functions, functions, particular
  // functions) with an optional scope. The consecration title uses berger_declare.
  fonctions_souhaitees?: { cle: string; perimetre?: string | null }[];
  // Civil identity completeness (mostly for married women) and extra preferences.
  nom_naissance?: string;
  nom_marital?: string;
  nom_affiche?: string;
  whatsapp_numero?: string;
  anniversaire_visible_annuaire?: boolean;
}

async function authedPatch<T>(path: string, token: string, body: unknown, onError: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) reporterFinDeSession(res);
    throw new ApiError(res.status === 401 ? apiMsg("Session expirée", "Session expired") : onError, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function authedPut<T>(path: string, token: string, body: unknown, onError: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await readDetail(res);
    if (res.status === 401) reporterFinDeSession(res);
    throw new ApiError(res.status === 401 ? apiMsg("Session expirée", "Session expired") : onError, res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function updateProfil(
  token: string,
  fields: ProfilFields,
): Promise<{ ok: boolean; pending_validation?: boolean; champs?: string[]; updated?: string[] }> {
  return authedPatch("/api/v1/membres/me/profil", token, fields, apiMsg("Mise à jour impossible", "Update failed"));
}

/** Single, unified submission of an admin-opened modification cycle: the edited
 * text fields and any staged replacement photo go together, once. The server
 * consumes the whole unlock and rejects any replay. */
export function soumettreModifications(
  token: string,
  champs: Record<string, string>,
  inclurePhoto: boolean,
): Promise<{ ok: boolean; pending_validation?: boolean; champs?: string[]; photo?: boolean }> {
  return authedPost(
    "/api/v1/membres/me/modifications/soumettre",
    token,
    { champs, inclure_photo: inclurePhoto },
    apiMsg("Soumission impossible", "Submission failed"),
  );
}

/** Signed preview of a replacement photo staged but not yet validated. */
export function getPendingPhotoUrl(token: string): Promise<{ url: string | null }> {
  return authedGet("/api/v1/membres/me/photo/pending", token, apiMsg("Aperçu indisponible", "Preview unavailable"));
}

export interface InscriptionStatut {
  statut: string;
  motif_refus: string | null;
  champs_a_corriger: string[];
  soumis_le: string | null;
  decision_le: string | null;
  verifie: boolean;
}

export function getInscription(token: string): Promise<InscriptionStatut> {
  return authedGet<InscriptionStatut>("/api/v1/membres/me/inscription", token, "Statut indisponible");
}

export function soumettreInscription(token: string): Promise<unknown> {
  return authedPost("/api/v1/membres/me/inscription/soumettre", token, {}, apiMsg("Soumission impossible", "Submission failed"));
}

interface SoumettreDetail {
  missing_fields?: string[];
  needs_document?: boolean;
  needs_signature?: boolean;
}

function soumettreDetail(err: unknown): SoumettreDetail | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const d = err.detail;
  return d && typeof d === "object" ? (d as SoumettreDetail) : {};
}

/** True only when a soumettreInscription 422 was actually about the signature,
 * not a missing field or document. Falls back to true when the server sends a
 * 422 without a structured body (older API), so signature stays the safe guess. */
export function isNeedsSignature(err: unknown): boolean {
  const d = soumettreDetail(err);
  if (!d) return false;
  if (d.needs_signature === true) return true;
  // Structured body present but signature not the cause: not a signature issue.
  if (d.needs_signature === false) return false;
  // No structured body at all (empty object): keep the previous safe default.
  return Object.keys(d).length === 0;
}

/** Field labels for the human-readable message on a soumettre 422. */
const FIELD_LABELS: Record<string, string> = {
  prenoms: "Prénoms",
  nom: "Nom",
  telephone: "Téléphone",
  date_naissance: "Date de naissance",
  genre: "Genre",
  ville: "Ville",
  pays: "Pays",
  commission_id: "Commission / Mission",
  coordination_id: "Coordination",
  intendance_id: "Intendance",
  rattachement: "Coordination ou intendance",
  tribu_id: "Tribu",
};

/** Precise French reason for a failed soumettreInscription, or null if the
 * error is not a structured 422 (caller shows a generic message then). */
export function soumettreReason(err: unknown): string | null {
  const d = soumettreDetail(err);
  if (!d) return null;
  const missing = Array.isArray(d.missing_fields) ? d.missing_fields : [];
  if (missing.length > 0) {
    const labels = missing.map((k) => FIELD_LABELS[k] ?? k).join(", ");
    return `Ces champs sont encore incomplets : ${labels}.`;
  }
  if (d.needs_document === true) {
    return apiMsg("Une pièce d'identité est requise avant l'envoi.", "An identity document is required before sending.");
  }
  if (d.needs_signature === true) {
    return null; // handled by the signature flow, not a message
  }
  return null;
}

export function getConsentDocs(token: string): Promise<ConsentSummary[]> {
  return authedGet<ConsentSummary[]>("/api/v1/consentements", token, "Documents indisponibles");
}

export function getConsentDoc(token: string, cle: string): Promise<ConsentDoc> {
  return authedGet<ConsentDoc>(
    `/api/v1/consentements/${encodeURIComponent(cle)}`,
    token,
    "Document indisponible",
  );
}

export interface DemanderSignatureResult {
  ok: boolean;
  canaux: string[];
  signature_id: string;
}

export function demanderSignature(
  token: string,
  documents: SignatureRef[],
): Promise<DemanderSignatureResult> {
  return authedPost<DemanderSignatureResult>(
    "/api/v1/consentements/signature/demander",
    token,
    { documents },
    apiMsg("Envoi du code impossible", "Could not send the code"),
  );
}

export function verifierSignature(token: string, code: string): Promise<{ ok: true }> {
  return authedPost<{ ok: true }>(
    "/api/v1/consentements/signature/verifier",
    token,
    { code },
    "Code invalide",
  );
}

export function getSignatureEtat(token: string): Promise<{ signe: boolean }> {
  return authedGet<{ signe: boolean }>(
    "/api/v1/consentements/signature/etat",
    token,
    apiMsg("État indisponible", "Status unavailable"),
  );
}

/** Upload a file to a private bucket via a server-issued signed URL, return the stored path. */
async function uploadViaSignedUrl(uploadUrl: string, file: File): Promise<void> {
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!put.ok) throw new ApiError(apiMsg("Téléversement impossible", "Upload failed"), put.status);
}

export async function uploadPhoto(
  token: string,
  file: File,
  focus?: { x: number; y: number },
): Promise<void> {
  const signed = await authedPost<{ upload_url: string; path: string }>(
    "/api/v1/membres/me/photo/upload-url",
    token,
    {},
    "Upload indisponible",
  );
  await uploadViaSignedUrl(signed.upload_url, file);
  // Compute the perceptual hash locally for duplicate detection (no PII leaves
  // the device beyond the photo already uploaded). A failure must not block.
  const phash = await computePhash(file).catch(() => null);
  await authedPost<void>(
    "/api/v1/membres/me/photo/confirm",
    token,
    { path: signed.path, phash, focus_x: focus?.x ?? null, focus_y: focus?.y ?? null },
    "Confirmation impossible",
  );
}

/** Re-frame the current photo (display-only focal point, no re-validation). */
export function setPhotoFocus(token: string, x: number, y: number): Promise<void> {
  return authedPatch("/api/v1/membres/me/photo/focus", token, { x, y }, "Cadrage impossible");
}

/** CSS object-position for a member photo, from its stored focal point.
 * Falls back to the upper-centre default that suits head-and-shoulders photos. */
export function photoObjectPosition(p: { photo_focus_x: number | null; photo_focus_y: number | null } | null): string {
  const x = p?.photo_focus_x;
  const y = p?.photo_focus_y;
  return x != null && y != null ? `${x}% ${y}%` : "50% 30%";
}

export async function uploadDocument(token: string, type: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const signed = await authedPost<{ upload_url: string; path: string }>(
    "/api/v1/membres/me/documents/upload-url",
    token,
    { type, ext },
    "Upload indisponible",
  );
  await uploadViaSignedUrl(signed.upload_url, file);
  const res = await authedPost<{ id: string }>(
    "/api/v1/membres/me/documents/confirm",
    token,
    { type, path: signed.path, nom_fichier: file.name, mime: file.type },
    "Confirmation impossible",
  );
  return res.id;
}

export function getPhotoUrl(token: string): Promise<{ url: string | null }> {
  return authedGet<{ url: string | null }>("/api/v1/membres/me/photo", token, "Photo indisponible");
}

export async function submitRecensement(
  token: string,
  reponse: { confirme_engagement: boolean; infos_a_jour: boolean; reaccepte_engagements: boolean },
): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/membres/me/recensement`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(reponse),
  });
  if (!res.ok) {
    if (res.status === 401) reporterFinDeSession(res);
    throw new ApiError(res.status === 401 ? apiMsg("Session expirée", "Session expired") : apiMsg("Envoi impossible", "Sending failed"), res.status);
  }
}

export interface AttestationInfo {
  requise: boolean;
  statut: string;
  echeance: string | null;
  texte: string;
  /** DD/MM/YYYY date the signed scan was transmitted, once sent. */
  soumise_le?: string | null;
  /** Reason given by the administration when the scan was rejected. */
  motif_rejet?: string | null;
}

export function getAttestation(token: string): Promise<AttestationInfo> {
  return authedGet<AttestationInfo>("/api/v1/membres/me/attestation", token, "Attestation indisponible");
}

export function uploadAttestation(token: string, documentId: string): Promise<AttestationInfo> {
  return authedPost<AttestationInfo>(
    "/api/v1/membres/me/attestation/upload",
    token,
    { document_id: documentId },
    apiMsg("Envoi impossible", "Sending failed"),
  );
}

export function apiBaseUrl(): string {
  return BASE;
}

/** An institutional document published for the members: statutes, rules, a charter.
 *  Only the published version is served; earlier ones stay readable in the back
 *  office, which is what makes a signature verifiable after the fact. */
export interface DocumentBibliotheque {
  id: string;
  cle: string;
  categorie: string;
  titre: string;
  titre_en: string | null;
  description: string | null;
  version: number;
  version_id: string;
  contenu: string | null;
  contenu_en: string | null;
  fichier: { nom: string | null; mime: string | null; taille: number | null } | null;
  publie_le: string | null;
}

export async function getBibliothequeMembre(token: string): Promise<DocumentBibliotheque[]> {
  const res = await fetch(`${BASE}/api/v1/membres/me/bibliotheque`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Documents indisponibles pour le moment.", "Documents unavailable right now."), res.status);
  return ((await res.json()) as { items: DocumentBibliotheque[] }).items;
}

export async function getFichierBibliotheque(token: string, versionId: string): Promise<{ url: string; nom: string | null }> {
  const res = await fetch(`${BASE}/api/v1/membres/me/bibliotheque/${versionId}/fichier`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(apiMsg("Fichier indisponible.", "File unavailable."), res.status);
  return (await res.json()) as { url: string; nom: string | null };
}
