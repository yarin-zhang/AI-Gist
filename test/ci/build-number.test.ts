import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// scripts/version.js is CommonJS build tooling, not part of the app bundle.
const { getVersionInfo, computeVersionCode } = createRequire(import.meta.url)(
  resolve(process.cwd(), 'scripts/version.js'),
)

const releaseWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/build-release.yml'),
  'utf8',
)

const iosWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/build-ios-mobile.yml'),
  'utf8',
)

describe('Apple build numbers', () => {
  it('gives iOS the per-marketing-version revision', () => {
    const { buildRevision, buildNumber } = getVersionInfo()

    expect(buildNumber).toBe(buildRevision)
  })

  // App Store Connect compares a Mac build's CFBundleVersion against the
  // highest value the app has *ever* uploaded, not against the current
  // marketing version's train. buildRevision restarts at 1 every release, so
  // using it for Mac is rejected with 90061 once any earlier upload used a
  // larger number (the old run_number scheme reached 150).
  it('gives Mac App Store a globally monotonic build number', () => {
    const { macBuildNumber, versionCode } = getVersionInfo()

    expect(macBuildNumber).toBe(versionCode)
    expect(macBuildNumber).toBeGreaterThan(150)
  })

  it('keeps the Mac build number increasing across marketing versions', () => {
    const ordered = [
      computeVersionCode('2.1.1', 1),
      computeVersionCode('2.1.1', 2),
      computeVersionCode('2.1.2', 1),
      computeVersionCode('2.2.0', 1),
      computeVersionCode('3.0.0', 1),
    ]

    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]).toBeGreaterThan(ordered[index - 1])
    }
  })
})

describe('workflows read the right build number', () => {
  it('builds the Mac App Store package with --mac-build', () => {
    expect(releaseWorkflow).toContain(
      'BUILD_NUMBER=$(node scripts/version.js --mac-build)',
    )
    expect(releaseWorkflow).toContain('--config.buildVersion="$BUILD_NUMBER"')
  })

  it('archives iOS with the per-version --build revision', () => {
    expect(iosWorkflow).toContain('BUILD_NUMBER=$(node scripts/version.js --build)')
    expect(iosWorkflow).toContain('CURRENT_PROJECT_VERSION="$BUILD_NUMBER"')
  })
})
