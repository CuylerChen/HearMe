const key = "__hearmeAudio";

export function preparedContext() {
  const context = (window as unknown as Record<string, AudioContext | undefined>)[key];
  if (!context || context.state === "closed") return null;
  return context;
}

export async function unlockAudio() {
  const existing = preparedContext();
  const context = existing || new AudioContext();
  (window as unknown as Record<string, AudioContext>)[key] = context;
  if (context.state !== "running") await context.resume();
  return context;
}
