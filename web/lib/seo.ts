import type { Metadata } from "next";

export const noIndex: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export function publicPage(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    robots: { index: true, follow: true },
  };
}
