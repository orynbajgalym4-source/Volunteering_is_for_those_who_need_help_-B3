"use client";

import { MEMBER_OFFERS, RECEIVE_ONLY_OFFER, memberOfferInfo, type MemberOffer } from "../lib/member-offers";

export function OfferChips({ offers, limit }: { offers: MemberOffer[]; limit?: number }) {
  const visible = typeof limit === "number" ? offers.slice(0, limit) : offers;
  if (!offers.length) return <span className="offer-empty">Пока не указано</span>;
  return <div className="offer-chips">{visible.map((offer) => { const info = memberOfferInfo(offer); return <span className={`offer-chip ${offer === RECEIVE_ONLY_OFFER ? "quiet" : ""}`} key={offer}><i>{info.icon}</i>{info.profileLabel}</span>; })}{limit && offers.length > limit ? <span className="offer-chip more">+{offers.length - limit}</span> : null}</div>;
}

export function OfferSelector({ value, onChange }: { value: MemberOffer[]; onChange: (offers: MemberOffer[]) => void }) {
  const toggle = (offer: MemberOffer) => {
    if (offer === RECEIVE_ONLY_OFFER) return onChange(value.includes(offer) ? [] : [offer]);
    const withoutQuiet = value.filter((item) => item !== RECEIVE_ONLY_OFFER);
    onChange(withoutQuiet.includes(offer) ? withoutQuiet.filter((item) => item !== offer) : [...withoutQuiet, offer]);
  };
  return <div className="offer-selector" role="group" aria-label="С чем можно обращаться">
    {MEMBER_OFFERS.map((offer) => <button type="button" className={value.includes(offer.value) ? "selected" : ""} aria-pressed={value.includes(offer.value)} onClick={() => toggle(offer.value)} key={offer.value}><span>{offer.icon}</span><strong>{offer.label}</strong></button>)}
    <button type="button" className={`receive-only ${value.includes(RECEIVE_ONLY_OFFER) ? "selected" : ""}`} aria-pressed={value.includes(RECEIVE_ONLY_OFFER)} onClick={() => toggle(RECEIVE_ONLY_OFFER)}><span>○</span><strong>Сейчас только принимать помощь</strong></button>
  </div>;
}
