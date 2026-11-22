import { publicPage } from "@/lib/seo";

export const metadata = publicPage(
  "Create your space",
  "Create a HearMe space with an email and a password. Nothing else is needed, and HearMe does not ask what is on your mind.",
  "/signup",
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
