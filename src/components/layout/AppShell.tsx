import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SearchPalette } from '../SearchPalette';
import { useStore } from '../../store/AppStore';
import { downloadBackup, importBackup } from '../../store/backup';
import { storage } from '../../lib/safeStorage';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [storagePercent, setStoragePercent] = useState(0);
  const { pathname } = useLocation();
  const { toast, storageError, dismissStorageError } = useStore();

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Close the drawer on route change.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Storage meter, so a quota problem is visible before it bites.
  useEffect(() => {
    const measure = () =>
      setStoragePercent((storage.bytesUsed('studydesk') / (5 * 1024 * 1024)) * 100);
    measure();
    window.addEventListener('storage', measure);
    const id = window.setInterval(measure, 5000);
    return () => {
      window.removeEventListener('storage', measure);
      window.clearInterval(id);
    };
  }, []);

  const onExport = useCallback(() => {
    try {
      downloadBackup();
      toast({ message: 'Backup downloaded', tone: 'success' });
    } catch (err) {
      console.error(err);
      toast({ message: 'Export failed — see console', tone: 'danger' });
    }
  }, [toast]);

  const onImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.className = 'sr-only';
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void importBackup(file).then((res) => {
        if (res.ok) {
          toast({ message: `Imported ${res.keys} collection(s) — reloading`, tone: 'success' });
          window.setTimeout(() => window.location.reload(), 900);
        } else {
          toast({ message: res.error, tone: 'danger', duration: 6000 });
        }
      });
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
  }, [toast]);

  return (
    <div className="bg-bg text-fg min-h-screen">
      <Sidebar
        open={navOpen}
        onClose={closeNav}
        onExport={onExport}
        onImport={onImport}
        storagePercent={storagePercent}
      />

      <div className="lg:pl-60">
        <Topbar
          pathname={pathname}
          onOpenNav={() => setNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        {storageError && (
          <div
            role="alert"
            className="border-danger/40 bg-danger-soft text-danger border-b px-4 py-2.5 text-sm sm:px-7"
          >
            <div className="flex items-start gap-2">
              <span className="flex-1">{storageError}</span>
              <button
                type="button"
                onClick={dismissStorageError}
                className="rounded px-1.5 text-xs font-bold hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-7 lg:py-8">
          <Outlet />
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
