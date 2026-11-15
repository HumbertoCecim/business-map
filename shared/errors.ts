/** Keep recovery instructions while hiding transport metadata from product UI. */
export function friendlyError(error: unknown): string {
  let value = error instanceof Error ? error.message : String(error);
  value = value.replace(/^\s*(?:Error:\s*)?Request failed:\s*/i, "");
  const metadata = value.search(/\s*[([]?\s*requestType\s*=/i);
  if (metadata >= 0) value = value.slice(0, metadata);
  return (
    value.replace(/^CONFLICT:\s*/i, "").trim() ||
    "Não foi possível concluir. Tente novamente."
  );
}
