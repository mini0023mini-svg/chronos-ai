import { useCallback, useEffect, useState } from 'react';

/** 浏览器 beforeinstallprompt 事件的最小类型定义（非所有浏览器都支持） */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaInstallState {
  /** 是否可以显示安装提示（浏览器已触发 beforeinstallprompt 且用户未永久忽略） */
  canInstall: boolean;
  /** 是否已作为独立应用运行（安装在桌面/主屏） */
  isStandalone: boolean;
  /** 触发安装流程；返回用户是否接受 */
  install: () => Promise<boolean>;
  /** 用户忽略本次提示（本次会话不再显示） */
  dismiss: () => void;
}

const DISMISS_KEY = 'chronos.pwa.installDismissed';

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 私有属性
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * PWA 安装提示：监听 beforeinstallprompt，缓存事件供用户主动触发。
 * 不支持的浏览器（如 iOS Safari）返回 canInstall=false，由 UI 显示手动安装指引。
 */
export function usePwaInstall(): PwaInstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isStandalone, setIsStandalone] = useState(checkStandalone);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };
    const onDisplayChange = () => setIsStandalone(checkStandalone());

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onDisplayChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      /* ignore */
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === 'accepted') setIsStandalone(true);
    else dismiss();
    return choice.outcome === 'accepted';
  }, [deferred, dismiss]);

  return {
    canInstall: Boolean(deferred) && !dismissed && !isStandalone,
    isStandalone,
    install,
    dismiss,
  };
}
