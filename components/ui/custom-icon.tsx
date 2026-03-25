import Image from 'next/image';

interface CustomIconProps {
  src?: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function CustomIcon({ 
  src = '/icon.svg', 
  size = 24, 
  className = '',
  alt = 'Icon'
}: CustomIconProps) {
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt={alt}
      className={className}
    />
  );
}