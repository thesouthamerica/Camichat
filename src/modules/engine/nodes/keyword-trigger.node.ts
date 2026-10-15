export type MatchType = 'exact' | 'contains' | 'regex';

export interface KeywordTriggerConfig {
  keywords: string[];
  matchType?: MatchType;
}

/**
 * Avalia se o texto fornecido pelo usuário coincide com as palavras-chave cadastradas.
 * Suporta correspondência exata, contém (substring) ou expressão regular (regex).
 */
export function evaluateKeywordTrigger(
  userInput: string,
  config: KeywordTriggerConfig
): boolean {
  if (!userInput || !config.keywords || config.keywords.length === 0) {
    return false;
  }

  const normalizedInput = userInput.trim().toLowerCase();
  const matchType = config.matchType ?? 'contains';

  for (const keyword of config.keywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();

    switch (matchType) {
      case 'exact':
        if (normalizedInput === normalizedKeyword) {
          return true;
        }
        break;

      case 'contains':
        if (normalizedInput.includes(normalizedKeyword)) {
          return true;
        }
        break;

      case 'regex':
        try {
          const regex = new RegExp(keyword, 'i');
          if (regex.test(userInput)) {
            return true;
          }
        } catch (e) {
          console.warn(`[KeywordTrigger] Expressão regular inválida: "${keyword}"`, e);
        }
        break;
    }
  }

  return false;
}
