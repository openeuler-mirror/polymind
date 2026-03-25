---
name: tailwind
description: Manages Tailwind CSS configurations, utility classes, responsive design, and custom component styling. Provides best practices for efficient styling with Tailwind CSS.
user-invocable: false
allowed-tools: Bash(pnpm add tailwindcss postcss autoprefixer), Bash(npx tailwindcss *)
---

# Tailwind CSS Styling

A utility-first CSS framework packed with classes that can be composed to build any design directly in your markup.

## Current Project Context

```json
{
  "version": "4.2.0",
  "framework": "next",
  "configFile": "tailwind.config.js",
  "cssFile": "app/globals.css",
  "prefix": "",
  "darkMode": "class",
  "plugins": ["@tailwindcss/typography", "tw-animate-css"],
  "packageManager": "pnpm"
}
```

## Principles

1. **Use utility-first approach.** Combine low-level utilities to build custom designs.
2. **Leverage responsive prefixes.** Use `sm:`, `md:`, `lg:`, `xl:`, `2xl:` for responsive design.
3. **Apply semantic color names.** Use `bg-primary`, `text-muted-foreground` instead of raw colors.
4. **Prefer composition over custom CSS.** Build components from existing utilities.

## Critical Rules

These rules are **always enforced**:

### Naming & Organization
- **Use consistent class ordering.** Follow the recommended order: layout, typography, spacing, colors, effects.
- **Group related classes.** Use formatting to group related utilities together.
- **No arbitrary values.** Avoid `[value]` syntax when standard utilities exist.

### Responsive Design
- **Mobile-first approach.** Write base styles first, then add breakpoints.
- **Use appropriate breakpoints.** Default Tailwind breakpoints: sm:640px, md:768px, lg:1024px, xl:1280px, 2xl:1536px.
- **Responsive utilities everywhere.** Apply responsive prefixes to any utility.

### Color System
- **Use semantic color names.** `bg-primary`, `text-destructive`, `border-border` instead of `bg-blue-500`.
- **Respect dark mode.** Use `dark:` prefix for dark theme variants.
- **Maintain contrast ratios.** Ensure accessibility compliance.

### Spacing & Layout
- **Use consistent spacing scale.** Stick to the 4px grid system (0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64).
- **Prefer padding over margin.** Use padding for internal spacing, margin for external spacing.
- **Use flexbox and grid.** Leverage modern layout techniques.

### Performance
- **Enable tree-shaking.** Configure purge/transform for production builds.
- **Use JIT mode.** Enable Just-In-Time compiler for faster builds.
- **Avoid duplicate utilities.** Consolidate repeated class combinations.

## Key Patterns

```tsx
// Responsive layout with proper class organization
<div className="
  flex
  flex-col
  md:flex-row
  gap-4
  p-4
  bg-background
  rounded-lg
  border
  border-border
">
  <div className="flex-1">
    <h2 className="text-xl font-semibold text-foreground mb-2">Title</h2>
    <p className="text-muted-foreground">Content goes here</p>
  </div>
  <div className="md:w-64">
    <button className="
      w-full
      py-2
      px-4
      bg-primary
      hover:bg-primary/90
      text-primary-foreground
      rounded-md
      transition-colors
      focus:outline-none
      focus:ring-2
      focus:ring-primary
      focus:ring-offset-2
      dark:focus:ring-offset-background
    ">
      Action
    </button>
  </div>
</div>

// Dark mode support
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <h1 className="text-2xl font-bold">Heading</h1>
  <p className="text-gray-600 dark:text-gray-400">Paragraph text</p>
</div>

// Conditional classes with clsx or classnames
import { cn } from '@/lib/utils'

function Button({ variant = 'default', size = 'md', className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        // Variants
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
          'border border-input hover:bg-accent hover:text-accent-foreground': variant === 'outline',
        },
        // Sizes
        {
          'h-10 py-2 px-4': size === 'default',
          'h-9 px-3': size === 'sm',
          'h-12 px-6': size === 'lg',
        },
        className
      )}
      {...props}
    />
  )
}

// Responsive design
<div className="
  grid
  grid-cols-1
  sm:grid-cols-2
  md:grid-cols-3
  lg:grid-cols-4
  gap-4
">
  {[1, 2, 3, 4].map((item) => (
    <div key={item} className="bg-card p-4 rounded-lg shadow-sm">
      <h3 className="font-medium text-card-foreground">Item {item}</h3>
    </div>
  ))}
</div>
```

## Configuration

### Tailwind Config
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('tw-animate-css')],
}
```

### Global CSS Setup
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    /* ... other CSS variables */
  }
  
  .dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    /* ... other dark mode CSS variables */
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Common Utilities

### Layout
- `container` - Centered max-width container
- `flex`, `grid` - Layout models
- `flex-col`, `grid-cols-*` - Direction and columns
- `gap-*` - Spacing between children
- `p-*`, `m-*` - Padding and margins
- `w-*`, `h-*` - Width and height

### Typography
- `font-*` - Font weights
- `text-*` - Font sizes
- `leading-*` - Line heights
- `tracking-*` - Letter spacing
- `text-*` - Text colors

### Colors
- `bg-*` - Background colors
- `text-*` - Text colors
- `border-*` - Border colors
- `divide-*` - Child divider colors

### Effects
- `rounded-*` - Border radius
- `shadow-*` - Box shadows
- `ring-*` - Focus rings
- `blur-*` - Blur filters
- `backdrop-blur-*` - Backdrop blur

## Performance Tips

- **Configure content paths properly.** Ensure all relevant files are included in the content array.
- **Use JIT mode.** Enable in tailwind.config.js for faster builds.
- **Minimize custom CSS.** Rely on utilities instead of custom styles.
- **Use class merging.** Combine classes with utilities like `cn()` from `clsx`.