import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebase-admin';

function splitDisplayName(name: string): { firstName: string; middleName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

export async function ensureVizuaraUserDocument({
  firebaseUid,
  email,
  displayName,
  photoURL,
}: {
  firebaseUid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}) {
  const db = getAdminFirestore();
  const userRef = db.collection('Users').doc(firebaseUid);
  const snapshot = await userRef.get();
  if (snapshot.exists) return { created: false };

  const { firstName, middleName, lastName } = splitDisplayName(
    displayName || email.split('@')[0] || 'ArcEval User'
  );

  try {
    await userRef.create({
      id: firebaseUid,
      username: '',
      email,
      firstName,
      middleName,
      lastName,
      role: 'STUDENT',
      status: 'ACTIVE',
      sourceProduct: 'ARCEVAL',
      organizationId: '',
      class: '',
      division: '',
      photoURL: photoURL || '',
      readAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { created: true };
  } catch (error: unknown) {
    const errorCode = typeof error === 'object' && error && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
    if (errorCode === 6 || errorCode === 'already-exists') return { created: false };
    throw error;
  }
}
