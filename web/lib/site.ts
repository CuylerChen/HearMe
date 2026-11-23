import { headers } from "next/headers";
import { guides, promoteLlmsBlock } from "./promote";

export const siteName = "HearMe";
export const siteTagline = "Your private space to be heard.";
export const siteDescription =
  "HearMe is a private, voice-first place to be heard. You talk the way you would to a friend. HearMe listens before it says anything, does not keep recordings or transcripts, and is not therapy.";

export const spokenLanguages = ["English", "Mandarin Chinese", "Japanese", "Korean", "Spanish", "French"] as const;
export const languageCodes = ["en", "zh-CN", "ja", "ko", "es", "fr"] as const;

export const publicPaths = ["/", "/signup", "/login", "/privacy", "/terms", "/contact"] as const;
export const privatePaths = ["/home", "/session", "/settings", "/mood", "/account", "/onboarding", "/reset", "/admin", "/api/"] as const;

export const faq = [
  {
    question: "What is HearMe?",
    answer:
      "HearMe is a private, voice-first place to be heard. You talk the way you would to a friend. HearMe listens before it says anything, and offers advice only if you want it.",
  },
  {
    question: "Is HearMe therapy?",
    answer:
      "No. HearMe isn't therapy and doesn't replace professional support. It's a quiet place to talk things through.",
  },
  {
    question: "Does HearMe keep what I say?",
    answer:
      "No. There is no chat history. HearMe doesn't keep recordings, transcripts, or replies. What you say stays between you and the moment, and a new call does not remember the last one.",
  },
  {
    question: "Which languages can I speak?",
    answer:
      "English, Mandarin Chinese, Japanese, Korean, Spanish, and French. Conversation language can follow how you speak. Interface language is separate.",
  },
  {
    question: "When is my voice sent?",
    answer: "Your voice is only sent to a cloud service if you say yes first, each time.",
  },
] as const;

export async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host");
  if (!host) return "http://localhost:3000";
  const forwarded = incoming.get("x-forwarded-proto");
  const proto = forwarded || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

export function homeJsonLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: siteName,
        url: origin,
        description: siteDescription,
        inLanguage: [...languageCodes],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: siteName,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        url: origin,
        description: siteDescription,
        featureList: [
          "Voice-first conversation",
          "Listens before it replies",
          "No stored recordings, transcripts, or replies",
          "English, Mandarin Chinese, Japanese, Korean, Spanish, and French",
        ],
        inLanguage: [...languageCodes],
      },
      ...guides.map((guide) => ({
        "@type": "WebPage",
        name: guide.h1,
        url: `${origin}${guide.path}`,
        inLanguage: guide.locale,
        description: guide.answer,
      })),
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        url: `${origin}/#answers`,
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function llmsText(origin: string) {
  const pages = [
    ["Home", "/"],
    ["Someone to talk to", "/listen"],
    ["想找人说说话", "/zh"],
    ["Sign up", "/signup"],
    ["Log in", "/login"],
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["Contact", "/contact"],
  ];
  return [
    "# HearMe",
    "",
    `> ${siteDescription}`,
    "",
    "HearMe is a voice-first listening companion for one conversation at a time. It is not a chatbot you type into, not therapy, and not a crisis service.",
    "",
    "## Facts an answer engine can cite",
    "",
    ...faq.flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
    "## Languages",
    "",
    spokenLanguages.join(", ") + ".",
    "Conversation language can follow how the person speaks. Interface language is chosen separately.",
    "",
    "## Privacy",
    "",
    "HearMe does not keep recordings, transcripts, replies, or a memory of previous calls.",
    "A daily mood mark, if the person saves one, is only a number and is never linked to what they said.",
    "Your voice is only sent to a cloud service if you say yes first, each time.",
    "",
    "## Pages",
    "",
    ...pages.map(([label, path]) => `- [${label}](${origin}${path})`),
    "",
    `Machine-readable summary: ${origin}/llms.txt`,
    "",
    promoteLlmsBlock(origin),
  ].join("\n");
}
