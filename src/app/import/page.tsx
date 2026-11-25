import type { Metadata } from "next";
import { he } from "@/i18n/he";
import { ImportScreen } from "./ImportScreen";

export const metadata: Metadata = { title: he.bulk.title };

export default function ImportPage() {
  return <ImportScreen />;
}
