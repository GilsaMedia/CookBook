import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { AddScreen } from "./AddScreen";

export const metadata: Metadata = { title: he.nav.add };

export default function AddPage() {
  return <AddScreen />;
}
