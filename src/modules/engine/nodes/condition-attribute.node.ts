export type ConditionType = 'tag' | 'custom_field';
export type ConditionOperator =
  | 'exists'
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than';

export interface ConditionAttributePayload {
  type: ConditionType;
  tag?: string;
  field?: string;
  operator?: ConditionOperator;
  value?: string | number | boolean;
  trueRoute: string;
  falseRoute: string;
}

export interface ContactData {
  tags: string[];
  customFields: unknown;
}

/**
 * Avalia o nó condition:attribute verificando se o contato possui uma tag ou campo customizado.
 * Retorna o próximo passo (trueRoute ou falseRoute) de acordo com o resultado booleano.
 */
export function evaluateConditionAttributeNode(
  contact: ContactData,
  payload: ConditionAttributePayload
): { result: boolean; nextStepKey: string } {
  const { type, tag, field, operator = 'equals', value, trueRoute, falseRoute } = payload;

  let isMatch = false;

  if (type === 'tag') {
    const targetTag = tag ?? String(value ?? '');
    isMatch = contact.tags.includes(targetTag);
  } else if (type === 'custom_field' && field) {
    const customFieldsObj =
      typeof contact.customFields === 'object' && contact.customFields !== null
        ? (contact.customFields as Record<string, unknown>)
        : {};

    const actualVal = customFieldsObj[field];

    switch (operator) {
      case 'exists':
        isMatch = actualVal !== undefined && actualVal !== null && actualVal !== '';
        break;

      case 'equals':
        isMatch = String(actualVal ?? '').trim().toLowerCase() === String(value ?? '').trim().toLowerCase();
        break;

      case 'not_equals':
        isMatch = String(actualVal ?? '').trim().toLowerCase() !== String(value ?? '').trim().toLowerCase();
        break;

      case 'contains':
        isMatch = String(actualVal ?? '')
          .toLowerCase()
          .includes(String(value ?? '').toLowerCase());
        break;

      case 'greater_than':
        isMatch = Number(actualVal) > Number(value);
        break;

      case 'less_than':
        isMatch = Number(actualVal) < Number(value);
        break;

      default:
        isMatch = false;
        break;
    }
  }

  const nextStepKey = isMatch ? trueRoute : falseRoute;

  return {
    result: isMatch,
    nextStepKey,
  };
}
