export const MEMBER_OFFERS = [
  { value: "ADVICE", label: "Дать совет", profileLabel: "Может подсказать", icon: "💬" },
  { value: "INTRODUCE_PERSON", label: "Познакомить с человеком", profileLabel: "Может познакомить", icon: "↗" },
  { value: "LOCAL_INFORMATION", label: "Подтвердить местную информацию", profileLabel: "Знает местную информацию", icon: "⌖" },
  { value: "FOOD_OR_TEA", label: "Приготовить чай или еду", profileLabel: "Может приготовить чай или еду", icon: "☕" },
  { value: "SPACE", label: "Предоставить помещение", profileLabel: "Может помочь с помещением", icon: "⌂" },
  { value: "CALL_PARTICIPANTS", label: "Позвонить другим участникам", profileLabel: "Может обзвонить участников", icon: "☎" },
  { value: "COORDINATION", label: "Помочь с координацией", profileLabel: "Может помочь с координацией", icon: "◎" },
  { value: "TOOL", label: "Поделиться инструментом", profileLabel: "Может поделиться инструментом", icon: "⌁" },
  { value: "EXPERIENCE", label: "Передать опыт", profileLabel: "Может научить и передать опыт", icon: "✦" },
] as const;

export const RECEIVE_ONLY_OFFER = "RECEIVE_ONLY" as const;

export type MemberOffer = (typeof MEMBER_OFFERS)[number]["value"] | typeof RECEIVE_ONLY_OFFER;

const memberOfferValues = new Set<string>([
  ...MEMBER_OFFERS.map((item) => item.value),
  RECEIVE_ONLY_OFFER,
]);

export function isMemberOffer(value: unknown): value is MemberOffer {
  return typeof value === "string" && memberOfferValues.has(value);
}

export function normalizeMemberOffers(values: unknown): MemberOffer[] | null {
  if (!Array.isArray(values) || values.some((value) => !isMemberOffer(value))) return null;
  const unique = [...new Set(values)] as MemberOffer[];
  if (unique.includes(RECEIVE_ONLY_OFFER) && unique.length > 1) return null;
  return unique;
}

export function memberOfferInfo(value: MemberOffer) {
  if (value === RECEIVE_ONLY_OFFER) {
    return { value, label: "Сейчас только принимать помощь", profileLabel: "Пока не принимает новые просьбы", icon: "○" };
  }
  return MEMBER_OFFERS.find((item) => item.value === value)!;
}
