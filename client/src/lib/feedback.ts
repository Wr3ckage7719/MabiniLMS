type ToastInvoker = (payload: {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  className?: string;
}) => void;

const WARNING_TOAST_CLASS = 'border-warning/40 bg-warning/10 text-warning-foreground';

export const getFeedbackErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      response?: { data?: { error?: { message?: string }; message?: string } };
      message?: string;
    };

    const responseMessage = maybeError.response?.data?.error?.message || maybeError.response?.data?.message;
    if (responseMessage) {
      return responseMessage;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return fallback;
};

export const notifySuccess = (
  toast: ToastInvoker,
  description: string,
  title = 'Success'
): void => {
  toast({
    title,
    description,
  });
};

export const notifyError = (
  toast: ToastInvoker,
  description: string,
  title = 'Action failed'
): void => {
  toast({
    title,
    description,
    variant: 'destructive',
  });
};

export const notifyWarning = (
  toast: ToastInvoker,
  description: string,
  title = 'Warning'
): void => {
  toast({
    title,
    description,
    className: WARNING_TOAST_CLASS,
  });
};
