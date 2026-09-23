import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestore: Firestore | undefined;

function getFinanceApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.ZAMAN_FINANCE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.ZAMAN_FINANCE_FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.ZAMAN_FINANCE_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Zaman Finance Firebase server configuration.");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getFinanceFirestore(): Firestore {
  firestore ??= getFirestore(getFinanceApp());
  return firestore;
}
