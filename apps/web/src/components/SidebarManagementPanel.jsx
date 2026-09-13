import React, { useCallback, useEffect, useState } from 'react';
import useRealtimeRefresh from '@/hooks/useRealtimeRefresh';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

const SidebarManagementPanel = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Platform settings are read elsewhere; this panel only performs a bulk
      // reset of users' custom sidebar orders, so there is nothing to load
      // here beyond confirming the panel is ready.
      await pb.collection('platform_settings').getFullList({ sort: 'created' });
    } catch {
      setError(t('something_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Live: sidebar settings + per-user sidebar orders update in real time.
  useRealtimeRefresh(load, ['platform_settings', 'users']);

  const bulkReset = async () => {
    if (!window.confirm(t('sidebar_bulk_reset_confirm'))) return;
    setResetting(true);
    setError('');
    try {
      const users = await pb.collection('users').getFullList({
        fields: 'id,sidebar_order',
        requestKey: `sidebar-mgmt-list-${Date.now()}`,
      });
      await Promise.all(
        users.map((u, i) =>
          pb.collection('users').update(
            u.id,
            { sidebar_order: {} },
            { requestKey: `sidebar-mgmt-reset-${u.id}-${i}` },
          ),
        ),
      );
      flash(t('sidebar_bulk_reset_done'));
    } catch {
      setError(t('something_wrong'));
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return <p className="py-16 text-center text-muted-foreground">{t('loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">
          {t('sidebar_management_title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('sidebar_management_subtitle')}</p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Bulk reset all users' custom sidebar orders */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RotateCcw size={18} strokeWidth={1.8} />
          </span>
          <div>
            <p className="font-bold">{t('sidebar_bulk_reset')}</p>
            <p className="text-xs text-muted-foreground">
              {t('sidebar_management_subtitle')}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={bulkReset}
            disabled={resetting}
            className={cn('min-h-[44px]')}
          >
            <RotateCcw size={15} className="me-1.5" />
            {resetting ? t('loading') : t('sidebar_bulk_reset')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SidebarManagementPanel;
