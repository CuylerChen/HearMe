"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/Frames";
import { useApp } from "@/components/AppState";

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function MoodPage() {
  const { t, locale } = useApp();
  const today = isoDate(new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [moods, setMoods] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState(today);
  const [level, setLevel] = useState(0);
  const names = [t.veryLow, t.low, t.okay, t.good, t.veryGood];

  useEffect(() => {
    fetch("/api/mood").then((response) => response.json()).then((body) => {
      const next: Record<string, number> = {};
      for (const item of body.moods || []) next[item.date] = item.level;
      setMoods(next);
      if (next[today]) setLevel(next[today]);
    });
  }, [today]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first).fill(""), ...Array.from({ length: days }, (_, index) => String(index + 1))];
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2026, 10, 1 + index).toLocaleDateString(locale, { weekday: "short" }));
  const selectedDate = new Date(`${selected}T12:00:00`);

  function dateFor(day: string) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  function pick(date: string) {
    setSelected(date);
    setLevel(moods[date] || 0);
  }

  async function save() {
    if (!level) return;
    await fetch("/api/mood", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: selected, level }),
    });
    setMoods((current) => ({ ...current, [selected]: level }));
  }

  async function clear() {
    await fetch(`/api/mood?date=${selected}`, { method: "DELETE" });
    setMoods((current) => {
      const next = { ...current };
      delete next[selected];
      return next;
    });
    setLevel(0);
  }

  return (
    <AppFrame>
      <section className="mood-page">
        <h1>{t.moodTitle}</h1>
        <p className="help">{t.moodDaily}</p>
        <div className="mood-layout">
          <section className="cal-card" aria-label={t.moodTitle}>
            <div className="cal-head">
              <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label={new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}>‹</button>
              <strong>{cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}</strong>
              <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label={new Date(year, month + 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" })}>›</button>
            </div>
            <div className="cal-grid">
              {weekdays.map((name, index) => <div className="cal-name" key={`${name}${index}`}>{name}</div>)}
              {cells.map((day, index) => day ? (
                <button
                  key={dateFor(day)}
                  type="button"
                  className={`cal-day${moods[dateFor(day)] ? ` l${moods[dateFor(day)]}` : ""}${selected === dateFor(day) ? " selected" : ""}`}
                  onClick={() => pick(dateFor(day))}
                  aria-pressed={selected === dateFor(day)}
                >
                  <b>{day}</b>
                  {moods[dateFor(day)] ? <small>{moods[dateFor(day)]}</small> : null}
                </button>
              ) : <span key={`empty-${index}`} />)}
            </div>
          </section>
          <section className="mood-panel">
            <h2>{selectedDate.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}</h2>
            <p>{t.oneChoice}</p>
            <div className="mood-choices" role="radiogroup" aria-label={t.feelingNow}>
              {names.map((name, index) => (
                <button key={name} type="button" role="radio" aria-checked={level === index + 1} className={level === index + 1 ? "mood-choice on" : "mood-choice"} onClick={() => setLevel(index + 1)}>
                  <i className={`d${index + 1}`} aria-hidden="true" />
                  {name}
                </button>
              ))}
            </div>
            <div className="mood-actions">
              <button className="button" type="button" data-track="save_mood" onClick={save} disabled={!level}>{t.save}</button>
              <button className="button-secondary" type="button" onClick={clear}>{t.clear}</button>
            </div>
          </section>
        </div>
      </section>
    </AppFrame>
  );
}
