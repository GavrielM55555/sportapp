import {setGlobalOptions} from "firebase-functions";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import {Expo, ExpoPushMessage} from "expo-server-sdk";

admin.initializeApp();
setGlobalOptions({maxInstances: 10});

const expo = new Expo();
const db = admin.firestore();

/**
 * Get all valid push tokens from Firestore.
 */
async function getAllTokens(): Promise<{uid: string; token: string}[]> {
  const snap = await db.collection("push_tokens").get();
  return snap.docs
    .map((d) => d.data() as {uid: string; token: string})
    .filter((t) => Expo.isExpoPushToken(t.token));
}

/**
 * Send push notifications in chunks.
 */
async function sendNotifications(messages: ExpoPushMessage[]) {
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error("Push send error:", e);
    }
  }
}

// Notify group members when a series completes
export const onSeriesComplete = onDocumentUpdated(
  "groups/{groupId}/seriesStatus/{seriesId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.isComplete || !after.isComplete) return;

    const groupSnap = await db
      .collection("groups")
      .doc(event.params.groupId)
      .get();
    const group = groupSnap.data();
    if (!group) return;

    const winner = after.winnerAbbr ?? "The winner";
    const tokens = await getAllTokens();
    const memberUids = new Set(
      (group.members as {uid: string}[]).map((m) => m.uid)
    );
    const messages: ExpoPushMessage[] = tokens
      .filter((t) => memberUids.has(t.uid))
      .map((t) => ({
        to: t.token,
        title: "Series Over! 🏀",
        body: `${winner} wins! Check your points in ${group.name}!`,
        data: {groupId: event.params.groupId},
      }));

    await sendNotifications(messages);
  }
);

// Notify group members 30 min before picks lock (runs every 5 minutes)
export const pickLockReminder = onSchedule("every 5 minutes", async () => {
  const now = Date.now();
  const in35min = now + 35 * 60 * 1000;
  const in30min = now + 30 * 60 * 1000;

  const gamesSnap = await db
    .collection("scheduled_games")
    .where("status", "==", "scheduled")
    .where("startsAt", ">=", in30min)
    .where("startsAt", "<=", in35min)
    .get();

  if (gamesSnap.empty) return;

  const groupsSnap = await db
    .collection("groups")
    .where("type", "==", "playoff")
    .get();
  const allTokens = await getAllTokens();

  const messages: ExpoPushMessage[] = [];
  for (const groupDoc of groupsSnap.docs) {
    const group = groupDoc.data();
    const memberUids = new Set(
      (group.members as {uid: string}[]).map((m) => m.uid)
    );
    for (const t of allTokens) {
      if (memberUids.has(t.uid)) {
        messages.push({
          to: t.token,
          title: "⏰ Picks lock in 30 minutes!",
          body: `Make your picks in ${group.name} before tip-off!`,
          data: {groupId: groupDoc.id},
        });
      }
    }
  }

  await sendNotifications(messages);
});

// Notify when champion is decided
export const onChampionDecided = onDocumentUpdated(
  "groups/{groupId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.championDecided || !after.championDecided) return;

    const group = after;
    const tokens = await getAllTokens();
    const memberUids = new Set(
      (group.members as {uid: string}[]).map((m) => m.uid)
    );
    const messages: ExpoPushMessage[] = tokens
      .filter((t) => memberUids.has(t.uid))
      .map((t) => ({
        to: t.token,
        title: "🏆 Champion Decided!",
        body: `The NBA Champion is crowned! Check your final points in ${
          group.name
        }!`,
        data: {groupId: event.params.groupId},
      }));

    await sendNotifications(messages);
  }
);
