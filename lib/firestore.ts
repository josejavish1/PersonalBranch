const FIRESTORE_API_ROOT = 'https://firestore.googleapis.com/v1';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

function getProjectId() {
  const firebaseConfig = process.env.FIREBASE_CONFIG;

  if (firebaseConfig) {
    try {
      const parsed = JSON.parse(firebaseConfig);
      if (parsed.projectId) {
        return parsed.projectId as string;
      }
    } catch {
      // Ignore malformed FIREBASE_CONFIG and continue with env fallbacks.
    }
  }

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error('Firestore project id is not configured');
  }

  return projectId;
}

async function getAccessToken() {
  const response = await fetch(METADATA_TOKEN_URL, {
    headers: {
      'Metadata-Flavor': 'Google',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = (await response.json()) as { access_token?: string };

  if (!data.access_token) {
    throw new Error('Metadata server did not return an access token');
  }

  return data.access_token;
}

function getDocumentsBaseUrl() {
  const projectId = getProjectId();
  return `${FIRESTORE_API_ROOT}/projects/${projectId}/databases/(default)/documents`;
}

type FirestorePrimitive = string | number | boolean | null;

type FirestoreDocumentData = Record<string, FirestorePrimitive>;

function encodeValue(value: FirestorePrimitive) {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (Number.isInteger(value)) {
    return { integerValue: String(value) };
  }

  return { doubleValue: value };
}

function decodeValue(value: Record<string, unknown>) {
  if ('stringValue' in value) return value.stringValue as string;
  if ('booleanValue' in value) return value.booleanValue as boolean;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue as number;
  if ('timestampValue' in value) return value.timestampValue as string;
  if ('nullValue' in value) return null;

  return null;
}

function encodeFields(data: FirestoreDocumentData) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

function decodeFields(fields?: Record<string, Record<string, unknown>>) {
  if (!fields) {
    return {};
  }

  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function firestoreFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${getDocumentsBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  return response;
}

export async function listFirestoreDocuments(collection: string) {
  const response = await firestoreFetch(`/${collection}`);

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to list Firestore documents: ${response.status}`);
  }

  const payload = (await response.json()) as {
    documents?: Array<{
      name: string;
      fields?: Record<string, Record<string, unknown>>;
    }>;
  };

  return (payload.documents ?? []).map((document) => ({
    id: document.name.split('/').pop() ?? '',
    data: decodeFields(document.fields),
  }));
}

export async function createFirestoreDocument(collection: string, data: FirestoreDocumentData) {
  const response = await firestoreFetch(`/${collection}`, {
    method: 'POST',
    body: JSON.stringify({
      fields: encodeFields(data),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Firestore document: ${response.status}`);
  }

  const payload = (await response.json()) as {
    name: string;
    fields?: Record<string, Record<string, unknown>>;
  };

  return {
    id: payload.name.split('/').pop() ?? '',
    data: decodeFields(payload.fields),
  };
}

export async function deleteFirestoreDocument(collection: string, id: string) {
  const response = await firestoreFetch(`/${collection}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete Firestore document: ${response.status}`);
  }
}
