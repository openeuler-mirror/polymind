'use client'

import { BookOpen, FolderGit2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkillRepoManagement } from './skill-repo-management'

export function SkillsPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="repo-management" className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="repo-management" className="py-2">
            <FolderGit2 className="h-4 w-4" />
            仓库源管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repo-management">
          <SkillRepoManagement />
        </TabsContent>
      </Tabs>
    </div>
  )
}
