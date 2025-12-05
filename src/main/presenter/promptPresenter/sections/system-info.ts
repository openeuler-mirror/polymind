import os from 'os'
import osName from 'os-name'

export function getSystemInfoSection(): string {
  return `
====

SYSTEM INFORMATION

Operating System: ${osName()}  
System Arch: ${os.arch()}  
User: ${os.userInfo().username}  
Home Directory: ${os.homedir()}  
`
}
