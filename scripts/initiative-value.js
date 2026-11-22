// Preserve decimal tie-break values as entered; no DEX recalculation/formulas.
export function initiativeValue(value) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error("Enter a numeric initiative value, such as 18 or 18.19.");
    value = Number(text);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Initiative must be a finite number.");
  return value;
}
