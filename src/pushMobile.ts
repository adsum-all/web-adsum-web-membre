/**
 * Register this phone so the platform can notify it, when running inside the app.
 *
 * The same build serves the web application and the Android shell. On the web there
 * is no device to register and this does nothing at all; inside the shell the native
 * runtime injects a global `Capacitor` object, which is how the two are told apart.
 *
 * Reached through that global rather than by importing @capacitor/core: the web build
 * would then carry a native runtime it can never use, and the web application is what
 * most members open.
 *
 * The order of operations matters and is deliberate:
 *
 *   1. Ask the server whether this organisation can deliver push at all.
 *   2. Only then ask the operating system for permission.
 *
 * Android offers the notification permission prompt once. Spending it on a channel
 * the organisation has not configured buys the member nothing and cannot be undone.
 */
import { enregistrerAppareilPush, poussePossible, retirerAppareilPush } from "./api.js";

/** The shape of the native bridge, as far as this file uses it. */
interface PontCapacitor {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: {
      checkPermissions: () => Promise<{ receive: string }>;
      requestPermissions: () => Promise<{ receive: string }>;
      register: () => Promise<void>;
      addListener: (evenement: string, ecouteur: (donnee: unknown) => void) => Promise<unknown>;
    };
  };
}

function pont(): PontCapacitor | null {
  const global = (globalThis as { Capacitor?: PontCapacitor }).Capacitor;
  return global?.isNativePlatform?.() ? global : null;
}

/** Whether this code is running inside the installed application. */
export function surMobile(): boolean {
  return pont() !== null;
}

/** The token this device last registered, so signing out can withdraw exactly it. */
let jetonCourant = "";

/**
 * Register this device against the signed-in member.
 *
 * Never throws and never blocks: a member whose phone cannot be registered still
 * receives everything on the other channels, and an exception here would happen
 * during sign-in, which is the worst moment to surface one.
 */
export async function activerPush(token: string): Promise<void> {
  const capacitor = pont();
  const greffon = capacitor?.Plugins?.PushNotifications;
  if (!capacitor || !greffon) return;

  try {
    // 1. The organisation's side. No service account, no channel, no prompt.
    if (!(await poussePossible(token))) return;

    // 2. The member's side. checkPermissions first: requestPermissions re-prompts on
    // some versions, and a member who refused once should not be asked at each launch.
    let etat = await greffon.checkPermissions();
    if (etat.receive === "prompt" || etat.receive === "prompt-with-rationale") {
      etat = await greffon.requestPermissions();
    }
    if (etat.receive !== "granted") return;

    // 3. The token arrives asynchronously, on an event, and again whenever the push
    // service rotates it. Both are the same call: the server reassigns on conflict.
    await greffon.addListener("registration", (donnee: unknown) => {
      const jeton = (donnee as { value?: string })?.value ?? "";
      if (!jeton) return;
      jetonCourant = jeton;
      void enregistrerAppareilPush(token, jeton, capacitor.getPlatform?.() ?? "android");
    });
    await greffon.addListener("registrationError", () => {
      // Left to the other channels. Nothing to show the member: they did not ask for
      // this, and an error about a channel they never chose is noise.
    });
    await greffon.register();
  } catch {
    // Same reasoning: push is one channel among several, and never a reason to fail
    // a sign-in.
  }
}

/**
 * Stop notifying this device. Called on sign-out.
 *
 * Withdrawn while the token is still valid, which is why it happens before the
 * session is discarded: afterwards the platform has no way to know which device to
 * silence, and notifications keep arriving on a phone nobody is signed in on.
 */
export async function desactiverPush(token: string): Promise<void> {
  if (!jetonCourant || !surMobile()) return;
  try {
    await retirerAppareilPush(token, jetonCourant);
  } catch {
    // The device stays registered. The member can revoke it from their settings, and
    // the service retires it on its own once the application is uninstalled.
  }
  jetonCourant = "";
}
