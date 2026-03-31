'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface TimeAgoProps {
  date: string | Date
}

export function TimeAgo({ date }: TimeAgoProps) {
  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    const calculateTimeAgo = () => {
      setTimeAgo(
        formatDistanceToNow(new Date(date), {
          addSuffix: true,
          locale: zhCN,
        })
      )
    }

    // 初始计算
    calculateTimeAgo()

    // 每分钟更新一次
    const intervalId = setInterval(calculateTimeAgo, 60000)

    return () => clearInterval(intervalId)
  }, [date])

  return <>{timeAgo}</>
}
