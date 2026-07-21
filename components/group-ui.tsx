import Link from "next/link";
import type { GroupSummary } from "../lib/types";

export function GroupAvatar({ group, size = "medium" }: { group: Pick<GroupSummary, "name" | "photoUrl">; size?: "small" | "medium" | "large" }) {
  return <span className={`group-avatar group-avatar-${size} ${group.photoUrl ? "has-photo" : ""}`} style={group.photoUrl ? { backgroundImage: `url(${group.photoUrl})` } : undefined}>{!group.photoUrl && group.name.trim().slice(0, 1).toUpperCase()}</span>;
}

export function GroupCard({ group, selected, onSelect }: { group: GroupSummary; selected?: boolean; onSelect?: () => void }) {
  const content = <><GroupAvatar group={group} /><span className="group-card-copy"><strong>{group.name}</strong><small>{group.memberCount} участников · {group.asarCount} дел</small>{group.description && <small>{group.description}</small>}</span><span className="group-card-arrow">{selected ? "✓" : "›"}</span></>;
  if (onSelect) return <button type="button" className={`group-list-card ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>{content}</button>;
  return <Link className="group-list-card" href={`/app/groups/${group.id}`}>{content}</Link>;
}
