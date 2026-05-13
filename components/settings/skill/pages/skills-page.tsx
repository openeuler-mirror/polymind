'use client'

import { BookOpen, FolderGit2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkillMarketplace } from './skill-marketplace'

export function SkillsPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="marketplace" className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="marketplace" className="py-2">
            <BookOpen className="h-4 w-4" />
            技能广场
          </TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace">
          <SkillMarketplace />
        </TabsContent>

      </Tabs>
    </div>
  )
}
