export const ASAR_CATEGORIES = [
  { value: "MOVE_TRANSPORT", label: "Перенести и перевезти", icon: "↗" },
  { value: "REPAIR_INSTALL", label: "Починить и установить", icon: "⌁" },
  { value: "CLEAN_PREPARE", label: "Убрать и подготовить", icon: "✦" },
  { value: "COLLECT_DISTRIBUTE", label: "Собрать и распределить", icon: "⊞" },
  { value: "ACCOMPANY_DELIVER", label: "Сопроводить и доставить", icon: "→" },
  { value: "OTHER", label: "Другое", icon: "+" },
] as const;

export type AsarCategory = (typeof ASAR_CATEGORIES)[number]["value"];

export const REQUIREMENT_TYPES = [
  { value: "GENERAL_HELP", label: "Помощники", icon: "●" },
  { value: "SPECIALIST", label: "Специалист", icon: "✦" },
  { value: "TRANSPORT", label: "Транспорт", icon: "↗" },
  { value: "TOOL", label: "Инструмент", icon: "⌁" },
  { value: "MATERIAL", label: "Материал", icon: "◆" },
] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number]["value"];

const asarCategoryValues = new Set<string>(ASAR_CATEGORIES.map((item) => item.value));
const requirementTypeValues = new Set<string>(REQUIREMENT_TYPES.map((item) => item.value));

export function isAsarCategory(value: unknown): value is AsarCategory {
  return typeof value === "string" && asarCategoryValues.has(value);
}

export function isRequirementType(value: unknown): value is RequirementType {
  return typeof value === "string" && requirementTypeValues.has(value);
}

export function normalizeAsarCategory(value: unknown): AsarCategory {
  return isAsarCategory(value) ? value : "OTHER";
}

export function normalizeRequirementType(value: unknown): RequirementType {
  if (value === "PERSON") return "GENERAL_HELP";
  if (value === "RESOURCE") return "MATERIAL";
  return isRequirementType(value) ? value : "GENERAL_HELP";
}

export function requirementTypeInfo(value: unknown) {
  const type = normalizeRequirementType(value);
  return REQUIREMENT_TYPES.find((item) => item.value === type)!;
}

export function isIndividualContribution(value: unknown) {
  const type = normalizeRequirementType(value);
  return type === "GENERAL_HELP" || type === "SPECIALIST";
}
