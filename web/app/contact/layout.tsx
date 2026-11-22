import { publicPage } from "@/lib/seo";

export const metadata = publicPage(
  "Contact",
  "Contact the person who set up HearMe for you. HearMe does not ask for your name, age, or what is on your mind.",
  "/contact",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
