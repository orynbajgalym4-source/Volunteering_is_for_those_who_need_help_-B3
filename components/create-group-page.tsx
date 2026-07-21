"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "./asar-ui";
import { GroupCreator } from "./group-creator";

export function CreateGroupPage() {
  const router = useRouter();
  return <div className="app-page"><AppHeader title="Новая группа" /><main className="app-main wizard-shell"><div className="page-heading"><div><span className="section-kicker">Новый круг</span><h1>Создайте группу</h1><p>Группа объединяет людей и хранит историю ваших общих дел.</p></div></div><section className="panel"><GroupCreator onCreated={(group) => router.push(`/app/groups/${group.id}`)} onCancel={() => router.push("/app/profile")} /></section></main></div>;
}
