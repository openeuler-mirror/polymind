import fs from 'fs/promises'
import path from 'path'
import { Dirent } from 'fs'

import { LANGUAGES, isLanguage } from '../../../../shared/language'

/**
 * Safely read a file and return its trimmed content
 */
async function safeReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.trim()
  } catch (err) {
    const errorCode = (err as NodeJS.ErrnoException).code
    if (!errorCode || !['ENOENT', 'EISDIR'].includes(errorCode)) {
      throw err
    }
    return ''
  }
}

const MAX_DEPTH = 5

/**
 * Recursively resolve directory entries and collect file paths
 */
async function resolveDirectoryEntry(
  entry: Dirent,
  dirPath: string,
  fileInfo: Array<{ originalPath: string; resolvedPath: string }>,
  depth: number
): Promise<void> {
  // Avoid cyclic symlinks
  if (depth > MAX_DEPTH) {
    return
  }

  const fullPath = path.resolve(entry.parentPath || dirPath, entry.name)
  if (entry.isFile()) {
    // Regular file - both original and resolved paths are the same
    fileInfo.push({ originalPath: fullPath, resolvedPath: fullPath })
  } else if (entry.isSymbolicLink()) {
    // Await the resolution of the symbolic link
    await resolveSymLink(fullPath, fileInfo, depth + 1)
  }
}

/**
 * Recursively resolve a symbolic link and collect file paths
 */
async function resolveSymLink(
  symlinkPath: string,
  fileInfo: Array<{ originalPath: string; resolvedPath: string }>,
  depth: number
): Promise<void> {
  // Avoid cyclic symlinks
  if (depth > MAX_DEPTH) {
    return
  }
  try {
    // Get the symlink target
    const linkTarget = await fs.readlink(symlinkPath)
    // Resolve the target path (relative to the symlink location)
    const resolvedTarget = path.resolve(path.dirname(symlinkPath), linkTarget)

    // Check if the target is a file
    const stats = await fs.stat(resolvedTarget)
    if (stats.isFile()) {
      // For symlinks to files, store the symlink path as original and target as resolved
      fileInfo.push({ originalPath: symlinkPath, resolvedPath: resolvedTarget })
    } else if (stats.isDirectory()) {
      const anotherEntries = await fs.readdir(resolvedTarget, {
        withFileTypes: true,
        recursive: true
      })
      // Collect promises for recursive calls within the directory
      const directoryPromises: Promise<void>[] = []
      for (const anotherEntry of anotherEntries) {
        directoryPromises.push(
          resolveDirectoryEntry(anotherEntry, resolvedTarget, fileInfo, depth + 1)
        )
      }
      // Wait for all entries in the resolved directory to be processed
      await Promise.all(directoryPromises)
    } else if (stats.isSymbolicLink()) {
      // Handle nested symlinks by awaiting the recursive call
      await resolveSymLink(resolvedTarget, fileInfo, depth + 1)
    }
  } catch (err) {
    // Skip invalid symlinks
  }
}

/**
 * Load rule files from global and project-local directories
 * Global rules are loaded first, then project-local rules which can override global ones
 */
export async function loadRuleFiles(cwd: string): Promise<string> {
  const rules: string[] = []

  // If we found rules in .roo/rules/ directories, return them
  if (rules.length > 0) {
    return '\n' + rules.join('\n\n')
  }

  // Fall back to existing behavior for legacy .roorules/.clinerules files
  const ruleFiles = ['.roorules', '.clinerules']

  for (const file of ruleFiles) {
    const content = await safeReadFile(path.join(cwd, file))
    if (content) {
      return `\n# Rules from ${file}:\n${content}\n`
    }
  }

  return ''
}

export async function addCustomInstructions(
  modeCustomInstructions: string,
  globalCustomInstructions: string,
  cwd: string,
  mode: string,
  options: {
    language?: string
    IgnoreInstructions?: string
  } = {}
): Promise<string> {
  const sections: string[] = []

  // Load mode-specific rules if mode is provided
  let modeRuleContent = ''
  let usedRuleFile = ''

  if (mode) {
    const modeRules: string[] = []

    // If we found mode-specific rules in .roo/rules-${mode}/ directories, use them
    if (modeRules.length > 0) {
      modeRuleContent = '\n' + modeRules.join('\n\n')
      usedRuleFile = `rules-${mode} directories`
    } else {
      // Fall back to existing behavior for legacy files
      const rooModeRuleFile = `.roorules-${mode}`
      modeRuleContent = await safeReadFile(path.join(cwd, rooModeRuleFile))
      if (modeRuleContent) {
        usedRuleFile = rooModeRuleFile
      } else {
        const clineModeRuleFile = `.clinerules-${mode}`
        modeRuleContent = await safeReadFile(path.join(cwd, clineModeRuleFile))
        if (modeRuleContent) {
          usedRuleFile = clineModeRuleFile
        }
      }
    }
  }

  // Add language preference if provided
  if (options.language) {
    const languageName = isLanguage(options.language)
      ? LANGUAGES[options.language]
      : options.language
    sections.push(
      `Language Preference:\nYou should always speak and think in the "${languageName}" (${options.language}) language unless the user gives you instructions below to do otherwise.`
    )
  }

  // Add global instructions first
  if (typeof globalCustomInstructions === 'string' && globalCustomInstructions.trim()) {
    sections.push(`Global Instructions:\n${globalCustomInstructions.trim()}`)
  }

  // Add mode-specific instructions after
  if (typeof modeCustomInstructions === 'string' && modeCustomInstructions.trim()) {
    sections.push(`Mode-specific Instructions:\n${modeCustomInstructions.trim()}`)
  }

  // Add rules - include both mode-specific and generic rules if they exist
  const rules: string[] = []

  // Add mode-specific rules first if they exist
  if (modeRuleContent && modeRuleContent.trim()) {
    if (usedRuleFile.includes(path.join('.roo', `rules-${mode}`))) {
      rules.push(modeRuleContent.trim())
    } else {
      rules.push(`# Rules from ${usedRuleFile}:\n${modeRuleContent}`)
    }
  }

  if (options.IgnoreInstructions) {
    rules.push(options.IgnoreInstructions)
  }

  if (rules.length > 0) {
    sections.push(`Rules:\n\n${rules.join('\n\n')}`)
  }

  const joinedSections = sections.join('\n\n')

  return joinedSections
    ? `
            ====

            USER'S CUSTOM INSTRUCTIONS

            The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

            ${joinedSections}
        `
    : ''
}
