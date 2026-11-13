import type { Metadata } from "next";
import { he } from "@/i18n/he";

export const metadata: Metadata = { title: he.nav.add };

export default function AddPage() {
  return <h1 className="text-2xl font-semibold">{he.nav.add}</h1>;
}
