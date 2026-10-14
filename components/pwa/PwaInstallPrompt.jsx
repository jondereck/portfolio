'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

const DISMISS_DAY_KEY = 'portfolio:pwa-install-dismissed-day';
const INSTALLED_KEY = 'portfolio:pwa-installed';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const isMobileViewport = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(max-width: 767px)').matches;
};

const isStandaloneDisplay = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

const hasInstalledFlag = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(INSTALLED_KEY) === 'true';
};

const markInstalled = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INSTALLED_KEY, 'true');
};

const wasDismissedToday = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(DISMISS_DAY_KEY) === getTodayKey();
};

const dismissForToday = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DISMISS_DAY_KEY, getTodayKey());
};

const isIosSafari = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = window.navigator.userAgent;
  const isiPhoneOrIpad = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  return isiPhoneOrIpad && isSafari;
};

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const installed = isStandaloneDisplay() || hasInstalledFlag();
    if (installed) {
      markInstalled();
    }

    setIsDismissed(wasDismissedToday());
    setIsInstalled(installed);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (!isMobileViewport() || isStandaloneDisplay() || hasInstalledFlag()) {
        return;
      }

      setInstallEvent(event);
      setIsInstalled(false);
      setIsDismissed(wasDismissedToday());
    };

    const handleInstalled = () => {
      markInstalled();
      setInstallEvent(null);
      setIsInstalled(true);
      setIsDismissed(true);
    };

    const handleFocus = () => {
      const installedNow = isStandaloneDisplay() || hasInstalledFlag();
      if (installedNow) {
        markInstalled();
      }
      setIsInstalled(installedNow);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const promptType = useMemo(() => {
    if (isInstalled) {
      return null;
    }

    if (installEvent) {
      return 'native';
    }

    if (isIosSafari() && isMobileViewport()) {
      return 'ios';
    }

    if (isMobileViewport()) {
      return 'fallback';
    }

    return null;
  }, [installEvent, isInstalled]);

  if (!promptType || isDismissed) {
    return null;
  }

  const dismiss = () => {
    dismissForToday();
    setIsDismissed(true);
  };

  const handleInstall = async () => {
    if (!installEvent) {
      return;
    }

    try {
      await installEvent.prompt();
      const result = await installEvent.userChoice;

      if (result?.outcome === 'accepted') {
        markInstalled();
        setIsInstalled(true);
        setIsDismissed(true);
      } else {
        dismissForToday();
        setIsDismissed(true);
      }
    } finally {
      setInstallEvent(null);
    }
  };

  const handleInstallGuide = () => {
    dismissForToday();
    setIsDismissed(true);
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 md:hidden">
      <div className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-950/95 text-slate-50 shadow-2xl shadow-cyan-950/30 backdrop-blur">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 rounded-2xl bg-cyan-400/10 p-2 text-cyan-300">
            {promptType === 'native' ? <Download className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-[0.2em] text-cyan-300">QUICK ACCESS</p>
            {promptType === 'native' ? (
              <>
                <h2 className="mt-1 text-lg font-semibold text-white">Install this portfolio on your phone</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Add it to your home screen so it opens like an app and stays one tap away.
                </p>
              </>
            ) : promptType === 'ios' ? (
              <>
                <h2 className="mt-1 text-lg font-semibold text-white">Add this site to your home screen</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  On iPhone, tap <span className="font-medium text-white">Share</span> then choose{' '}
                  <span className="font-medium text-white">Add to Home Screen</span>.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-lg font-semibold text-white">Add this site to your home screen</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Open your browser menu and choose <span className="font-medium text-white">Install app</span> or{' '}
                  <span className="font-medium text-white">Add to Home Screen</span>.
                </p>
              </>
            )}
            <div className="mt-4 flex items-center gap-2">
              {promptType === 'native' ? (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="inline-flex h-10 items-center rounded-full bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Install app
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleInstallGuide}
                  className="inline-flex h-10 items-center rounded-full bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Got it
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex h-10 items-center rounded-full border border-slate-700 px-4 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-900 hover:text-white"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
