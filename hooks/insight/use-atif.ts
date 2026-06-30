'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AtifDocument, InsightAtifTarget } from './types'
import { insightService } from '@/services/insight/service'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Witty Insight ATIF 数据加载失败'
}

export function useInsightAtif(target: InsightAtifTarget | null) {
  const requestIdRef = useRef(0)
  const [doc, setDoc] = useState<AtifDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDocument = useCallback(async (nextTarget: InsightAtifTarget | null) => {
    if (!nextTarget) {
      setDoc(null)
      setLoading(false)
      setError(null)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setDoc(null)

    try {
      const loadedDoc =
        nextTarget.source === 'session'
          ? await insightService.getAtifBySession(nextTarget.id)
          : await insightService.getAtifByConversation(nextTarget.id)

      if (requestIdRef.current !== requestId) {
        return
      }

      setDoc(loadedDoc)
    } catch (loadError) {
      if (requestIdRef.current !== requestId) {
        return
      }

      setError(getErrorMessage(loadError))
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDocument(target)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [loadDocument, target])

  const refresh = useCallback(() => {
    void loadDocument(target)
  }, [loadDocument, target])

  const downloadJson = useCallback(() => {
    if (!doc) {
      return
    }

    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const source = target?.source ?? 'trajectory'

    anchor.href = url
    anchor.download = `atif-${source}-${doc.session_id.slice(0, 16)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [doc, target])

  return {
    doc,
    loading,
    error,
    refresh,
    downloadJson,
  }
}
