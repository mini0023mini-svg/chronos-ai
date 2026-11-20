import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useErrorText } from '@/hooks/useErrorText';
import { ErrorState } from './ui/ErrorState';

interface Props {
  children: ReactNode;
  /** 该值变化时自动清除错误态（通常传当前路由 pathname） */
  resetKey?: string;
  /** 把错误对象转为用户可读文案 */
  errorText: (err: unknown) => string;
}

interface State {
  hasError: boolean;
  message: string;
}

/** 捕获子树渲染异常，展示统一 ErrorState 并提供重试；路由切换自动恢复 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CHRONOS AI] Render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // 路由变化后自动清除错误，避免"页面切走了还停在错误页"
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          description={this.props.errorText(new Error(this.state.message))}
          onRetry={() => this.setState({ hasError: false, message: '' })}
        />
      );
    }
    return this.props.children;
  }
}

/** 外层包装：注入当前语言文案函数与路由 resetKey */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const errorText = useErrorText();
  const location = useLocation();
  return <ErrorBoundaryInner errorText={errorText} resetKey={location.pathname}>{children}</ErrorBoundaryInner>;
}
