import { createLatestRunner } from '../latest-runner'

describe('createLatestRunner', () => {
  it('skips a non-force call while another run is in flight', async () => {
    const runner = createLatestRunner()
    let releaseFirst!: () => void
    const gate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const calls: string[] = []

    const first = runner.run(false, async isLatest => {
      await gate
      if (isLatest()) calls.push('first')
    })
    const second = runner.run(false, async () => {
      calls.push('second-should-not-run')
    })

    await Promise.resolve()
    releaseFirst()
    await first
    await second

    expect(calls).toEqual(['first'])
    expect(runner.isInFlight()).toBe(false)
  })

  it('lets a force run supersede a poll and discards the stale result', async () => {
    const runner = createLatestRunner()
    let releasePoll!: () => void
    const pollGate = new Promise<void>(resolve => {
      releasePoll = resolve
    })
    const writes: string[] = []

    const poll = runner.run(false, async isLatest => {
      await pollGate
      if (isLatest()) writes.push('poll')
    })
    const force = runner.run(true, async isLatest => {
      if (isLatest()) writes.push('force')
    })

    releasePoll()
    await poll
    await force

    expect(writes).toEqual(['force'])
    expect(runner.isInFlight()).toBe(false)
  })

  it('keeps the in-flight flag until the latest run settles', async () => {
    const runner = createLatestRunner()
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })

    const run = runner.run(true, async () => {
      await gate
    })
    expect(runner.isInFlight()).toBe(true)

    release()
    await run
    expect(runner.isInFlight()).toBe(false)
  })
})
