import { router } from 'expo-router';

import { AppButton } from '@/components/common/AppButton';
import { AppScreen } from '@/components/common/AppScreen';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <AppScreen scroll={false}>
      <LoadingState label={label} />
    </AppScreen>
  );
}

/** Pantalla para cuando el registro no se pudo cargar (error) o ya no existe. */
export function UnavailableScreen({
  title,
  error,
  message,
  onRetry,
  retrying = false,
}: {
  title: string;
  error: string | null;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <AppScreen>
      <ScreenHeader back title={title} />
      {error ? (
        <ErrorState message={error} onRetry={onRetry} retrying={retrying} />
      ) : (
        <EmptyState action={<AppButton onPress={() => router.back()}>Volver</AppButton>} message={message} title="No disponible" />
      )}
    </AppScreen>
  );
}
