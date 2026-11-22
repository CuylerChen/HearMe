import { publicPage } from "@/lib/seo";

export const metadata = publicPage(
  "Log in",
  "Log in to your HearMe space. Each call is new, and HearMe does not keep what you said last time.",
  "/login",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
