---
name: nextjs
description: Manages Next.js applications - routing, API routes, SSR/SSG optimization, middleware, image optimization, and deployment configurations. Provides project context, component docs, and best practices for Next.js development.
user-invocable: false
allowed-tools: Bash(pnpm exec next *), Bash(npx next *), Bash(pnpm dlx next *)
---

# Next.js Framework

A React-based framework for production-ready web applications with built-in features like routing, API routes, SSR/SSG, and image optimization.

## Current Project Context

```json
{
  "version": "16.2.0",
  "framework": "next",
  "router": "app",
  "typescript": true,
  "packageManager": "pnpm",
  "supportedFeatures": ["ssr", "ssg", "isr", "api-routes", "middleware", "image-optimization"]
}
```

## Principles

1. **Use App Router conventions.** Place pages in `app/` directory with appropriate route files.
2. **Leverage React Server Components.** Use server components by default, client components only when necessary.
3. **Optimize with SSR/SSG/ISR.** Choose the right rendering strategy based on data requirements.
4. **Follow file naming conventions.** Use `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, etc.

## Critical Rules

These rules are **always enforced**:

### Routing & File Structure
- **Pages go in `app/` directory.** Never use `pages/` directory in App Router.
- **Use `page.tsx` for routes.** Each route segment needs a `page.tsx`.
- **Layouts use `layout.tsx`.** Root layout in `app/layout.tsx`, nested layouts in route segments.
- **Loading and error UI use dedicated files.** `loading.tsx`, `error.tsx`, `not-found.tsx`.

### Server vs Client Components
- **Server components by default.** Only add `'use client'` when necessary.
- **Client components for interactivity.** Event handlers, refs, useState, useEffect require client components.
- **Props between server/client must be serializable.** Functions and complex objects can't cross boundary.

### Data Fetching
- **Server components for data fetching.** Use async/await in server components for API calls.
- **Client components for user interactions.** Use SWR, React Query, or fetch for client-side updates.
- **Use Suspense for loading states.** Wrap async components with Suspense boundaries.

### Image Optimization
- **Always use `next/image`.** Never use plain `<img>` tags for static assets.
- **Provide `width` and `height`.** Required for layout stability.
- **Use `priority` for above-the-fold images.** Improves LCP metric.

### Meta Tags & SEO
- **Use `next/head` or metadata API.** Define title, description, and social tags.
- **Metadata in layout or page.** Use generateMetadata function for dynamic meta.

## Key Patterns

```tsx
// Server component (default)
// app/products/[id]/page.tsx
import { getProduct } from '@/lib/products'

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id)
  
  return (
    <article>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
    </article>
  )
}

// Client component (when needed)
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}

// Dynamic metadata
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await getProduct(params.id)
  
  return {
    title: product.name,
    description: product.description,
  }
}

// API Route
// app/api/users/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const users = await getUsers()
  return Response.json({ users })
}
```

## Deployment & Configuration

- **Environment variables.** Use `.env.local` for sensitive data, `.env` for defaults.
- **Custom configuration.** Modify `next.config.mjs` for redirects, rewrites, headers.
- **Static optimization.** Next.js automatically optimizes static pages when possible.

## Performance Optimization

- **Code splitting.** Next.js handles automatic code splitting by route.
- **Image optimization.** Use `next/image` with proper sizes attribute.
- **Font optimization.** Use `next/font` for local font handling.
- **Bundle analysis.** Use `@next/bundle-analyzer` to identify large bundles.

## Common Commands

```bash
# Development
pnpm exec next dev

# Build
pnpm exec next build

# Start production server
pnpm exec next start

# Lint
pnpm exec next lint