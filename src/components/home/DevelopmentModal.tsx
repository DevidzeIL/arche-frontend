import { useState, useEffect } from 'react';
import { Mail, Code } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function DevelopmentModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Проверяем, показывали ли уже модалку
    const hasSeenModal = localStorage.getItem('arche-dev-modal-seen');
    if (!hasSeenModal) {
      setOpen(true);
      localStorage.setItem('arche-dev-modal-seen', 'true');
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)]">
        <DialogClose onClose={() => setOpen(false)} />
        <DialogHeader>
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <Code className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
            <DialogTitle className="text-base sm:text-lg">Сайт в разработке</DialogTitle>
          </div>
          <DialogDescription className="text-left space-y-2 sm:space-y-3 text-sm">
            <p>
              Arche находится в активной разработке. Некоторые функции могут работать нестабильно или отсутствовать.
            </p>
            <p>
              Если у вас есть вопросы, предложения или вы нашли ошибку, пожалуйста, свяжитесь с нами:
            </p>
            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a
                href="mailto:devidzeil@icloud.com"
                className="text-primary hover:underline font-medium break-all"
              >
                devidzeil@icloud.com
              </a>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end pt-3 sm:pt-4">
          <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Понятно
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

