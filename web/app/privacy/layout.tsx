import { publicPage } from "@/lib/seo";

export const metadata = publicPage(
  "Privacy",
  "HearMe does not keep what you say, and it does not build a long-term memory of you. Recordings, transcripts, and replies are not stored.",
  "/privacy",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
