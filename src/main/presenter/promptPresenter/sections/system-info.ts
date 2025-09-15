import os from 'os'
import osName from 'os-name'

export function getSystemInfoSection(cwd: string): string {
  let details = `====
f
SYSTEM INFORMATION

Operating System: ${osName()}
System Arch: ${os.arch()}
Home Directory: ${os.homedir()}
Current Workspace Directory: ${cwd}

`
  return details
}
