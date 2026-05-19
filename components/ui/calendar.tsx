'use client'

import * as React from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { Button, DayPicker } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button as UIButton, buttonVariants } from '@/components/ui/button'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'buttons',
  buttonVariant = 'ghost',
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof UIButton>['variant']
}) {
  const defaultClassNames = {
    root: 'w-fit bg-background p-3',
    months: 'flex flex-col gap-4 md:flex-row',
    month: 'flex flex-col w-full gap-4',
    nav: 'flex items-center justify-between mb-2',
    nav_button_previous: buttonVariants({ variant: buttonVariant }),
    nav_button_next: buttonVariants({ variant: buttonVariant }),
    caption: 'flex items-center justify-center h-8',
    caption_label: 'font-medium text-sm',
    table: 'w-full border-collapse',
    weekdays: 'flex',
    weekday: 'flex-1 text-center text-xs text-muted-foreground',
    week: 'flex w-full mt-2',
    day: 'relative w-full h-full p-0 text-center aspect-square',
    day_button: cn(
      buttonVariants({ variant: buttonVariant }),
      'w-full h-full aspect-square'
    ),
    day_today: 'bg-accent text-accent-foreground',
    day_selected: 'bg-primary text-primary-foreground',
    day_outside: 'text-muted-foreground',
    day_disabled: 'text-muted-foreground opacity-50',
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'bg-background group/calendar p-3',
        className,
      )}
      captionLayout={captionLayout}
      classNames={{
        ...defaultClassNames,
        ...classNames,
      }}
      components={{
        IconLeft: ({ className }) => (
          <ChevronLeftIcon className={cn('size-4', className)} />
        ),
        IconRight: ({ className }) => (
          <ChevronRightIcon className={cn('size-4', className)} />
        ),
        IconDropdown: ({ className }) => (
          <ChevronDownIcon className={cn('size-4', className)} />
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'data-selected:bg-primary data-selected:text-primary-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }