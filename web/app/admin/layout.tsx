import { noIndex } from "@/lib/seo";

export const metadata = { ...noIndex, title: "统计" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
