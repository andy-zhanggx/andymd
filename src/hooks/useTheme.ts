import { useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';

export function useTheme() {
  const theme = useConfigStore((s) => s.config.theme);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective =
        theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = effective;
    };
    apply();
    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [theme]);
}
