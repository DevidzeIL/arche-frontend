import { useState } from 'react';
import { Bug, GitPullRequest, Lightbulb, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const DEV_EMAIL = 'devidzeil@icloud.com';

type FormState = 'idle' | 'sending' | 'done' | 'error';

/**
 * Форма отправляется через Netlify Forms: статический двойник формы
 * лежит в index.html, отсюда уходит POST с теми же полями.
 * Бэкенд не нужен — Netlify складывает письма в панель и шлёт на почту.
 */
export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<FormState>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setState('sending');
    try {
      const body = new URLSearchParams({
        'form-name': 'contact',
        'bot-field': '',
        name,
        email,
        message,
      }).toString();
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-8">
          <h1 className="font-serif text-4xl font-light">Написать разработчику</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Arche — личный проект, и обратная связь ему полезна: фактические ошибки в заметках,
            баги, идеи новых глав и желание поучаствовать — всё сюда.
          </p>
        </header>

        {/* С чем приходить */}
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/40 p-3">
            <Bug className="mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Ошибки</p>
            <p className="text-xs text-muted-foreground">
              Баги интерфейса и — особенно — фактические ошибки в заметках
            </p>
          </div>
          <div className="rounded-lg border border-border/40 p-3">
            <Lightbulb className="mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Идеи</p>
            <p className="text-xs text-muted-foreground">
              Темы, персоны, события, которых не хватает на карте
            </p>
          </div>
          <div className="rounded-lg border border-border/40 p-3">
            <GitPullRequest className="mb-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Участие</p>
            <p className="text-xs text-muted-foreground">
              Хотите писать заметки или код — напишите, договоримся о доступе
            </p>
          </div>
        </div>

        {state === 'done' ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
            <p className="mb-1 font-medium">Сообщение отправлено</p>
            <p className="text-sm text-muted-foreground">Спасибо! Отвечу на почту, если оставили её.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" name="contact">
            {/* Ловушка для ботов — скрыта от людей */}
            <input type="text" name="bot-field" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium">
                  Имя
                </label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Как к вам обращаться"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium">
                  Почта <span className="text-muted-foreground">(для ответа)</span>
                </label>
                <Input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium">
                Сообщение
              </label>
              <textarea
                id="contact-message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Что случилось или что предлагаете…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {state === 'error' && (
              <p className="text-sm text-red-500">
                Не отправилось. Напишите напрямую:{' '}
                <a className="underline" href={`mailto:${DEV_EMAIL}`}>
                  {DEV_EMAIL}
                </a>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <a
                href={`mailto:${DEV_EMAIL}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <Mail className="h-4 w-4" aria-hidden />
                {DEV_EMAIL}
              </a>
              <Button type="submit" disabled={state === 'sending'}>
                <Send className="mr-2 h-4 w-4" aria-hidden />
                {state === 'sending' ? 'Отправка…' : 'Отправить'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
