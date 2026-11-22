import { publicPage } from "@/lib/seo";

export const metadata = publicPage(
  "Terms",
  "HearMe is a daily space to talk and feel accompanied. It is not therapy, diagnosis, or a crisis service, and it does not replace professional care.",
  "/terms",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
