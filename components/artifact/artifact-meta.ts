import type { LucideIcon } from 'lucide-react'
import { File, FileCode2, FileText, Film, Globe, Image as ImageIcon } from 'lucide-react'
import i18n from '@/lib/i18n/config'
import type { ArtifactType } from '@/lib/types'

/** 产物类型的图标 / 中文标签 / 徽章配色（预览面板与卡片共用） */
export const ARTIFACT_TYPE_META: Record<
  ArtifactType,
  { icon: LucideIcon; label: string; chip: string }
> = {
  html: {
    icon: Globe,
    label: i18n.t('artifact:type.html'),
    chip: 'bg-orange-500/10 text-orange-500',
  },
  image: {
    icon: ImageIcon,
    label: i18n.t('artifact:type.image'),
    chip: 'bg-emerald-500/10 text-emerald-500',
  },
  video: {
    icon: Film,
    label: i18n.t('artifact:type.video'),
    chip: 'bg-violet-500/10 text-violet-500',
  },
  markdown: {
    icon: FileText,
    label: i18n.t('artifact:type.markdown'),
    chip: 'bg-slate-500/10 text-slate-500',
  },
  code: {
    icon: FileCode2,
    label: i18n.t('artifact:type.code'),
    chip: 'bg-blue-500/10 text-blue-500',
  },
  pdf: { icon: File, label: i18n.t('artifact:type.pdf'), chip: 'bg-red-500/10 text-red-500' },
  unknown: {
    icon: File,
    label: i18n.t('artifact:type.unknown'),
    chip: 'bg-muted text-muted-foreground',
  },
}
