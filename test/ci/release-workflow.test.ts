import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/build-release.yml'),
  'utf8',
)

/**
 * Keep assertions scoped to one job. This prevents a stale string in another
 * job (for example a Windows summary) from satisfying the release contract.
 * Comments are removed so explanatory text cannot masquerade as configuration.
 */
function jobSource(jobId: string): string {
  const start = workflow.indexOf(`\n  ${jobId}:\n`)
  expect(start, `job ${jobId} not found`).toBeGreaterThan(-1)

  const rest = workflow.slice(start + 1)
  const nextJob = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  const block = nextJob === -1 ? rest : rest.slice(0, nextJob)

  return block
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n')
}

describe('release workflow trigger contract', () => {
  it('publishes automatically only for version tags', () => {
    expect(workflow).toContain("tags:\n      - 'v*.*.*'")
    expect(workflow).not.toContain('branches:\n      - main')
  })

  it('derives the release version from the pushed tag', () => {
    expect(workflow).toContain('TAG_VERSION: ${{ github.ref_name }}')
    expect(workflow).toContain('if [[ "$EVENT_NAME" == "push" ]]; then')
    expect(workflow).toContain('VERSION="$TAG_VERSION"')
  })

  it('keeps manual release runs read-only with respect to tags', () => {
    const versionIndex = workflow.indexOf('- name: Get version')
    const tagCheckIndex = workflow.indexOf('- name: Verify manual release tag exists')
    const releaseIndex = workflow.indexOf('- name: Create Draft Release')

    expect(workflow).toContain('Verify manual release tag exists')
    expect(workflow).toContain('git ls-remote --exit-code --tags origin')
    expect(workflow).toContain('no tag will be created or pushed')
    expect(workflow).not.toMatch(/^\s+git (?:tag|push)\b/m)
    expect(versionIndex).toBeLessThan(tagCheckIndex)
    expect(tagCheckIndex).toBeLessThan(releaseIndex)
  })

  it('binds a manual release to the commit referenced by its remote tag', () => {
    expect(workflow).toContain('refs/tags/$RELEASE_VERSION^{}')
    expect(workflow).toContain('CHECKOUT_SHA=$(git rev-parse HEAD)')
    expect(workflow).toContain('[[ "$REMOTE_TAG_SHA" != "$CHECKOUT_SHA" ]]')
    expect(workflow).toContain('Tag $RELEASE_VERSION points to $REMOTE_TAG_SHA')
    expect(workflow).toContain('Dispatch the workflow from the tagged commit.')
  })

  it('does not let store-only dispatches enter the release job', () => {
    expect(workflow).toContain("github.event.inputs.version != 'store'")
    expect(workflow).toContain("github.event.inputs.version != 'mac-store'")
    expect(workflow).toContain("github.event.inputs.version != 'linux-store'")
    expect(workflow).toContain("github.event.inputs.version != 'linux-store-build'")
  })
})

describe('release notes stay hand-editable', () => {
  it('skips creating an existing Release while preserving its notes', () => {
    const createRelease = jobSource('create-release')
    const guardIndex = createRelease.indexOf('- name: Check for an existing release')
    const createIndex = createRelease.indexOf('- name: Create Draft Release')

    expect(createRelease).toMatch(/id: existing_release\n/)
    expect(createRelease).toMatch(/if: steps\.existing_release\.outputs\.exists == 'false'/)
    expect(guardIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(createIndex)
  })

  it('exposes version and creation decision to downstream jobs', () => {
    const createRelease = jobSource('create-release')

    expect(createRelease).toMatch(
      /outputs:\n\s+version: \$\{\{ steps\.get_version\.outputs\.version \}\}\n\s+release_created: \$\{\{ steps\.existing_release\.outputs\.exists == 'false' \}\}/,
    )
    expect(createRelease).toMatch(/RELEASE_VERSION: \$\{\{ steps\.get_version\.outputs\.version \}\}/)
  })

  it('uses only generated notes for a newly created Release', () => {
    const createRelease = jobSource('create-release')

    expect(createRelease).toMatch(/generate_release_notes: true/)
    expect(createRelease).not.toMatch(/^\s+body:/m)
    expect(createRelease).not.toMatch(/SmartScreen/)
    expect(createRelease).not.toMatch(/xattr -cr/)
    expect(createRelease).not.toMatch(/libfuse2/)
  })
})

describe('release assets stay installer-only', () => {
  it('lets a successful create job resume an existing Release', () => {
    for (const jobId of ['build-mac', 'build-windows', 'build-linux', 'build-android']) {
      const source = jobSource(jobId)
      expect(source, `${jobId} must be gated by create-release`).toMatch(
        /needs: create-release\n\s+if: needs\.create-release\.result == 'success'/,
      )
    }
  })

  it('resumes partial runs by uploading only missing installer assets', () => {
    for (const jobId of ['build-mac', 'build-windows', 'build-linux', 'build-android']) {
      const source = jobSource(jobId)
      const viewIndex = source.indexOf('gh release view')
      const uploadIndex = source.indexOf('gh release upload')

      expect(source, `${jobId} must inspect existing assets`).toContain('--json assets')
      expect(source, `${jobId} must inspect before uploading`).toMatch(/Skipping existing Release asset/)
      expect(source, `${jobId} must not overwrite existing assets`).not.toContain('--clobber')
      expect(viewIndex).toBeGreaterThan(-1)
      expect(uploadIndex).toBeGreaterThan(viewIndex)
    }
  })

  it('builds locally without electron-builder publishing metadata implicitly', () => {
    expect(jobSource('build-mac')).toContain('--publish never')
    expect(jobSource('build-linux')).toContain('--publish never')
  })

  it('prunes updater metadata after every platform has published', () => {
    const prune = jobSource('prune-release-assets')

    expect(prune).toMatch(/needs: \[create-release, build-mac, build-windows, build-linux, build-android\]/)
    expect(prune).toMatch(/if: always\(\) && needs\.create-release\.result == 'success'/)
    expect(prune).toMatch(/needs\.create-release\.outputs\.release_created == 'true'/)
    expect(prune).toMatch(/latest\*\.yml\|\*\.blockmap\)/)
    expect(prune).toMatch(/gh release delete-asset/)
  })

  it('does not run release jobs for store-only dispatches', () => {
    const createRelease = jobSource('create-release')
    const exclusion =
      "github.event.inputs.version != 'store' && github.event.inputs.version != 'mac-store' && github.event.inputs.version != 'linux-store-build' && github.event.inputs.version != 'linux-store'"

    expect(createRelease).toContain(exclusion)
    expect(createRelease).toMatch(/if: github\.event_name != 'workflow_dispatch' \|\| \(/)

    for (const jobId of ['build-mac', 'build-windows', 'build-linux', 'build-android', 'prune-release-assets']) {
      expect(jobSource(jobId), `${jobId} must depend on create-release`).toContain('create-release')
    }
  })
})
