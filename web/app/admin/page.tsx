"use client";

import { FormEvent, useEffect, useState } from "react";

type Account = {
  email: string;
  createdAt: string;
  interfaceLocale: string;
  voiceKey: string;
  onboardingDone: boolean;
  online: boolean;
  moodDays: number;
};

type Summary = {
  days: number;
  visitors: number;
  pageViews: number;
  clicks: number;
  bounce: number;
  devices: { mobile: number; desktop: number };
  pages: { path: string; views: number; visitors: number }[];
  clicksByName: { name: string; count: number; visitors: number }[];
  locales: { locale: string; visitors: number }[];
  referrers: { host: string; visitors: number }[];
  daily: { date: string; views: number; visitors: number }[];
  funnel: { id: string; label: string; visitors: number; fromStart: number; fromPrevious: number }[];
  rates: { signupFromLanding: number; callFromSignup: number; endFromCall: number };
  hints: string[];
};

const voiceLabels: Record<string, string> = {
  gentle: "温和",
  calm: "平静",
  warm: "温暖",
  thoughtful: "沉稳",
};

const clickLabels: Record<string, string> = {
  start_talking: "开始说话",
  login: "登录",
  signup: "注册",
  create_account: "创建账号",
  continue_google: "Google 登录",
  change_voice: "更换声音",
  save_mood: "保存心情",
  privacy: "隐私说明",
  end_conversation: "结束通话",
};

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function load(nextDays = days) {
    const response = await fetch(`/api/analytics?days=${nextDays}`);
    if (response.status === 401) {
      setAuthed(false);
      setReady(true);
      return;
    }
    setSummary(await response.json());
    const accountsResponse = await fetch("/api/admin/accounts");
    if (accountsResponse.ok) {
      const body = await accountsResponse.json();
      setAccounts(body.accounts || []);
    }
    setAuthed(true);
    setReady(true);
  }

  useEffect(() => {
    load(days);
    // The range is the only input. Login state is refreshed by the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError(response.status === 503 ? "还没有配置后台密码。" : "密码不对。");
      return;
    }
    setPassword("");
    await load(days);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setSummary(null);
    setAccounts([]);
  }

  if (!ready) return <main className="admin"><p>正在读取统计。</p></main>;
  if (!authed) {
    return (
      <main className="admin">
        <form className="admin-login" onSubmit={login}>
          <p className="brand"><span className="ring" aria-hidden="true" />HearMe</p>
          <h1>统计后台</h1>
          <p>只看访问、点击和转化。不含对话内容。</p>
          <label>密码
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="button" type="submit">进入</button>
        </form>
      </main>
    );
  }
  if (!summary) return <main className="admin"><p>正在读取统计。</p></main>;
  const maxViews = Math.max(1, ...summary.daily.map((day) => day.views));
  const maxFunnel = Math.max(1, ...summary.funnel.map((step) => step.visitors));

  return (
    <main className="admin">
      <header className="admin-top">
        <div>
          <p className="brand"><span className="ring" aria-hidden="true" />HearMe</p>
          <h1>统计</h1>
        </div>
        <div className="admin-tools">
          <div className="range" role="group" aria-label="时间范围">
            <button type="button" className={days === 7 ? "on" : ""} onClick={() => setDays(7)}>7 天</button>
            <button type="button" className={days === 30 ? "on" : ""} onClick={() => setDays(30)}>30 天</button>
          </div>
          <button className="button-secondary" type="button" onClick={logout}>退出</button>
        </div>
      </header>
      <p className="help">这些数字用来看页面结构和转化。不包含录音、文字或回复。</p>
      <section className="admin-card">
        <h2>账号 · {accounts.length}</h2>
        {accounts.length ? (
          <table>
            <thead>
              <tr>
                <th>邮箱</th>
                <th>注册时间</th>
                <th>界面语言</th>
                <th>声音</th>
                <th>引导</th>
                <th>在线</th>
                <th>心情天数</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.email}>
                  <td>{account.email}</td>
                  <td>{account.createdAt ? account.createdAt.slice(0, 16).replace("T", " ") : "—"}</td>
                  <td>{account.interfaceLocale || "—"}</td>
                  <td>{voiceLabels[account.voiceKey] || account.voiceKey || "—"}</td>
                  <td>{account.onboardingDone ? "已完成" : "未完成"}</td>
                  <td>{account.online ? "在线" : "离线"}</td>
                  <td>{account.moodDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="help">还没有账号。</p>}
      </section>
      <section className="stat-grid">
        <article><span>访客</span><strong>{summary.visitors}</strong></article>
        <article><span>页面浏览</span><strong>{summary.pageViews}</strong></article>
        <article><span>功能点击</span><strong>{summary.clicks}</strong></article>
        <article><span>跳出率</span><strong>{summary.bounce}%</strong></article>
      </section>
      <section className="stat-grid rates">
        <article><span>首页到注册</span><strong>{summary.rates.signupFromLanding}%</strong></article>
        <article><span>注册到通话</span><strong>{summary.rates.callFromSignup}%</strong></article>
        <article><span>通话完成</span><strong>{summary.rates.endFromCall}%</strong></article>
        <article><span>设备</span><strong>{summary.devices.desktop} 电脑 / {summary.devices.mobile} 手机</strong></article>
      </section>
      {summary.hints.length ? (
        <section className="admin-card">
          <h2>可以先改的地方</h2>
          <ul>{summary.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>
        </section>
      ) : null}
      <section className="admin-split">
        <article className="admin-card">
          <h2>转化漏斗</h2>
          <p className="help">后一步只计算走过前面每一步的人。</p>
          <ol className="funnel">
            {summary.funnel.map((step) => (
              <li key={step.id}>
                <div><strong>{step.label}</strong><span>{step.visitors} 人 · 上一步 {step.fromPrevious}%</span></div>
                <i style={{ width: `${Math.max(6, (step.visitors / maxFunnel) * 100)}%` }} />
              </li>
            ))}
          </ol>
        </article>
        <article className="admin-card">
          <h2>每日访问</h2>
          {summary.daily.length ? (
            <div className="bars" aria-label="每日页面浏览">
              {summary.daily.map((day) => (
                <div key={day.date} title={`${day.date} ${day.views}`}>
                  <i style={{ height: `${Math.max(8, (day.views / maxViews) * 100)}%` }} />
                  <span>{day.date.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : <p className="help">这个范围里还没有页面浏览。</p>}
        </article>
      </section>
      <section className="admin-split">
        <article className="admin-card">
          <h2>页面</h2>
          <table>
            <thead><tr><th>页面</th><th>浏览</th><th>访客</th></tr></thead>
            <tbody>
              {summary.pages.map((page) => (
                <tr key={page.path}><td>{page.path}</td><td>{page.views}</td><td>{page.visitors}</td></tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="admin-card">
          <h2>功能点击</h2>
          <table>
            <thead><tr><th>功能</th><th>次数</th><th>人数</th></tr></thead>
            <tbody>
              {summary.clicksByName.map((click) => (
                <tr key={click.name}><td>{clickLabels[click.name] || click.name}</td><td>{click.count}</td><td>{click.visitors}</td></tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
      <section className="admin-split">
        <article className="admin-card">
          <h2>来源</h2>
          <table>
            <thead><tr><th>来源</th><th>访客</th></tr></thead>
            <tbody>
              {summary.referrers.map((item) => (
                <tr key={item.host}><td>{item.host === "direct" ? "直接访问" : item.host}</td><td>{item.visitors}</td></tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="admin-card">
          <h2>语言</h2>
          <table>
            <thead><tr><th>界面语言</th><th>访客</th></tr></thead>
            <tbody>
              {summary.locales.map((item) => (
                <tr key={item.locale}><td>{item.locale}</td><td>{item.visitors}</td></tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </main>
  );
}
