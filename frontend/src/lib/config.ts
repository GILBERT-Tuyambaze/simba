function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getRuntimeOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return '';
  }

  return normalizeUrl(window.location.origin);
}

export function getConfig() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredApiBaseUrl) {
    return {
      API_BASE_URL: normalizeUrl(configuredApiBaseUrl),
    };
  }

  return {
    API_BASE_URL: getRuntimeOrigin(),
  };
}

export function getAPIBaseURL(): string {
  return getConfig().API_BASE_URL;
}

export const config = {
  get API_BASE_URL() {
    return getAPIBaseURL();
  },
};
