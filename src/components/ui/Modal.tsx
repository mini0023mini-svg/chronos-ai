import { useEffect, type ReactNode } from 'react';
import { Button } from './Button';
import { useI18n } from '@/hooks/useI18n';

export interface ModalProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

export function Modal({ open, title, children, onClose, footer }: ModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="surface-card w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label={title}>
        {title && <h2 className="mb-4 text-lg font-semibold text-ink">{title}</h2>}
        <div className="text-sm text-ink">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          {footer ?? (
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
