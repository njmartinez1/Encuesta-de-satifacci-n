import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

type ModalVariant = 'info' | 'warning' | 'success' | 'danger';
type ModalKind = 'alert' | 'confirm';

type ModalState = {
  kind: ModalKind;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant: ModalVariant;
};

type AlertOptions = Partial<Pick<ModalState, 'title' | 'confirmLabel' | 'variant'>>;
type ConfirmOptions = Partial<Pick<ModalState, 'title' | 'confirmLabel' | 'cancelLabel' | 'variant'>>;

type ModalContextValue = {
  showAlert: (message: string, options?: AlertOptions) => void;
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
};

const ModalContext = createContext<ModalContextValue | null>(null);

const VARIANT_STYLES: Record<ModalVariant, { bar: string; button: string }> = {
  info: { bar: 'bg-[#005187]', button: 'bg-[#005187] hover:bg-[#00406b]' },
  warning: { bar: 'bg-amber-500', button: 'bg-amber-600 hover:bg-amber-700' },
  success: { bar: 'bg-emerald-500', button: 'bg-emerald-600 hover:bg-emerald-700' },
  danger: { bar: 'bg-red-500', button: 'bg-red-600 hover:bg-red-700' },
};

export const useModal = () => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModal must be used within ModalProvider.');
  }
  return ctx;
};

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalState | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeModal = useCallback(() => {
    setModal(null);
    resolverRef.current = null;
  }, []);

  const showAlert = useCallback((message: string, options: AlertOptions = {}) => {
    resolverRef.current = null;
    setModal({
      kind: 'alert',
      title: options.title ?? 'Aviso',
      message,
      confirmLabel: options.confirmLabel ?? 'Entendido',
      variant: options.variant ?? 'info',
    });
  }, []);

  const showConfirm = useCallback((message: string, options: ConfirmOptions = {}) => (
    new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setModal({
        kind: 'confirm',
        title: options.title ?? 'Confirmar acción',
        message,
        confirmLabel: options.confirmLabel ?? 'Confirmar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        variant: options.variant ?? 'warning',
      });
    })
  ), []);

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
    }
    closeModal();
  }, [closeModal]);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }
    closeModal();
  }, [closeModal]);

  useEffect(() => {
    if (!modal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (modal.kind === 'confirm') {
          handleCancel();
        } else {
          closeModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, handleCancel, closeModal]);

  const contextValue = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);
  const variantStyle = modal ? VARIANT_STYLES[modal.variant] : null;

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      {modal && variantStyle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            if (modal.kind === 'confirm') {
              handleCancel();
            } else {
              closeModal();
            }
          }}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className={`h-1 ${variantStyle.bar}`} />
            <div className="p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{modal.title}</h3>
                  <p className="mt-3 text-base text-slate-600 whitespace-pre-line">{modal.message}</p>
                </div>
                <button
                  type="button"
                  onClick={modal.kind === 'confirm' ? handleCancel : closeModal}
                  className="text-slate-400 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2">
                {modal.kind === 'confirm' && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    {modal.cancelLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={modal.kind === 'confirm' ? handleConfirm : closeModal}
                  className={`px-4 py-2 rounded-lg font-semibold text-white ${variantStyle.button}`}
                >
                  {modal.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
