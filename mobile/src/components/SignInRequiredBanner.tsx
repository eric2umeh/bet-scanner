import { AccessDeniedPanel } from './AccessDeniedPanel';

type Props = {
  message?: string;
  title?: string;
};

export function SignInRequiredBanner({ message, title }: Props) {
  return (
    <AccessDeniedPanel
      title={title ?? 'Sign in required'}
      message={
        message || 'Sign in on Me to log and view your tips on this server.'
      }
      actionLabel="Go to Me → Account"
    />
  );
}
