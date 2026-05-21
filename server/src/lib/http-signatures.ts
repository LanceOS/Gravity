import { createHash, sign, verify } from 'node:crypto';

export const FEDERATION_PUBLIC_KEY_HEADER = 'x-gravity-public-key';
export const FEDERATION_SIGNATURE_HEADER = 'x-gravity-signature';
export const FEDERATION_TIMESTAMP_HEADER = 'x-gravity-timestamp';

type FederationSignatureInput = {
  method: string;
  path: string;
  timestamp: string;
  body: unknown;
};

export function normalizeFederationPublicKey(publicKey: string) {
  return publicKey.trim();
}

function normalizeBody(body: unknown) {
  return JSON.stringify(body ?? {});
}

function createBodyDigest(body: unknown) {
  return createHash('sha256').update(normalizeBody(body)).digest('base64');
}

export function encodeFederationPublicKey(publicKey: string) {
  return Buffer.from(normalizeFederationPublicKey(publicKey), 'utf8').toString('base64');
}

export function decodeFederationPublicKey(encodedPublicKey: string) {
  return normalizeFederationPublicKey(Buffer.from(encodedPublicKey, 'base64').toString('utf8'));
}

export function buildFederationSigningPayload(input: FederationSignatureInput) {
  return [input.method.toUpperCase(), input.path, input.timestamp, createBodyDigest(input.body)].join('\n');
}

export function signFederationRequest(input: FederationSignatureInput & { privateKey: string }) {
  const payload = buildFederationSigningPayload(input);
  return sign(null, Buffer.from(payload, 'utf8'), input.privateKey).toString('base64');
}

export function verifyFederationRequestSignature(input: FederationSignatureInput & { publicKey: string; signature: string }) {
  const payload = buildFederationSigningPayload(input);
  return verify(null, Buffer.from(payload, 'utf8'), normalizeFederationPublicKey(input.publicKey), Buffer.from(input.signature, 'base64'));
}

export function isFederationTimestampFresh(timestamp: string, toleranceMs = 5 * 60 * 1000) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return Math.abs(Date.now() - parsed.getTime()) <= toleranceMs;
}

export function createSignedFederationHeaders(input: FederationSignatureInput & { publicKey: string; privateKey: string }) {
  const signature = signFederationRequest({
    method: input.method,
    path: input.path,
    timestamp: input.timestamp,
    body: input.body,
    privateKey: input.privateKey,
  });

  return {
    [FEDERATION_PUBLIC_KEY_HEADER]: encodeFederationPublicKey(input.publicKey),
    [FEDERATION_TIMESTAMP_HEADER]: input.timestamp,
    [FEDERATION_SIGNATURE_HEADER]: signature,
  };
}