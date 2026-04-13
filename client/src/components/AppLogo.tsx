import { cn } from '@/lib/utils';

interface AppLogoProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
}

export function AppLogo({
  className,
  imageClassName,
  alt = 'Mabini Classroom logo',
}: AppLogoProps) {
  return (
    <div className={cn('shrink-0', className)}>
      <img
        src="/mabini-logo.svg"
        alt={alt}
        className={cn('h-full w-full object-contain', imageClassName)}
        loading="eager"
      />
    </div>
  );
}