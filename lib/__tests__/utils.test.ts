import { cn } from '../utils';

describe('cn function', () => {
  it('should merge class names correctly', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toBe('text-red-500 bg-blue-500');
  });

  it('should handle conditional class names', () => {
    const result = cn('text-red-500', true && 'bg-blue-500');
    expect(result).toBe('text-red-500 bg-blue-500');
  });

  it('should handle falsey values', () => {
    const result = cn('text-red-500', false && 'bg-blue-500');
    expect(result).toBe('text-red-500');
  });

  it('should handle array of class names', () => {
    const result = cn(['text-red-500', 'bg-blue-500']);
    expect(result).toBe('text-red-500 bg-blue-500');
  });

  it('should merge conflicting class names using tailwind-merge', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });
});
