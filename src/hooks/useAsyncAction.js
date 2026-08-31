import { useCallback, useState } from 'react';

export function useAsyncAction() {
  const [asyncAction, setAsyncAction] = useState(null);

  const closeAsyncAction = useCallback(() => {
    setAsyncAction(null);
  }, []);

  const showAsyncError = useCallback(({ title, message, errorTitle = 'İşlem başarısız' }) => {
    setAsyncAction({
      phase: 'error',
      title,
      errorTitle,
      error: message instanceof Error ? message : new Error(message),
    });
  }, []);

  const runAsyncAction = useCallback(
    ({
      title,
      message,
      confirmLabel = 'Onayla',
      loadingLabel = 'İşleniyor…',
      successTitle = 'Başarılı',
      skipConfirm = false,
      runFn,
      successMessage,
      getCredentials,
      onSuccess,
    }) => {
      const execute = async () => {
        setAsyncAction((current) => ({
          ...current,
          phase: 'loading',
          loadingLabel,
        }));

        try {
          const result = await runFn();
          await onSuccess?.(result);

          const resolvedMessage =
            typeof successMessage === 'function'
              ? successMessage(result)
              : successMessage ?? 'İşlem tamamlandı.';

          setAsyncAction({
            phase: 'success',
            successTitle,
            message: resolvedMessage,
            credentials: getCredentials?.(result) ?? null,
          });
          return result;
        } catch (error) {
          setAsyncAction((current) => ({
            ...current,
            phase: 'error',
            error,
          }));
          return null;
        }
      };

      if (skipConfirm) {
        setAsyncAction({
          phase: 'loading',
          title,
          loadingLabel,
        });
        void execute();
        return Promise.resolve(null);
      }

      setAsyncAction({
        phase: 'confirm',
        title,
        message,
        confirmLabel,
        loadingLabel,
        onConfirm: () => {
          void execute();
        },
      });

      return Promise.resolve(null);
    },
    []
  );

  return { asyncAction, closeAsyncAction, runAsyncAction, showAsyncError };
}
