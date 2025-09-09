import Database from 'better-sqlite3-multiple-ciphers'

export abstract class BaseTable {
  protected db: Database.Database
  protected tableName: string

  constructor(db: Database.Database, tableName: string) {
    this.db = db
    this.tableName = tableName
  }

  // 获取表创建SQL
  abstract getCreateTableSQL(): string

  // 获取表升级SQL (如果有的话)
  abstract getMigrationSQL?(version: number): string | null

  // 获取最新的迁移版本号
  abstract getLatestVersion(): number

  // 检查表是否存在
  protected tableExists(): boolean {
    const result = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(this.tableName) as { name: string } | undefined

    return !!result
  }

  // 执行表创建
  public createTable(): void {
    if (!this.tableExists()) {
      this.db.exec(this.getCreateTableSQL())
    }
  }
}
