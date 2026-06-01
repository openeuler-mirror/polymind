'use client'

import { BookOpen, CheckCircle2, FolderGit2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InstalledSkills } from './installed-skills'
import { SkillMarketplace } from './skill-marketplace'
import { SkillRepoManagement } from './skill-repo-management'
export function SkillsPage() {
  return (
    <div className="min-h-0 space-y-6">
      <Tabs defaultValue="marketplace" className="min-h-0 gap-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="marketplace" className="py-2">
            <BookOpen className="h-4 w-4" />
            技能广场
          </TabsTrigger>
          <TabsTrigger value="repo-management" className="py-2">
            <FolderGit2 className="h-4 w-4" />
            仓库源管理
          </TabsTrigger>
          <TabsTrigger value="installed" className="py-2">
            <CheckCircle2 className="h-4 w-4" />
            已安装
          </TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace">
          <SkillMarketplace />
        </TabsContent>

        <TabsContent value="repo-management">
          <SkillRepoManagement />
        </TabsContent>

        <TabsContent value="installed">
          <InstalledSkills />
        </TabsContent>
      </Tabs>
    </div>
  )
}
