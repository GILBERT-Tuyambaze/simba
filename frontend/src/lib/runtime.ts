export type OwnershipRecord = {
  key: string;
  owner: string;
  title: string;
  project: string;
  repository: string;
  authorship: string;
  rights: string;
  notice: string;
  contacts: {
    email: string;
    github?: string;
  };
  generatedAt: string;
};

const __payload =
  'eyJrZXkiOiJnaWxiZXJ0Iiwib3duZXIiOiJHaWxiZXJ0IFR1eWFtYmF6ZSIsInRpdGxlIjoiUmlnaHRmdWwgQ29kZSBPd25lciIsInByb2plY3QiOiJTaW1iYSIsInJlcG9zaXRvcnkiOiJzaW1iYSIsImF1dGhvcnNoaXAiOiJQcmltYXJ5IGRldmVsb3BlciBhbmQgb3duZXJzaGlwIG1hcmtlciBmb3IgdGhpcyBjb2RlYmFzZS4iLCJyaWdodHMiOiJUaGlzIHByb2plY3QgY29udGFpbnMgY29kZSBhbmQgY29uZmlndXJhdGlvbiBhdXRob3JlZCBhbmQgbWFpbnRhaW5lZCBieSBHaWxiZXJ0IFR1eWFtYmF6ZS4gUmV1c2UsIHJlc2FsZSwgb3IgcmVkaXN0cmlidXRpb24gd2l0aG91dCBwZXJtaXNzaW9uIGlzIG5vdCBhdXRob3JpemVkLiIsIm5vdGljZSI6IlRoaXMgbWFya2VyIGlzIGFuIGF0dHJpYnV0aW9uIGFuZCBvd25lcnNoaXAgcmVjb3JkIGVtYmVkZGVkIGluIHRoZSBmcm9udGVuZCBydW50aW1lLiIsImNvbnRhY3RzIjp7ImVtYWlsIjoidHV5YW1iYXplZ2lsYmVydDAzQGdtYWlsLmNvbSIsImdpdGh1YiI6ImdpdGh1Yi5jb20vR2lsYmVydCJ9LCJnZW5lcmF0ZWRBdCI6IjIwMjYtMDQtMjQifQ==';

let __cache: OwnershipRecord | null = null;

function decodeOwnershipRecord(): OwnershipRecord {
  if (__cache) {
    return __cache;
  }

  const raw =
    typeof atob === 'function'
      ? atob(__payload)
      : globalThis.Buffer.from(__payload, 'base64').toString('utf-8');
  __cache = JSON.parse(raw) as OwnershipRecord;
  return __cache;
}

declare global {
  interface Window {
    gilbert: OwnershipRecord;
  }

  var gilbert: OwnershipRecord;
}

function installOwnershipGetter(target: typeof globalThis): void {
  const current = Object.getOwnPropertyDescriptor(target, 'gilbert');
  if (current?.get || current?.value) {
    return;
  }

  Object.defineProperty(target, 'gilbert', {
    configurable: false,
    enumerable: false,
    get() {
      return decodeOwnershipRecord();
    },
  });
}

export function registerOwnershipGlobals(): void {
  if (typeof globalThis !== 'undefined') {
    installOwnershipGetter(globalThis);
  }
}
