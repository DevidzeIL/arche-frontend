import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useArcheStore } from '../state/store';
import { cn } from '@/lib/utils';

interface WikilinkButtonProps {
  title: string;
  displayText?: string;
}

export function WikilinkButton({ title, displayText }: WikilinkButtonProps) {
  const openNote = useArcheStore((state) => state.openNote);
  const getNoteByTitle = useArcheStore((state) => state.getNoteByTitle);

  const note = getNoteByTitle(title);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        if (note) {
          openNote(note.id);
        }
      }}
      className={cn(
        'text-primary hover:underline font-medium inline',
        !note && 'text-muted-foreground opacity-60'
      )}
      title={note ? `Открыть: ${title}` : `Заметка не найдена: ${title}`}
    >
      {displayText || title}
      {!note && ' (?)'}
    </button>
  );
}

// Преобразуем wikilinks в markdown-ссылки перед рендерингом
function preprocessWikilinks(content: string): string {
  // Заменяем [[Title]] и [[Title|Alias]] на markdown-ссылки с специальным форматом
  return content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, linkText) => {
      const [title, alias] = linkText.split('|').map((s: string) => s.trim());
      const displayText = alias || title;
      // Используем специальный формат, который мы распознаем в компоненте
      return `[${displayText}](wikilink:${title})`;
    }
  );
}

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const processedContent = preprocessWikilinks(content);

  return (
    <div className={cn('prose prose-slate dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-7 prose-a:text-primary prose-strong:font-semibold', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            // Обработка wikilinks
            if (href?.startsWith('wikilink:')) {
              const title = href.replace('wikilink:', '');
              return <WikilinkButton title={title} displayText={String(children)} />;
            }
            // Обычные ссылки
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h1 className="text-3xl font-bold mt-8 mb-4">{children}</h1>,
          h2: ({ children }) => <h2 className="text-2xl font-semibold mt-6 mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xl font-semibold mt-4 mb-2">{children}</h3>,
          p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc mb-4 ml-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal mb-4 ml-6">{children}</ol>,
          li: ({ children }) => <li className="mb-2">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
            }
            return <code className={className}>{children}</code>;
          },
          pre: ({ children }) => <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4">{children}</pre>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-muted-foreground pl-4 italic my-4">{children}</blockquote>,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
