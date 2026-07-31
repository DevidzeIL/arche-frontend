import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { useArcheStore } from '../state/store';
import { resolveImage } from '../images';
import { cn } from '@/lib/utils';

// Разрешение путей к картинкам вынесено в src/arche/images.ts —
// им пользуется и карта, и этот рендер
const getImageUrl = resolveImage;

interface WikilinkButtonProps {
  title: string;
  displayText?: string;
}

export function WikilinkButton({ title, displayText }: WikilinkButtonProps) {
  const navigate = useNavigate();
  const getNoteByTitle = useArcheStore((state) => state.getNoteByTitle);

  const note = getNoteByTitle(title);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (note) {
      navigate(`/note/${note.id}`);
    }
  };

  // Используем span вместо <a>, чтобы браузер не мог обработать это как ссылку
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (note) {
            navigate(`/note/${note.id}`);
          }
        }
      }}
      className={cn(
        'text-primary hover:underline font-medium inline cursor-pointer',
        !note && 'text-muted-foreground opacity-60 cursor-not-allowed'
      )}
      title={note ? `Открыть: ${title}` : `Заметка не найдена: ${title}`}
    >
      {displayText || title}
      {!note && ' (?)'}
    </span>
  );
}

// Преобразуем wikilinks в markdown-ссылки перед рендерингом
function preprocessWikilinks(content: string): string {
  let processed = content;
  
  // Сначала обрабатываем изображения с wikilinks: ![[filename]] или ![[filename|alt]]
  processed = processed.replace(
    /!\[\[([^\]]+)\]\]/g,
    (_match, linkText) => {
      const [filename, alt] = linkText.split('|').map((s: string) => s.trim());
      return `![${alt || filename}](${encodeURI(`/arche-vault/_imgs/${filename}`)})`;
    }
  );

  // Затем обрабатываем изображения с wikilinks в формате markdown: ![alt](wikilink:filename)
  processed = processed.replace(
    /!\[([^\]]*)\]\(wikilink:([^\)]+)\)/g,
    (_match, alt, filename) => `![${alt}](${encodeURI(`/arche-vault/_imgs/${filename}`)})`
  );

  // Затем обрабатываем обычные wikilinks: [[Title]] и [[Title|Alias]]
  //
  // КРИТИЧНО: название кодируется. Адрес markdown-ссылки не может содержать
  // пробел — парсер обрывается и оставляет на странице сырой текст вида
  // `[Нового времени](wikilink:Новое время)`. А многословных названий
  // в хранилище большинство.
  processed = processed.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, linkText) => {
      const [title, alias] = linkText.split('|').map((s: string) => s.trim());
      const displayText = alias || title;
      return `[${displayText}](wikilink:${encodeURIComponent(title)})`;
    }
  );

  return processed;
}

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const processedContent = preprocessWikilinks(content);
  const navigate = useNavigate();

  // Функция для определения, является ли ссылка внутренней
  const isInternalLink = (href: string | undefined): boolean => {
    if (!href) return false;
    // Внутренние ссылки: начинаются с / (но не якорные ссылки #)
    // Исключаем внешние ссылки (http://, https://, mailto:) и якорные (#)
    return href.startsWith('/') && !href.startsWith('#');
  };

  return (
    <div className={cn('prose max-w-none prose-headings:font-semibold prose-p:leading-7 prose-a:text-primary prose-strong:font-semibold', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            // Обработка wikilinks
            if (href?.startsWith('wikilink:')) {
              const raw = href.replace('wikilink:', '');
              // Название закодировано при препроцессинге — возвращаем как было
              let title = raw;
              try {
                title = decodeURIComponent(raw);
              } catch {
                // Некорректная escape-последовательность — берём как есть
              }
              return <WikilinkButton title={title} displayText={String(children)} />;
            }
            
            // Обработка внутренних ссылок (используем роутинг)
            if (isInternalLink(href)) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) {
                      navigate(href);
                    }
                  }}
                  className="text-primary hover:underline cursor-pointer"
                  {...props}
                >
                  {children}
                </a>
              );
            }
            
            // Якорные ссылки (остаются на той же странице)
            if (href?.startsWith('#')) {
              return (
                <a
                  href={href}
                  className="text-primary hover:underline"
                  {...props}
                >
                  {children}
                </a>
              );
            }
            
            // Внешние ссылки (открываем в новой вкладке)
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
          img: ({ src, alt, ...props }) => {
            if (!src) return null;
            
            let imageSrc = src;
            
            // Если это путь к изображению из _imgs
            if (src.includes('_imgs/') || src.startsWith('/arche-vault/_imgs/')) {
              // Убеждаемся, что путь начинается с /arche-vault/_imgs/
              if (!src.startsWith('/arche-vault/_imgs/')) {
                const filename = src.split('/').pop() || src;
                imageSrc = `/arche-vault/_imgs/${filename}`;
              }
              
              // Пытаемся также найти через import.meta.glob (если доступно)
              const filename = imageSrc.split('/').pop() || '';
              const url = getImageUrl(filename);
              if (url) {
                imageSrc = url;
              }
            }
            
            return (
              <img
                src={imageSrc}
                alt={alt || ''}
                className="max-w-full h-auto rounded-lg my-4 border border-border shadow-sm"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  // Показываем placeholder
                  const placeholder = document.createElement('div');
                  placeholder.className = 'my-4 p-4 border border-dashed border-muted-foreground/30 rounded-lg bg-muted/30 text-sm text-muted-foreground';
                  placeholder.textContent = `Изображение не найдено: ${imageSrc.split('/').pop()}`;
                  target.parentNode?.insertBefore(placeholder, target);
                }}
                {...props}
              />
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
