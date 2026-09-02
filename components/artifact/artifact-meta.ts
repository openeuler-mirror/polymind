import type { LucideIcon } from 'lucide-react'
import { File, FileCode2, FileText, Film, Globe, Image as ImageIcon } from 'lucide-react'
import type { ArtifactType } from '@/lib/types'

/** 产物类型的图标 / 中文标签 / 徽章配色（预览面板与卡片共用） */
export const ARTIFACT_TYPE_META: Record<
  ArtifactType,
  { icon: LucideIcon; label: string; chip: string }
> = {
  html: { icon: Globe, label: 'HTML 页面', chip: 'bg-orange-500/10 text-orange-500' },
  image: { icon: ImageIcon, label: '图片', chip: 'bg-emerald-500/10 text-emerald-500' },
  video: { icon: Film, label: '视频', chip: 'bg-violet-500/10 text-violet-500' },
  markdown: { icon: FileText, label: '文档', chip: 'bg-slate-500/10 text-slate-500' },
  code: { icon: FileCode2, label: '代码', chip: 'bg-blue-500/10 text-blue-500' },
  pdf: { icon: File, label: 'PDF', chip: 'bg-red-500/10 text-red-500' },
  unknown: { icon: File, label: '文件', chip: 'bg-muted text-muted-foreground' },
}
