'use client'

import { useCallback, useEffect, useRef } from 'react'

export function useAutoLoadOnScroll({
  hasMore,
  loading,
  onLoadMore,
  contentVersion,
  threshold = 240,
}: {
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void | Promise<void>
  contentVersion: number
  threshold?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)

  const tryLoadMore = useCallback(() => {
    if (!hasMore || loading || inFlightRef.current) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight

    if (distanceToBottom > threshold) {
      return
    }

    inFlightRef.current = true
    Promise.resolve(onLoadMore()).finally(() => {
      inFlightRef.current = false
    })
  }, [hasMore, loading, onLoadMore, threshold])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      tryLoadMore()
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [contentVersion, tryLoadMore])

  return { containerRef, tryLoadMore }
}
