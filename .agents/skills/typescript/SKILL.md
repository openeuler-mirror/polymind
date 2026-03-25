---
name: typescript
description: Manages TypeScript configurations, type definitions, interfaces, generics, and advanced type features. Provides best practices for type safety in modern JavaScript applications.
user-invocable: false
allowed-tools: Bash(pnpm add typescript @types/*), Bash(npx tsc *)
---

# TypeScript Type Safety

A strongly typed programming language that builds on JavaScript by adding static type definitions.

## Current Project Context

```json
{
  "version": "5.7.3",
  "compiler": "tsc",
  "configFile": "tsconfig.json",
  "target": "ES6",
  "module": "esnext",
  "jsx": "react-jsx",
  "packageManager": "pnpm",
  "features": ["strict", "esm", "decorators", "paths"]
}
```

## Principles

1. **Use strict mode.** Enable strict type checking for maximum safety.
2. **Type first approach.** Define types before implementing logic.
3. **Leverage inference.** Let TypeScript infer types when possible.
4. **Create reusable types.** Build a library of shared interfaces and types.

## Critical Rules

These rules are **always enforced**:

### Type Definitions
- **Use interfaces for objects.** Define object shapes with `interface`.
- **Use types for primitives and unions.** Use `type` for primitive aliases and union types.
- **Be explicit with function return types.** Especially for public APIs and callbacks.
- **Use readonly for immutable data.** Mark arrays and objects as readonly when appropriate.

### Strict Mode
- **Enable strictNullChecks.** Handle null and undefined explicitly.
- **Use strictFunctionTypes.** Ensure function parameters are checked correctly.
- **Enable noImplicitAny.** Avoid implicit any types.
- **Enable strictPropertyInitialization.** Ensure class properties are initialized.

### Generics
- **Use generics for reusable components.** Make functions and components work with multiple types.
- **Constrain generics appropriately.** Use extends to limit acceptable types.
- **Avoid unnecessary generic parameters.** Only add generics when needed for reusability.

### Utility Types
- **Use Pick and Omit.** Extract or exclude specific properties from types.
- **Use Partial and Required.** Convert between optional and required properties.
- **Use Record for keyed objects.** Define objects with known key types.
- **Use ReturnType and Parameters.** Extract types from function signatures.

### Asynchronous Code
- **Type Promise results.** Specify the resolved type of Promises.
- **Handle errors properly.** Use proper typing for error handling.
- **Use async/await consistently.** Prefer async/await over raw Promises when possible.

## Key Patterns

```ts
// Interface for object shapes
interface User {
  id: string
  name: string
  email: string
  createdAt: Date
  isActive: boolean
}

// Type for union of literals
type UserRole = 'admin' | 'moderator' | 'user'

// Generic function
function identity<T>(arg: T): T {
  return arg
}

// Generic interface
interface Container<T> {
  value: T
  items: T[]
  add: (item: T) => void
}

// Utility types
type UserPreview = Pick<User, 'id' | 'name'>
type OptionalUser = Partial<User>
type UserWithRole = User & { role: UserRole }

// Generic constraints
interface Lengthwise {
  length: number
}

function logLength<T extends Lengthwise>(arg: T): T {
  console.log(arg.length)
  return arg
}

// Conditional types
type TypeName<T> = T extends string 
  ? 'string' 
  : T extends number 
    ? 'number' 
    : T extends boolean 
      ? 'boolean' 
      : 'object'

// Mapped types
type Optional<T> = {
  [P in keyof T]?: T[P]
}

// Discriminated unions
interface Bird {
  kind: 'bird'
  flyingSpeed: number
}

interface Horse {
  kind: 'horse'
  runningSpeed: number
}

type Animal = Bird | Horse

function moveAnimal(animal: Animal) {
  switch (animal.kind) {
    case 'bird':
      console.log(`Flying at ${animal.flyingSpeed}`)
      break
    case 'horse':
      console.log(`Running at ${animal.runningSpeed}`)
      break
  }
}
```

## React-Specific Patterns

```tsx
// Component Props Interface
interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  disabled?: boolean
}

// Functional Component with Generics
function List<T>({ 
  items, 
  renderItem 
}: { 
  items: T[]
  renderItem: (item: T) => React.ReactNode
}) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{renderItem(item)}</li>
      ))}
    </ul>
  )
}

// Type-safe event handlers
function EventHandler() {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    console.log('Button clicked')
  }

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log(event.target.value)
  }

  return (
    <div>
      <button onClick={handleClick}>Click me</button>
      <input onChange={handleChange} />
    </div>
  )
}

// Context with TypeScript
interface AppContextType {
  user: User | null
  setUser: (user: User | null) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

// Custom Hook with TypeScript
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      return initialValue
    }
  })

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error(error)
    }
  }

  return [storedValue, setValue] as const
}
```

## Advanced Patterns

```ts
// Deep partial utility
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object 
    ? DeepPartial<T[P]> 
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P]
}

// Non-nullable utility
type NonNullable<T> = T extends null | undefined ? never : T

// Awaited utility (TypeScript 4.5+)
type ResolvedValue<T> = T extends Promise<infer U> ? U : T

// Constructor type
type Constructor<T> = new (...args: any[]) => T

// Function overloads
function formatDate(date: Date): string
function formatDate(timestamp: number): string
function formatDate(dateOrTimestamp: Date | number): string {
  const date = typeof dateOrTimestamp === 'number' 
    ? new Date(dateOrTimestamp) 
    : dateOrTimestamp
    
  return date.toISOString().split('T')[0]
}

// Assertion functions
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

// Type guards
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}
```

## Configuration

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES6",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Best Practices

### Type Safety
- **Start with strict mode.** Enable all strict checks from the beginning.
- **Use narrow types.** Prefer specific types over broad ones.
- **Validate external data.** Use runtime validation libraries like Zod or Yup.

### Performance
- **Avoid complex conditional types.** Complex types can slow compilation.
- **Use declaration maps.** Enable declarationMap for better debugging experience.
- **Incremental compilation.** Use composite and incremental options for large projects.

### Maintainability
- **Document complex types.** Add JSDoc comments to complex type definitions.
- **Group related types.** Organize types in logical modules.
- **Use barrel exports.** Export types from index files for easy importing.