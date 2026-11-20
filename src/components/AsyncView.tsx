import type { ReactNode } from 'react';
import type { AsyncState } from '@/types/api';
import { useErrorText } from '@/hooks/useErrorText';
import { LoadingState } from './ui/LoadingState';
import { EmptyState } from './ui/EmptyState';
import { ErrorState } from './ui/ErrorState';

export interface AsyncViewProps<T> {
  state: AsyncState<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}

/** 统一把 useAsync 的三态映射为 loading / error / empty / content */
export function AsyncView<T>({ state, isEmpty, empty, onRetry, children }: AsyncViewProps<T>) {
  const errorText = useErrorText();
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState description={errorText(state.error)} onRetry={onRetry} />;
  if (state.data === null) return <ErrorState onRetry={onRetry} />;
  if (isEmpty?.(state.data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(state.data)}</>;
}
