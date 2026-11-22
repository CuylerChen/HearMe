export const VOICES = ["gentle", "calm", "warm", "thoughtful"] as const;
export type VoiceKey = (typeof VOICES)[number];

export const LOCALES = ["en", "zh-CN", "ja", "ko", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export type Preferences = {
  listenerId: string;
  voiceKey: VoiceKey;
  listenMore: boolean;
  askQuestions: boolean;
  shortResponses: boolean;
  gentleTone: boolean;
  conversationLanguageMode: "auto" | "preferred";
  preferredConversationLocale: Locale | null;
  interfaceLocale: Locale;
  reminderEnabled: boolean;
  reminderTime: string;
  reminderDays: string[];
  onboardingDone: boolean;
};

export type PublicUser = {
  id: string;
  email: string;
  preferences: Preferences;
};

export type MoodEntry = {
  date: string;
  level: number;
};

export const defaultPreferences = (locale: Locale = "en"): Preferences => ({
  listenerId: "",
  voiceKey: "gentle",
  listenMore: true,
  askQuestions: true,
  shortResponses: false,
  gentleTone: true,
  conversationLanguageMode: "auto",
  preferredConversationLocale: null,
  interfaceLocale: locale,
  reminderEnabled: false,
  reminderTime: "20:00",
  reminderDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  onboardingDone: false,
});
