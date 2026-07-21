import type { Metadata } from "next";
import { TelegramEntry } from "../components/telegram-entry";

export const metadata: Metadata = {
  title: "Asar Mini App",
  description: "Люди, ресурсы и готовность общего дела — внутри Telegram.",
};

export default function Home() {
  return <TelegramEntry />;
}
