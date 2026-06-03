export function isNoQuestionPlaceholder(text: string) {
  const normalized = text.toUpperCase().replace(/[^A-Z_]/g, '');
  return normalized.length > 0 && normalized.replace(/NO_QUESTION/g, '') === '';
}
