import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import en from './i18n/en';
import fr from './i18n/fr';
import rw from './i18n/rw';
import sw from './i18n/sw';

export type LanguageCode = 'en' | 'fr' | 'rw' | 'sw';

type TranslationValue = string | Record<string, string>;
type TranslateOptions = {
  count?: number;
  values?: Record<string, string | number | null | undefined>;
};

type Dictionary = Record<LanguageCode, Record<string, TranslationValue>>;

const LANGUAGE_KEY = 'simba_language';
const SUGGESTION_DISMISSED_KEY = 'simba_language_suggestion_dismissed';
const DEFAULT_LANGUAGE: LanguageCode = 'en';

const CATEGORY_LABELS: Record<string, Record<LanguageCode, string>> = {
  'Food Products': {
    en: 'Food Products',
    fr: 'Produits alimentaires',
    rw: 'Ibiribwa',
    sw: 'Bidhaa za chakula',
  },
  'Baby Products': {
    en: 'Baby Products',
    fr: 'Produits pour bebe',
    rw: "Ibikoresho by'abana",
    sw: 'Bidhaa za watoto',
  },
  'Alcoholic Drinks': {
    en: 'Alcoholic Drinks',
    fr: 'Boissons alcoolisees',
    rw: 'Ibinyobwa bisembuye',
    sw: 'Vinywaji vya kilevi',
  },
  'Kitchenware & Electronics': {
    en: 'Kitchen & Electronics',
    fr: 'Cuisine et electronique',
    rw: 'Igikoni n ibikoresho bya eletronike',
    sw: 'Jikoni na vifaa vya elektroniki',
  },
  'Cleaning & Sanitary': {
    en: 'Cleaning & Sanitary',
    fr: 'Nettoyage et sanitaire',
    rw: 'Isuku n isukura',
    sw: 'Usafi na bidhaa za usafi',
  },
};

const DICTIONARY: Dictionary = {
  en,
  fr,
  rw,
  sw,
};

type I18nContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (
    key: string,
    fallbackOrOptions?: string | TranslateOptions,
    maybeOptions?: TranslateOptions
  ) => string;
  translateCategory: (name: string) => string;
  suggestedLanguage: LanguageCode | null;
  dismissSuggestedLanguage: () => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const fallbackContext: I18nContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key, fallbackOrOptions) =>
    typeof fallbackOrOptions === 'string' ? fallbackOrOptions : key,
  translateCategory: (name: string) => CATEGORY_LABELS[name]?.en || name,
  suggestedLanguage: null,
  dismissSuggestedLanguage: () => {},
};

function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return value === 'en' || value === 'fr' || value === 'rw' || value === 'sw';
}

function detectLanguage(): LanguageCode {
  const browserLanguages =
    typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  const joined = browserLanguages.join(' ').toLowerCase();

  if (joined.includes('rw')) {
    return 'rw';
  }
  if (joined.includes('sw') || joined.includes('swa') || joined.includes('kiswahili')) {
    return 'sw';
  }
  if (joined.includes('fr')) {
    return 'fr';
  }

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone === 'Africa/Kigali') {
      return 'rw';
    }
  } catch {
    // Ignore locale detection failures.
  }

  return DEFAULT_LANGUAGE;
}

function getStoredLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguageCode(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage failures.
  }

  return detectLanguage();
}

function resolveTranslation(
  language: LanguageCode,
  key: string,
  options?: TranslateOptions
): string | null {
  const directValue = DICTIONARY[language][key] ?? DICTIONARY[DEFAULT_LANGUAGE][key];
  if (!directValue) {
    return null;
  }

  if (typeof directValue === 'string') {
    return directValue;
  }

  const count = options?.count;
  if (typeof count === 'number') {
    if (count === 0 && directValue.zero) {
      return directValue.zero;
    }
    if (count === 1 && directValue.one) {
      return directValue.one;
    }
  }

  return directValue.other || directValue.one || directValue.zero || null;
}

function interpolate(template: string, options?: TranslateOptions): string {
  const values = {
    ...(typeof options?.count === 'number' ? { count: options.count } : {}),
    ...(options?.values || {}),
  };

  return template.replace(/\{\{(.*?)\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    const value = values[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(getStoredLanguage);
  const [suggestedLanguage, setSuggestedLanguage] = useState<LanguageCode | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Ignore storage failures.
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    try {
      if (localStorage.getItem(SUGGESTION_DISMISSED_KEY) === '1') {
        return;
      }
    } catch {
      // Ignore storage failures.
    }

    const detected = detectLanguage();
    if (detected !== language && detected !== DEFAULT_LANGUAGE) {
      setSuggestedLanguage(detected);
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, fallbackOrOptions, maybeOptions) => {
        const fallback =
          typeof fallbackOrOptions === 'string' ? fallbackOrOptions : undefined;
        const options =
          typeof fallbackOrOptions === 'string' ? maybeOptions : fallbackOrOptions;
        const resolved = resolveTranslation(language, key, options);

        if (!resolved) {
          return fallback || key;
        }

        return interpolate(resolved, options);
      },
      translateCategory: (name: string) =>
        CATEGORY_LABELS[name]?.[language] || CATEGORY_LABELS[name]?.en || name,
      suggestedLanguage,
      dismissSuggestedLanguage: () => {
        setSuggestedLanguage(null);
        try {
          localStorage.setItem(SUGGESTION_DISMISSED_KEY, '1');
        } catch {
          // Ignore storage failures.
        }
      },
    }),
    [language, suggestedLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  return context || fallbackContext;
}
