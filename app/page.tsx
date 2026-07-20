import Link from "next/link";
import type { Metadata } from "next";
import { Brand, ReadinessOrb } from "../components/asar-ui";

export const metadata: Metadata = {
  title: "Asar — готовность общего дела",
  description: "Соберите людей и ресурсы вокруг одного общего дела — и заранее увидьте риск срыва.",
};

const steps = [
  ["01", "Опишите дело", "Назначьте дату, место и конкретные потребности."],
  ["02", "Поделитесь одной ссылкой", "Люди берут роль без регистрации и оставляют контакт."],
  ["03", "Управляйте готовностью", "Критический отказ сразу показывает, кого или что искать."],
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="topbar container">
        <Brand />
        <div className="topbar-actions">
          <a className="text-link hide-mobile" href="#how">Как это работает</a>
          <Link className="button button-ghost" href="/app/asars">Войти</Link>
        </div>
      </nav>

      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><i /> Система операционной готовности</span>
          <h1>Общее дело<br /><em>без хаоса</em> в чатах.</h1>
          <p className="hero-lead">Соберите людей и ресурсы вокруг одного асара. Видьте, кто взял ответственность, что подтверждено и без чего дело не состоится.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/app/asars/new">Собрать асар <span>↗</span></Link>
            <a className="button button-plain button-large" href="#demo">Посмотреть пример</a>
          </div>
          <p className="microcopy">Участникам не нужен аккаунт · бесплатно для локальных инициатив</p>
        </div>

        <div className="hero-demo" id="demo">
          <div className="demo-label"><span>Живой статус</span><b>Обновлено сейчас</b></div>
          <article className="asar-showcase">
            <div className="card-meta"><span>СОСЕДСКИЙ КРУГ</span><span>25 ИЮЛЯ · 10:00</span></div>
            <h2>Подготовить двор<br />апай к зиме</h2>
            <ReadinessOrb state="NOT_READY" percent={72} segments={["done", "done", "pending", "empty"]} />
            <div className="status-copy risk"><span className="status-dot" /><div><strong>Асар пока не готов</strong><small>Не хватает: грузовая машина</small></div></div>
            <div className="mini-progress">
              <div><span>Помощники</span><b>4 / 4</b></div><i><u style={{ width: "100%" }} /></i>
              <div><span>Ресурсы</span><b>2 / 3</b></div><i><u style={{ width: "66%" }} /></i>
            </div>
            <button className="button button-danger-wide">Поделиться нехваткой <span>↗</span></button>
          </article>
          <div className="floating-note"><b>!</b><span><strong>Риск виден заранее</strong><small>До начала ещё 5 дней</small></span></div>
        </div>
      </section>

      <section className="promise-strip">
        <div className="container promise-grid"><strong>Чат хранит разговор.</strong><span>Asar хранит состояние реального дела.</span><i>Кто</i><i>Что</i><i>Когда</i><i>Подтвердил?</i></div>
      </section>

      <section className="how container" id="how">
        <span className="section-kicker">Как это работает</span>
        <h2>От обещания —<br />к выполненному делу.</h2>
        <div className="step-grid">
          {steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="truth container">
        <div><span className="eyebrow light"><i /> Честное обещание</span><h2>Мы не управляем добротой людей.</h2><p>Мы управляем риском срыва помощи.</p></div>
        <blockquote>«Если критический участник отменяет участие, асар мгновенно возвращается в режим набора — и инициатор распространяет только возникшую нехватку.»</blockquote>
      </section>

      <footer className="footer container"><Brand /><p>Сделано для тех, кто собирает людей вокруг добрых дел.</p><Link href="/app/asars/new">Начать асар →</Link></footer>
    </main>
  );
}
